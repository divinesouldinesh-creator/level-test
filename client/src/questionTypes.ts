export type QuestionType = "MCQ" | "MCQ2" | "NUMERIC";

export type DraftAnswer = {
  selectedOption?: number;
  numericRaw?: string;
};

const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export function parseNumericInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const t = String(raw).trim().replace(/,/g, "");
  if (!t || !NUMERIC_RE.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function isNumericType(type?: string | null): boolean {
  return type === "NUMERIC";
}

export function questionTypeLabel(type?: string | null): string {
  if (type === "NUMERIC") return "Numeric";
  if (type === "MCQ2") return "2-option";
  return "4-option";
}

export function isDraftAnswered(type: string | undefined, draft: DraftAnswer | undefined): boolean {
  if (type === "NUMERIC") return parseNumericInput(draft?.numericRaw) != null;
  return draft?.selectedOption != null;
}

export function toSubmitAnswer(questionId: string, type: string | undefined, draft: DraftAnswer | undefined) {
  if (type === "NUMERIC") {
    return { questionId, numericAnswer: parseNumericInput(draft?.numericRaw) ?? undefined };
  }
  return { questionId, selectedOption: draft?.selectedOption };
}

export function formatNumeric(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}
