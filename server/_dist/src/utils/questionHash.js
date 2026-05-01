import crypto from "crypto";
export function normalizeStem(text) {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
}
export function questionContentHash(topicId, stem, correctOption) {
    const payload = `${topicId}|${normalizeStem(stem)}|${correctOption}`;
    return crypto.createHash("sha256").update(payload).digest("hex");
}
