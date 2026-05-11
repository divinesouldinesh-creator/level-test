import mammoth from "mammoth";
import type { Difficulty } from "@prisma/client";

export type ParsedQuestion = {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
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
  /^\s*(?:Correct\s+Answer|Correct\s+Ans|Answer|Ans|Correct|उत्तर|सही\s+उत्तर|जवाब)\s*[:=\-–]?\s*\(?\s*([A-Da-dकखगघअबसद])\)?/i;
const STEM_PREFIX_RE =
  /^\s*(?:Q\d+|Question\s*\d+|प्रश्न\s*\d+|प्र\.?\s*\d+|\d+)[\.\)\:\-–]\s+(.+)$/i;
const OPTION_LINE_RE = new RegExp(
  String.raw`^\s*\(?\s*(${OPTION_TOKEN_CLASS})\s*[\)\.\:\-–]\s+(.+)$`
);

/**
 * Light text normalization that preserves Unicode characters (Devanagari,
 * superscripts, math symbols, etc.) so the question renders identically to
 * what the author typed. The previous implementation rewrote `²` → `^2`,
 * `√x` → `sqrt(x)`, and stripped LaTeX `$...$` delimiters; that hurt math
 * fidelity and prevented future KaTeX rendering.
 */
function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * If a line packs all options on one row (e.g. "A) 31 B) 32 C) 33 D) 34"),
 * return them split into individual option strings. Returns null when the
 * line has fewer than two markers, so multi-line layouts fall through.
 */
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
  // Require at least 2 distinct option letters before treating as inline.
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

/**
 * Parse a free-form text blob containing one or more multiple-choice
 * questions into structured records.
 *
 * Recognized shapes (any combination, mixed languages OK):
 *
 *   Q1. <stem>           (also: Question 1., प्रश्न १., 1., 1))
 *   A) <opt>             (also: A. / (A) / Hindi क/ख/ग/घ or अ/ब/स/द)
 *   B) <opt>
 *   C) <opt>
 *   D) <opt>
 *   Answer: B            (also: Ans, Correct, उत्तर, सही उत्तर, जवाब; A/B/C/D or Hindi letters)
 *
 * Inline option layouts ("A) 31 B) 32 C) 33 D) 34") are also supported.
 * Blocks are separated by blank lines.
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

    // Expand any single-line option layout into individual option lines so
    // the rest of the parser only has to handle one shape.
    const lines: string[] = [];
    for (const line of rawLines) {
      const inline = splitInlineOptions(line);
      if (inline) lines.push(...inline);
      else lines.push(line);
    }

    let stem = "";
    const options: string[] = ["", "", "", ""];
    let correct: number | null = null;
    const stemFragments: string[] = [];

    for (const line of lines) {
      const ans = line.match(ANSWER_LABEL_RE);
      if (ans) {
        const idx = optionLetterToIndex(ans[1]);
        if (idx != null) correct = idx;
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
      // Otherwise this is part of the stem. Honor numeric prefixes (English
      // or Hindi) but keep the rest of the line intact.
      const prefixed = devanagariDigitsToAscii(line).match(STEM_PREFIX_RE);
      if (prefixed) {
        stemFragments.push(prefixed[1].trim());
        continue;
      }
      stemFragments.push(line);
    }

    if (stemFragments.length) stem = normalizeWhitespace(stemFragments.join(" "));

    if (stem && options.every(Boolean) && correct != null && correct >= 0 && correct < 4) {
      out.push({
        stem,
        optionA: options[0],
        optionB: options[1],
        optionC: options[2],
        optionD: options[3],
        correctOption: correct,
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
