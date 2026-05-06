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

function normalizeMathText(input: string): string {
  return input
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\\sqrt\{([^}]+)\}/gi, "sqrt($1)")
    .replace(/√\s*\(?([^)\s]+)\)?/g, "sqrt($1)")
    .replace(/[²]/g, "^2")
    .replace(/[³]/g, "^3")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Expected plain-text shape after mammoth conversion:
 *
 * Q1. Question text here
 * A) option a
 * B) option b
 * C) option c
 * D) option d
 * Answer: A
 *
 * Blank line between questions.
 */
export function parseQuestionBlocks(text: string): ParsedQuestion[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n\s*\n+/);
  const out: ParsedQuestion[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (/^[_\-=\s]{5,}$/.test(l)) return false;
        return true;
      });
    if (lines.length < 6) continue;

    let stem = "";
    const options: string[] = ["", "", "", ""];
    let correct: number | null = null;

    for (const line of lines) {
      const mStem =
        line.match(/^Q\d*[\.\)]\s*(.+)$/i) ??
        line.match(/^Question\s*\d*[\.\)]\s*(.+)$/i) ??
        line.match(/^\d+[\.\)]\s*(.+)$/i);
      if (mStem && !stem) {
        stem = normalizeMathText(mStem[1].trim());
        continue;
      }
      const opt = line.match(/^([A-D])[\)\.\s]\s*(.+)$/i);
      if (opt) {
        const idx = opt[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < 4) options[idx] = normalizeMathText(opt[2].trim());
        continue;
      }
      const ans = line.match(/^(?:Correct\s+)?Answer\s*:\s*([A-D])/i);
      if (ans) {
        correct = ans[1].toUpperCase().charCodeAt(0) - 65;
        continue;
      }
      if (!stem && !/^([A-D])[\)\.]/.test(line)) {
        stem = normalizeMathText(line.replace(/^Q\d*[\.\)]\s*/i, "").trim());
      }
    }

    if (!stem) {
      const first = normalizeMathText(lines[0].replace(/^Q\d*[\.\)]\s*/i, "").trim());
      stem = first;
    }

    for (let i = 0; i < lines.length; i++) {
      const opt = lines[i].match(/^([A-D])[\)\.\s]\s*(.+)$/i);
      if (opt) {
        const idx = opt[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < 4) options[idx] = normalizeMathText(opt[2].trim());
      }
    }

    const ansLine = lines.find((l) => /^(?:Correct\s+)?Answer\s*:/i.test(l));
    if (ansLine) {
      const m = ansLine.match(/^(?:Correct\s+)?Answer\s*:\s*([A-D])/i);
      if (m) correct = m[1].toUpperCase().charCodeAt(0) - 65;
    }

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
