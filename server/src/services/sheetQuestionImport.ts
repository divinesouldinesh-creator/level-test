import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import type { ParsedQuestion } from "./wordImport.js";
import { parseNumericInput, parseQuestionType } from "./questionAnswer.js";
import { extractXlsxEmbeddedImages, pickImageForRow } from "./xlsxSheetImages.js";

const DIAGRAM_HEADERS = new Set(["diagram", "image", "figure", "picture", "stemimage", "stemimageurl", "img"]);
const DISPIMG_RE = /DISPIMG\s*\(\s*"([^"]+)"/i;

function normHeader(s: string) {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "");
}

function letterIndex(answer: string): number | null {
  const letter = answer.trim().toUpperCase()[0] ?? "";
  const idx = letter.charCodeAt(0) - 65;
  if (idx < 0 || idx > 3) return null;
  return idx;
}

function asPublicImageUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("/uploads/")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

function dispImgId(raw: string): string | null {
  return raw.match(DISPIMG_RE)?.[1] ?? null;
}

function cellRaw(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })] as { f?: unknown; v?: unknown; w?: unknown } | undefined;
  if (!cell) return "";
  return [cell.f, cell.v, cell.w].filter((x) => x != null && String(x).trim()).map((x) => String(x)).join(" ");
}

function saveQuestionImage(destDir: string, buf: Buffer, ext: string): string {
  fs.mkdirSync(destDir, { recursive: true });
  const safe = ext === "jpeg" ? "jpg" : ext;
  const filename = `${randomUUID()}.${safe}`;
  fs.writeFileSync(path.join(destDir, filename), buf);
  return `/uploads/questions/${filename}`;
}

function questionFromMapped(
  mapped: Map<string, string>,
  rowLabel: string
): ParsedQuestion {
  const stem = mapped.get("question") ?? mapped.get("stem") ?? "";
  const optionA = mapped.get("optiona") ?? mapped.get("a") ?? "";
  const optionB = mapped.get("optionb") ?? mapped.get("b") ?? "";
  const optionC = mapped.get("optionc") ?? mapped.get("c") ?? "";
  const optionD = mapped.get("optiond") ?? mapped.get("d") ?? "";
  const answerOriginal = (mapped.get("answer") ?? "").trim();
  const typeRaw = mapped.get("type") ?? mapped.get("questiontype") ?? "";
  if (!stem || !answerOriginal) {
    throw new Error(`${rowLabel}: question and answer are required`);
  }
  const diffRaw = (mapped.get("difficulty") ?? "").trim().toUpperCase();
  const difficulty: "EASY" | "MEDIUM" | "HARD" | undefined =
    diffRaw === "EASY" || diffRaw === "E"
      ? "EASY"
      : diffRaw === "HARD" || diffRaw === "H"
        ? "HARD"
        : diffRaw === "MEDIUM" || diffRaw === "M"
          ? "MEDIUM"
          : undefined;
  const declared = parseQuestionType(typeRaw);
  const numeric = parseNumericInput(answerOriginal);
  const letter = letterIndex(answerOriginal);
  const inferred =
    declared ??
    (numeric != null && !optionA && !optionB && !optionC && !optionD
      ? "NUMERIC"
      : optionA && optionB && !optionC && !optionD && letter != null && letter <= 1
        ? "MCQ2"
        : "MCQ");
  const tolerance = parseNumericInput(mapped.get("tolerance") ?? mapped.get("tol") ?? "") ?? 0;
  if (inferred === "NUMERIC") {
    if (numeric == null) throw new Error(`${rowLabel}: numeric answer required`);
    return {
      type: "NUMERIC",
      stem,
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctOption: 0,
      correctNumeric: numeric,
      numericTolerance: Math.max(0, tolerance),
      difficulty,
    };
  }
  if (inferred === "MCQ2") {
    if (!optionA || !optionB) throw new Error(`${rowLabel}: optionA and optionB are required`);
    if (letter == null || letter > 1) throw new Error(`${rowLabel}: answer must be A or B`);
    return {
      type: "MCQ2",
      stem,
      optionA,
      optionB,
      optionC: "",
      optionD: "",
      correctOption: letter,
      correctNumeric: null,
      numericTolerance: 0,
      difficulty,
    };
  }
  if (!optionA || !optionB || !optionC || !optionD) {
    throw new Error(`${rowLabel}: question, optionA-D and answer are required`);
  }
  if (letter == null) throw new Error(`${rowLabel}: answer must be A/B/C/D`);
  return {
    type: "MCQ",
    stem,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption: letter,
    correctNumeric: null,
    numericTolerance: 0,
    difficulty,
  };
}

function cellText(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })] as { v?: unknown; w?: unknown } | undefined;
  if (!cell) return "";
  if (cell.w != null && String(cell.w).trim()) return String(cell.w).trim();
  if (cell.v == null) return "";
  return String(cell.v).trim();
}

function rowMapped(sheet: XLSX.WorkSheet, r: number, headers: string[], originCol: number): Map<string, string> {
  const mapped = new Map<string, string>();
  for (let i = 0; i < headers.length; i++) {
    if (headers[i]) mapped.set(headers[i], cellText(sheet, r, originCol + i));
  }
  return mapped;
}

function isQuestionHeaderRow(headers: string[]) {
  const hasQuestion = headers.includes("question") || headers.includes("stem");
  const hasAnswer = headers.includes("answer");
  return hasQuestion && hasAnswer;
}

export function parseQuestionSheetBuffer(buf: Buffer): ParsedQuestion[] {
  return parseQuestionSheetRows(buf).questions;
}

function parseQuestionSheetRows(buf: Buffer): {
  questions: ParsedQuestion[];
  excelRows: number[];
  sheet: XLSX.WorkSheet;
  diagramCol: number | null;
} {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", cellNF: false, cellHTML: false });
  } catch {
    throw new Error("Could not read this Excel file. Save it as .xlsx and try again.");
  }
  if (!wb.SheetNames.length) throw new Error("Empty workbook");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet["!ref"]) throw new Error("No valid question rows found in file");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const originCol = range.s.c;
  let headerRow = range.s.r;
  let headers: string[] = [];
  const scanTo = Math.min(range.e.r, range.s.r + 15);
  for (let r = range.s.r; r <= scanTo; r++) {
    const candidate: string[] = [];
    for (let c = originCol; c <= range.e.c; c++) candidate.push(normHeader(cellText(sheet, r, c)));
    if (isQuestionHeaderRow(candidate)) {
      headerRow = r;
      headers = candidate;
      break;
    }
  }
  if (!isQuestionHeaderRow(headers)) {
    throw new Error("Excel must have a header row with question and answer columns.");
  }
  const diagramColIdx = headers.findIndex((h) => DIAGRAM_HEADERS.has(h));
  const questions: ParsedQuestion[] = [];
  const excelRows: number[] = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const mapped = rowMapped(sheet, r, headers, originCol);
    const stem = mapped.get("question") ?? mapped.get("stem") ?? "";
    const optionA = mapped.get("optiona") ?? mapped.get("a") ?? "";
    const optionB = mapped.get("optionb") ?? mapped.get("b") ?? "";
    const optionC = mapped.get("optionc") ?? mapped.get("c") ?? "";
    const optionD = mapped.get("optiond") ?? mapped.get("d") ?? "";
    const answerOriginal = (mapped.get("answer") ?? "").trim();
    const typeRaw = mapped.get("type") ?? mapped.get("questiontype") ?? "";
    if (!stem && !optionA && !optionB && !optionC && !optionD && !answerOriginal && !typeRaw) continue;
    if (!stem || !answerOriginal) continue;
    try {
      questions.push(questionFromMapped(mapped, `Row ${r + 1}`));
      excelRows.push(r);
    } catch {
      continue;
    }
  }
  if (!questions.length) throw new Error("No valid question rows found in file");
  return { questions, excelRows, sheet, diagramCol: diagramColIdx >= 0 ? originCol + diagramColIdx : null };
}

export async function parseQuestionSheetWithImages(
  buf: Buffer,
  questionsUploadDir: string
): Promise<{ questions: ParsedQuestion[]; imagesAttached: number }> {
  const { questions, excelRows, sheet, diagramCol } = parseQuestionSheetRows(buf);
  let extracted = { positioned: [], byName: new Map() } as Awaited<ReturnType<typeof extractXlsxEmbeddedImages>>;
  try {
    extracted = await extractXlsxEmbeddedImages(buf);
  } catch {
    extracted = { positioned: [], byName: new Map() };
  }
  let imagesAttached = 0;
  for (let i = 0; i < questions.length; i++) {
    const row = excelRows[i];
    let chosen = pickImageForRow(row, diagramCol, extracted.positioned);
    if (!chosen && diagramCol != null) {
      const raw = cellRaw(sheet, row, diagramCol);
      const id = dispImgId(raw);
      const named = id ? extracted.byName.get(id) : undefined;
      if (named) chosen = { row, col: diagramCol, buffer: named.buffer, ext: named.ext, name: id ?? undefined };
      else {
        const url = asPublicImageUrl(raw);
        if (url) {
          questions[i] = { ...questions[i], stemImageUrl: url };
          imagesAttached++;
          continue;
        }
      }
    }
    if (!chosen) {
      const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { s: { c: 0, r: 0 }, e: { c: 40, r: row } };
      for (let c = range.s.c; c <= range.e.c; c++) {
        const id = dispImgId(cellRaw(sheet, row, c));
        const named = id ? extracted.byName.get(id) : undefined;
        if (named) {
          chosen = { row, col: c, buffer: named.buffer, ext: named.ext, name: id ?? undefined };
          break;
        }
      }
    }
    if (!chosen) continue;
    try {
      questions[i] = {
        ...questions[i],
        stemImageUrl: saveQuestionImage(questionsUploadDir, chosen.buffer, chosen.ext),
      };
      imagesAttached++;
    } catch {
      continue;
    }
  }
  return { questions, imagesAttached };
}
