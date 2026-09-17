import mammoth from "mammoth";
import type { Difficulty, QuestionType } from "@prisma/client";
import { parseNumericInput, parseQuestionType } from "./questionAnswer.js";

export type ParsedQuestion = {
  type: QuestionType;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  correctNumeric: number | null;
  numericTolerance: number;
  difficulty?: Difficulty;
};

const DEVANAGARI_DIGIT_TO_ASCII: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

const HINDI_OPTION_LETTER_TO_LATIN: Record<string, "A" | "B" | "C" | "D"> = {
  "क": "A",
  "ख": "B",
  "ग": "C",
  "घ": "D",
  "अ": "A",
  "ब": "B",
  "स": "C",
  "द": "D",
};

function devanagariDigitsToAscii(input: string): string {
  return input.replace(/[०-९]/g, (c) => DEVANAGARI_DIGIT_TO_ASCII[c] ?? c);
}

function optionLetterToIndex(token: string): number | null {
  const ascii = HINDI_OPTION_LETTER_TO_LATIN[token];
  if (ascii) return ascii.charCodeAt(0) - 65;
  const u = token.toUpperCase();
  if (u >= "A" && u <= "D") return u.charCodeAt(0) - 65;
  return null;
}

const OPTION_TOKEN_CLASS = "[A-Da-dकखगघअबसद]";
const ANSWER_LABEL_RE =
  /^\s*(?:Correct\s+Answer|Correct\s+Ans|Answer|Ans|Correct|उत्तर|सही\s+उत्तर|जवाब)\s*[:=\-–]?\s*(.+)$/i;
const TYPE_LABEL_RE = /^\s*(?:Type|Question\s*Type|Kind|प्रकार)\s*[:=\-–]?\s*(.+)$/i;
const TOLERANCE_LABEL_RE = /^\s*(?:Tolerance|Tol)\s*[:=\-–]?\s*(.+)$/i;
const STEM_PREFIX_RE =
  /^\s*(?:Q\d+|Question\s*\d+|प्रश्न\s*\d+|प्र\.?\s*\d+|\d+)[\.\)\:\-–]\s+(.+)$/i;
const OPTION_LINE_RE = new RegExp(
  String.raw`^\s*\(?\s*(${OPTION_TOKEN_CLASS})\s*[\)\.\:\-–]\s+(.+)$`
);

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function splitInlineOptions(line: string): string[] | null {
  const re = new RegExp(
    String.raw`(^|\s)\(?\s*(${OPTION_TOKEN_CLASS})\s*[\)\.\:\-–]\s+`,
    "g"
  );
  const matches: { start: number; markerEnd: number; letter: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const leadingSpace = m[1].length;
    const start = m.index + leadingSpace;
    const markerEnd = m.index + m[0].length;
    matches.push({ start, markerEnd, letter: m[2] });
  }
  if (matches.length < 2) return null;
  const distinct = new Set(matches.map((x) => optionLetterToIndex(x.letter)));
  distinct.delete(null as unknown as number);
  if (distinct.size < 2) return null;
  const out: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const segStart = matches[i].start;
    const segEnd = i + 1 < matches.length ? matches[i + 1].start : line.length;
    out.push(line.slice(segStart, segEnd).trim());
  }
  return out;
}

function parseAnswerValue(raw: string): { letter: number | null; numeric: number | null } {
  const trimmed = raw.trim();
  const wrapped = trimmed.match(/^\(?\s*([A-Da-dकखगघअबसद])\s*\)?\.?$/);
  if (wrapped) {
    const idx = optionLetterToIndex(wrapped[1]);
    if (idx != null) return { letter: idx, numeric: null };
  }
  const numeric = parseNumericInput(devanagariDigitsToAscii(trimmed));
  return { letter: null, numeric };
}

/**
 * Parse a free-form text blob containing one or more questions into structured records.
 *
 * MCQ (4 options), MCQ2 (A/B only), and NUMERIC (typed number) are supported.
 *
 *   Q1. <stem>
 *   A) <opt>
 *   B) <opt>
 *   C) <opt>
 *   D) <opt>
 *   Answer: B
 *
 *   Q2. Water boils at 100°C.
 *   A) True
 *   B) False
 *   Answer: A
 *
 *   Q3. 7 × 8 = ?
 *   Type: NUMERIC
 *   Answer: 56
 */
export function parseQuestionBlocks(text: string): ParsedQuestion[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n\s*\n+/);
  const out: ParsedQuestion[] = [];

  for (const block of blocks) {
    const rawLines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (/^[_\-=\s]{5,}$/.test(l)) return false;
        return true;
      });
    if (rawLines.length < 2) continue;

    const lines: string[] = [];
    for (const line of rawLines) {
      const inline = splitInlineOptions(line);
      if (inline) lines.push(...inline);
      else lines.push(line);
    }

    const options: string[] = ["", "", "", ""];
    let correct: number | null = null;
    let correctNumeric: number | null = null;
    let numericTolerance = 0;
    let declaredType: QuestionType | null = null;
    const stemFragments: string[] = [];

    for (const line of lines) {
      const typeMatch = line.match(TYPE_LABEL_RE);
      if (typeMatch) {
        const parsed = parseQuestionType(typeMatch[1]);
        if (parsed) {
          declaredType = parsed;
          continue;
        }
      }
      const tolMatch = line.match(TOLERANCE_LABEL_RE);
      if (tolMatch) {
        const n = parseNumericInput(tolMatch[1]);
        if (n != null && n >= 0) numericTolerance = n;
        continue;
      }
      const ans = line.match(ANSWER_LABEL_RE);
      if (ans) {
        const parsed = parseAnswerValue(ans[1]);
        if (parsed.letter != null) correct = parsed.letter;
        if (parsed.numeric != null) correctNumeric = parsed.numeric;
        continue;
      }
      const opt = line.match(OPTION_LINE_RE);
      if (opt) {
        const idx = optionLetterToIndex(opt[1]);
        if (idx != null && idx >= 0 && idx < 4) {
          options[idx] = normalizeWhitespace(opt[2]);
          continue;
        }
      }
      const prefixed = devanagariDigitsToAscii(line).match(STEM_PREFIX_RE);
      if (prefixed) {
        stemFragments.push(prefixed[1].trim());
        continue;
      }
      stemFragments.push(line);
    }

    const stem = stemFragments.length ? normalizeWhitespace(stemFragments.join(" ")) : "";
    if (!stem) continue;

    const filled = options.map((o) => Boolean(o));
    const fourOptions = filled[0] && filled[1] && filled[2] && filled[3];
    const twoOptions = filled[0] && filled[1] && !filled[2] && !filled[3];

    if (declaredType === "NUMERIC" || (!declaredType && !filled.some(Boolean) && correctNumeric != null)) {
      if (correctNumeric == null) continue;
      out.push({
        type: "NUMERIC",
        stem,
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        correctOption: 0,
        correctNumeric,
        numericTolerance,
      });
      continue;
    }

    if (declaredType === "MCQ2" || (!declaredType && twoOptions && correct != null && correct <= 1)) {
      if (!filled[0] || !filled[1] || correct == null || correct > 1) continue;
      out.push({
        type: "MCQ2",
        stem,
        optionA: options[0],
        optionB: options[1],
        optionC: "",
        optionD: "",
        correctOption: correct,
        correctNumeric: null,
        numericTolerance: 0,
      });
      continue;
    }

    if (fourOptions && correct != null && correct >= 0 && correct < 4) {
      out.push({
        type: "MCQ",
        stem,
        optionA: options[0],
        optionB: options[1],
        optionC: options[2],
        optionD: options[3],
        correctOption: correct,
        correctNumeric: null,
        numericTolerance: 0,
      });
    }
  }

  return out;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export function parseDifficulty(s: string | undefined): Difficulty {
  const u = (s ?? "").toUpperCase();
  if (u === "EASY" || u === "E") return "EASY";
  if (u === "HARD" || u === "H") return "HARD";
  return "MEDIUM";
}
