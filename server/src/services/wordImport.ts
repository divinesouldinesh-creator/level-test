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
  stemImageUrl?: string | null;
};

export type ParseQuestionDocumentResult = {
  questions: ParsedQuestion[];
  warnings: string[];
  blockCount: number;
};

type KeyAnswer = { kind: "letter"; index: number } | { kind: "numeric"; value: number };

type Draft = {
  number: number | null;
  stemParts: string[];
  options: [string, string, string, string];
  correct: number | null;
  correctNumeric: number | null;
  numericTolerance: number;
  declaredType: QuestionType | null;
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
  क: "A",
  ख: "B",
  ग: "C",
  घ: "D",
  अ: "A",
  ब: "B",
  स: "C",
  द: "D",
};

const OPTION_TOKEN = String.raw`(?:[A-Da-dकखगघअबसद]|iv|iii|ii|i|IV|III|II|I|[1-4१-४])`;
const KEY_HEADING_RE =
  /^\s*(?:answer\s*keys?|keys?\s*answers?|answers?(?:\s*key)?|उत्तर(?:\s*कुंजी)?|सही\s*उत्तर(?:\s*कुंजी)?)\s*:?\s*(.*)$/i;
const ANSWER_LABEL_RE =
  /^\s*(?:Correct\s+(?:Answer|Ans|Option)|Answer|Ans\.?|Correct|उत्तर|सही\s+उत्तर|जवाब)\s*[:=\-–.]?\s*(.+)$/i;
const TYPE_LABEL_RE = /^\s*(?:Type|Question\s*Type|Kind|प्रकार)\s*[:=\-–]?\s*(.+)$/i;
const TOLERANCE_LABEL_RE = /^\s*(?:Tolerance|Tol)\s*[:=\-–]?\s*(.+)$/i;
const QUESTION_START_RE =
  /^\s*(?:Q\.?\s*|Question\s+|प्रश्न\s+|प्र\.?\s*)?(\d{1,3})\s*[\.\)\:\-–]\s*(.*)$/i;
const OPTION_LINE_RE = new RegExp(String.raw`^\s*[\(\[]?\s*(${OPTION_TOKEN})\s*[\)\]]?\s*[.)\:\-–]\s*(.+)$`, "i");
const OPTION_WRAPPED_RE = new RegExp(String.raw`^\s*[\(\[]\s*(${OPTION_TOKEN})\s*[\)\]]\s*(.+)$`, "i");
const KEY_LETTER_PAIR_RE = new RegExp(
  String.raw`(?<![(\[\d])(\d{1,3})(?:\s*[.)\-:]+\s*|\s+)(?:\(?\s*(${OPTION_TOKEN})\s*\)?)(?=\s|$|[,;/])`,
  "gi"
);
const KEY_NUMERIC_PAIR_RE = new RegExp(
  String.raw`(?<![(\[\d])(\d{1,3})\s*[.)\-:]+\s*\(?\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)?(?=\s|$|[,;/])`,
  "gi"
);

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

function optionTokenToIndex(token: string): number | null {
  const letter = optionLetterToIndex(token);
  if (letter != null) return letter;
  const t = devanagariDigitsToAscii(token).trim().toLowerCase();
  if (t === "1" || t === "i") return 0;
  if (t === "2" || t === "ii") return 1;
  if (t === "3" || t === "iii") return 2;
  if (t === "4" || t === "iv") return 3;
  return null;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function htmlToPlainText(html: string): string {
  const numbered = html.replace(/<ol\b[^>]*>[\s\S]*?<\/ol>/gi, (block) => {
    let n = 0;
    return block.replace(/<li\b[^>]*>/gi, () => `\n${++n}. `);
  });
  const withBreaks = numbered
    .replace(/<\/(p|div|h[1-6]|tr|table|li|blockquote|ul)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitInlineOptions(line: string): string[] | null {
  const re = new RegExp(String.raw`(^|\s)(?:[\(\[]\s*(${OPTION_TOKEN})\s*[\)\]]|(${OPTION_TOKEN})\s*[.)\:\-–])\s+`, "gi");
  const matches: { start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const leadingSpace = m[1].length;
    matches.push({ start: m.index + leadingSpace });
  }
  if (matches.length < 2) return null;
  const out: string[] = [];
  const prefix = line.slice(0, matches[0].start).trim();
  if (prefix) out.push(prefix);
  for (let i = 0; i < matches.length; i++) {
    const segEnd = i + 1 < matches.length ? matches[i + 1].start : line.length;
    out.push(line.slice(matches[i].start, segEnd).trim());
  }
  return out;
}

function parseAnswerValue(raw: string): { letter: number | null; numeric: number | null } {
  const trimmed = raw.trim();
  const wrapped = trimmed.match(new RegExp(String.raw`^[\(\[]?\s*(${OPTION_TOKEN})\s*[\)\]]?\.?$`, "i"));
  if (wrapped) {
    const idx = optionTokenToIndex(wrapped[1]);
    if (idx != null) return { letter: idx, numeric: null };
  }
  const numeric = parseNumericInput(devanagariDigitsToAscii(trimmed));
  return { letter: null, numeric };
}

function matchOptionLine(line: string): { index: number; text: string } | null {
  const m = line.match(OPTION_LINE_RE) || line.match(OPTION_WRAPPED_RE);
  if (!m) return null;
  const idx = optionTokenToIndex(m[1]);
  if (idx == null) return null;
  const text = normalizeWhitespace(m[2] ?? "");
  if (!text) return null;
  return { index: idx, text };
}

function isNumericOptionToken(token: string): boolean {
  return /^[1-4१-४]$/.test(devanagariDigitsToAscii(token).trim());
}

function looksLikeNumberedOption(draft: Draft | null, index: number, rawToken: string): boolean {
  if (!draft) return false;
  if (!isNumericOptionToken(rawToken) && !/^(i|ii|iii|iv)$/i.test(rawToken.trim())) return true;
  if (index < 0 || index > 3) return false;
  const filled = draft.options.filter(Boolean).length;
  if (filled === 0) return index === 0 && normalizeWhitespace(draft.stemParts.join(" ")).length > 0;
  return !draft.options[index];
}

function keyPairMatches(line: string): { raw: string; n: number; answer: string; letter: boolean }[] {
  const trimmed = line.trim();
  const out: { raw: string; n: number; answer: string; letter: boolean }[] = [];
  const seen = new Set<number>();
  const add = (raw: string, num: string, answer: string, letter: boolean) => {
    const n = Number(devanagariDigitsToAscii(num));
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) return;
    seen.add(n);
    out.push({ raw, n, answer, letter });
  };
  let m: RegExpExecArray | null;
  const letterRe = new RegExp(KEY_LETTER_PAIR_RE.source, "gi");
  while ((m = letterRe.exec(trimmed)) !== null) {
    add(m[0], m[1], m[2], true);
  }
  const numRe = new RegExp(KEY_NUMERIC_PAIR_RE.source, "gi");
  while ((m = numRe.exec(trimmed)) !== null) {
    if (optionTokenToIndex(m[2]) != null) continue;
    add(m[0], m[1], m[2], false);
  }
  return out;
}

function countKeyPairs(line: string): number {
  return keyPairMatches(line).length;
}

function isKeyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const pairs = keyPairMatches(trimmed);
  if (!pairs.length) return false;
  let rest = trimmed;
  for (const p of pairs) rest = rest.replace(p.raw, " ");
  rest = rest.replace(/[,;|/.\-–:\s()[\]]+/g, "");
  return rest.length === 0;
}

function letterKeyPairCount(line: string): number {
  return keyPairMatches(line).filter((p) => p.letter).length;
}

function parseKeyLines(lines: string[]): Map<number, KeyAnswer> {
  const map = new Map<number, KeyAnswer>();
  for (const line of lines) {
    for (const p of keyPairMatches(line)) {
      if (p.letter) {
        const idx = optionTokenToIndex(p.answer);
        if (idx != null) map.set(p.n, { kind: "letter", index: idx });
        continue;
      }
      const numeric = parseNumericInput(devanagariDigitsToAscii(p.answer));
      if (numeric != null) map.set(p.n, { kind: "numeric", value: numeric });
    }
  }
  return map;
}

function isStandaloneKeyLine(line: string): boolean {
  if (!isKeyLine(line)) return false;
  return countKeyPairs(line) >= 2;
}

function matchKeyHeading(line: string): { rest: string } | null {
  const m = line.match(KEY_HEADING_RE);
  if (!m) return null;
  const rest = (m[1] ?? "").trim();
  if (!rest || isKeyLine(rest) || countKeyPairs(rest) >= 2) return { rest };
  return null;
}

function splitBodyAndKey(text: string): { body: string; key: Map<number, KeyAnswer> } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const headingAt = lines.findIndex((l) => matchKeyHeading(l.trim()));
  if (headingAt >= 0) {
    const heading = matchKeyHeading(lines[headingAt].trim())!;
    const key = parseKeyLines([heading.rest, ...lines.slice(headingAt + 1)]);
    return { body: lines.slice(0, headingAt).join("\n"), key };
  }

  let i = lines.length - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  let keyStart = lines.length;
  let pairCount = 0;
  let letterPairs = 0;
  let multiPairLines = 0;
  while (i >= 0) {
    const line = lines[i].trim();
    if (!line) {
      i--;
      continue;
    }
    if (isKeyLine(line)) {
      keyStart = i;
      const n = countKeyPairs(line);
      pairCount += n;
      letterPairs += letterKeyPairCount(line);
      if (n >= 2) multiPairLines += 1;
      i--;
      continue;
    }
    break;
  }
  if (pairCount >= 2 && (letterPairs >= 2 || multiPairLines >= 1 || letterPairs >= 1 && pairCount >= 3)) {
    return {
      body: lines.slice(0, keyStart).join("\n"),
      key: parseKeyLines(lines.slice(keyStart)),
    };
  }
  return { body: text, key: new Map() };
}

function emptyDraft(number: number | null): Draft {
  return {
    number,
    stemParts: [],
    options: ["", "", "", ""],
    correct: null,
    correctNumeric: null,
    numericTolerance: 0,
    declaredType: null,
  };
}

function applyKey(draft: Draft, key: Map<number, KeyAnswer>) {
  if (draft.number == null) return;
  const k = key.get(draft.number);
  if (!k) return;
  if (draft.correct == null && k.kind === "letter") draft.correct = k.index;
  if (draft.correctNumeric == null && k.kind === "numeric") draft.correctNumeric = k.value;
}

function finalizeDraft(draft: Draft, key: Map<number, KeyAnswer>, warnings: string[]): ParsedQuestion | null {
  applyKey(draft, key);
  const stem = normalizeWhitespace(draft.stemParts.join(" "));
  if (!stem) return null;
  const label = draft.number != null ? `question ${draft.number}` : "a question";
  const filled = draft.options.map((o) => Boolean(o));
  const fourOptions = filled[0] && filled[1] && filled[2] && filled[3];
  const twoOptions = filled[0] && filled[1] && !filled[2] && !filled[3];

  if (
    fourOptions &&
    draft.correct == null &&
    draft.correctNumeric != null &&
    Number.isInteger(draft.correctNumeric) &&
    draft.correctNumeric >= 1 &&
    draft.correctNumeric <= 4
  ) {
    draft.correct = draft.correctNumeric - 1;
    draft.correctNumeric = null;
  }

  if (
    draft.declaredType === "NUMERIC" ||
    (!draft.declaredType && !filled.some(Boolean) && draft.correctNumeric != null)
  ) {
    if (draft.correctNumeric == null) {
      warnings.push(`Skipped ${label}: numeric answer missing.`);
      return null;
    }
    return {
      type: "NUMERIC",
      stem,
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctOption: 0,
      correctNumeric: draft.correctNumeric,
      numericTolerance: draft.numericTolerance,
    };
  }

  if (draft.declaredType === "MCQ2" || (!draft.declaredType && twoOptions && (draft.correct == null || draft.correct <= 1))) {
    if (!filled[0] || !filled[1]) {
      warnings.push(`Skipped ${label}: need options A and B.`);
      return null;
    }
    if (draft.correct == null || draft.correct > 1) {
      warnings.push(`Skipped ${label}: add Answer: A or B, or put it in the Answer Key.`);
      return null;
    }
    return {
      type: "MCQ2",
      stem,
      optionA: draft.options[0],
      optionB: draft.options[1],
      optionC: "",
      optionD: "",
      correctOption: draft.correct,
      correctNumeric: null,
      numericTolerance: 0,
    };
  }

  if (fourOptions) {
    if (draft.correct == null || draft.correct < 0 || draft.correct > 3) {
      warnings.push(`Skipped ${label}: add Answer: B (or 1–4), or put it in the Answer Key.`);
      return null;
    }
    return {
      type: "MCQ",
      stem,
      optionA: draft.options[0],
      optionB: draft.options[1],
      optionC: draft.options[2],
      optionD: draft.options[3],
      correctOption: draft.correct,
      correctNumeric: null,
      numericTolerance: 0,
    };
  }

  if (stem) {
    warnings.push(`Skipped ${label}: need 2 or 4 options (A–D or 1–4) and an answer.`);
  }
  return null;
}

/**
 * Parse a free-form text blob containing one or more questions into structured records.
 *
 * Accepts blank-line blocks, continuous papers, numbered (1–4) / (i–iv) options,
 * and an Answer Key at the end.
 */
export function parseQuestionDocument(text: string): ParseQuestionDocumentResult {
  const { body, key } = splitBodyAndKey(text.replace(/\r\n/g, "\n").trim());
  const rawLines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[_\-=\s]{5,}$/.test(l));

  const lines: string[] = [];
  for (const line of rawLines) {
    const inline = splitInlineOptions(line);
    if (inline) lines.push(...inline);
    else lines.push(line);
  }

  const warnings: string[] = [];
  const out: ParsedQuestion[] = [];
  let draft: Draft | null = null;
  let autoNum = 1;
  let blockCount = 0;

  function flush() {
    if (!draft) return;
    if (draft.number == null) draft.number = autoNum++;
    else autoNum = Math.max(autoNum, draft.number + 1);
    blockCount += 1;
    const parsed = finalizeDraft(draft, key, warnings);
    if (parsed) out.push(parsed);
    draft = null;
  }

  function startQuestion(num: number | null, stem: string) {
    flush();
    draft = emptyDraft(num);
    if (stem) draft.stemParts.push(stem);
  }

  for (const line of lines) {
    const heading = matchKeyHeading(line);
    if (heading) {
      for (const [n, v] of parseKeyLines([heading.rest])) key.set(n, v);
      continue;
    }
    if (isStandaloneKeyLine(line)) {
      for (const [n, v] of parseKeyLines([line])) key.set(n, v);
      continue;
    }

    const typeMatch = line.match(TYPE_LABEL_RE);
    if (typeMatch) {
      const parsed = parseQuestionType(typeMatch[1]);
      if (parsed) {
        if (!draft) draft = emptyDraft(null);
        draft.declaredType = parsed;
        continue;
      }
    }
    const tolMatch = line.match(TOLERANCE_LABEL_RE);
    if (tolMatch) {
      const n = parseNumericInput(tolMatch[1]);
      if (n != null && n >= 0) {
        if (!draft) draft = emptyDraft(null);
        draft.numericTolerance = n;
        continue;
      }
    }
    const ans = line.match(ANSWER_LABEL_RE);
    if (ans && !matchKeyHeading(line)) {
      const parsed = parseAnswerValue(ans[1]);
      if (!draft) draft = emptyDraft(null);
      if (parsed.letter != null) draft.correct = parsed.letter;
      if (parsed.numeric != null) draft.correctNumeric = parsed.numeric;
      continue;
    }

    const opt = matchOptionLine(line);
    if (opt) {
      const token = (line.match(OPTION_LINE_RE) || line.match(OPTION_WRAPPED_RE))?.[1] ?? "";
      const asOption = looksLikeNumberedOption(draft, opt.index, token);
      if (asOption && draft) {
        draft.options[opt.index] = opt.text;
        continue;
      }
    }

    const q = devanagariDigitsToAscii(line).match(QUESTION_START_RE);
    if (q) {
      const num = Number(q[1]);
      const rest = (q[2] ?? "").trim();
      const token = q[1];
      const optIdx = optionTokenToIndex(token);
      if (optIdx != null && looksLikeNumberedOption(draft, optIdx, token) && !/^(q|question|प्रश्न|प्र)/i.test(line)) {
        if (draft) draft.options[optIdx] = normalizeWhitespace(rest) || draft.options[optIdx];
        continue;
      }
      startQuestion(Number.isInteger(num) ? num : null, rest);
      continue;
    }

    if (!draft) draft = emptyDraft(null);
    draft.stemParts.push(line);
  }
  flush();

  if (!out.length && blockCount === 0) {
    warnings.unshift(
      "No questions found. Use stems like Q1. or 1., options A–D or (1)–(4), and Answer: B on the question or an Answer Key at the end."
    );
  } else if (!out.length) {
    warnings.unshift(
      `Found ${blockCount} question(s) but none had a usable answer. Add Answer: B on each question, or an Answer Key at the end.`
    );
  }

  return { questions: out, warnings, blockCount };
}

export function parseQuestionBlocks(text: string): ParsedQuestion[] {
  return parseQuestionDocument(text).questions;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const html = await mammoth.convertToHtml({ buffer });
  const fromHtml = htmlToPlainText(html.value);
  if (fromHtml.trim().length >= 8) return fromHtml;
  const raw = await mammoth.extractRawText({ buffer });
  return raw.value;
}

export function parseDifficulty(s: string | undefined): Difficulty {
  const u = (s ?? "").toUpperCase();
  if (u === "EASY" || u === "E") return "EASY";
  if (u === "HARD" || u === "H") return "HARD";
  return "MEDIUM";
}
