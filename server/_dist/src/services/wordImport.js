import mammoth from "mammoth";
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
export function parseQuestionBlocks(text) {
    const normalized = text.replace(/\r\n/g, "\n").trim();
    const blocks = normalized.split(/\n\s*\n+/);
    const out = [];
    for (const block of blocks) {
        const lines = block
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
        if (lines.length < 6)
            continue;
        let stem = "";
        const options = ["", "", "", ""];
        let correct = null;
        for (const line of lines) {
            const mStem = line.match(/^Q\d*[\.\)]\s*(.+)$/i) ?? line.match(/^Question\s*\d*[\.\)]\s*(.+)$/i);
            if (mStem && !stem) {
                stem = mStem[1].trim();
                continue;
            }
            const opt = line.match(/^([A-D])[\)\.\s]\s*(.+)$/i);
            if (opt) {
                const idx = opt[1].toUpperCase().charCodeAt(0) - 65;
                if (idx >= 0 && idx < 4)
                    options[idx] = opt[2].trim();
                continue;
            }
            const ans = line.match(/^Answer\s*:\s*([A-D])/i);
            if (ans) {
                correct = ans[1].toUpperCase().charCodeAt(0) - 65;
                continue;
            }
            if (!stem && !/^([A-D])[\)\.]/.test(line)) {
                stem = line.replace(/^Q\d*[\.\)]\s*/i, "").trim();
            }
        }
        if (!stem) {
            const first = lines[0].replace(/^Q\d*[\.\)]\s*/i, "").trim();
            stem = first;
        }
        for (let i = 0; i < lines.length; i++) {
            const opt = lines[i].match(/^([A-D])[\)\.\s]\s*(.+)$/i);
            if (opt) {
                const idx = opt[1].toUpperCase().charCodeAt(0) - 65;
                if (idx >= 0 && idx < 4)
                    options[idx] = opt[2].trim();
            }
        }
        const ansLine = lines.find((l) => /^Answer\s*:/i.test(l));
        if (ansLine) {
            const m = ansLine.match(/^Answer\s*:\s*([A-D])/i);
            if (m)
                correct = m[1].toUpperCase().charCodeAt(0) - 65;
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
export async function extractTextFromDocx(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}
export function parseDifficulty(s) {
    const u = (s ?? "").toUpperCase();
    if (u === "EASY" || u === "E")
        return "EASY";
    if (u === "HARD" || u === "H")
        return "HARD";
    return "MEDIUM";
}
