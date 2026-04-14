import crypto from "crypto";

export function normalizeStem(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function questionContentHash(topicId: string, stem: string, correctOption: number): string {
  const payload = `${topicId}|${normalizeStem(stem)}|${correctOption}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}
