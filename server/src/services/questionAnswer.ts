import type { Question, QuestionType } from "@prisma/client";

export type SubmittedAnswer = {
  questionId: string;
  selectedOption?: number;
  numericAnswer?: number | null;
};

export type ScoreableQuestion = Pick<
  Question,
  "id" | "type" | "correctOption" | "correctNumeric" | "numericTolerance"
>;

const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export function parseNumericInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const t = String(raw).trim().replace(/,/g, "");
  if (!t || !NUMERIC_RE.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseQuestionType(raw: string | undefined | null): QuestionType | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase().replace(/[\s\-_\/]/g, "");
  if (["NUMERIC", "NUMBER", "NUMERICAL", "NUM"].includes(u)) return "NUMERIC";
  if (["MCQ2", "TWOOPTION", "TWOOPTIONS", "2OPTION", "2OPTIONS", "TRUEFALSE", "TF", "YN", "YESNO"].includes(u)) {
    return "MCQ2";
  }
  if (["MCQ", "MCQ4", "FOUROPTION", "FOUROPTIONS", "4OPTION", "4OPTIONS"].includes(u)) return "MCQ";
  return null;
}

export function visibleOptions(
  type: QuestionType | string | null | undefined,
  optionA: string,
  optionB: string,
  optionC: string,
  optionD: string
): string[] {
  if (type === "NUMERIC") return [];
  if (type === "MCQ2") return [optionA, optionB];
  return [optionA, optionB, optionC, optionD];
}

export function visibleOptionImages(
  type: QuestionType | string | null | undefined,
  optionImageA?: string | null,
  optionImageB?: string | null,
  optionImageC?: string | null,
  optionImageD?: string | null
): (string | null)[] {
  const images = [optionImageA, optionImageB, optionImageC, optionImageD].map((url) => url || null);
  if (type === "NUMERIC") return [];
  if (type === "MCQ2") return images.slice(0, 2);
  return images;
}

export function questionAnswerKey(q: {
  type?: QuestionType | string | null;
  correctOption: number;
  correctNumeric?: number | null;
}): number | string {
  if (q.type === "NUMERIC") return `num:${q.correctNumeric ?? ""}`;
  return q.correctOption;
}

export function scoreSubmittedAnswer(
  q: ScoreableQuestion,
  answer: SubmittedAnswer | undefined
): {
  isCorrect: boolean;
  selectedOption: number | null;
  numericAnswer: number | null;
  complete: boolean;
} {
  if (q.type === "NUMERIC") {
    const n = answer?.numericAnswer;
    const complete = n != null && Number.isFinite(n);
    if (!complete) {
      return { isCorrect: false, selectedOption: null, numericAnswer: null, complete: false };
    }
    const key = q.correctNumeric;
    const tol = q.numericTolerance ?? 0;
    const isCorrect = key != null && Math.abs(n - key) <= tol;
    return { isCorrect, selectedOption: null, numericAnswer: n, complete: true };
  }
  const max = q.type === "MCQ2" ? 1 : 3;
  const sel = answer?.selectedOption;
  const complete = sel != null && Number.isInteger(sel) && sel >= 0 && sel <= max;
  if (!complete) {
    return { isCorrect: false, selectedOption: sel ?? null, numericAnswer: null, complete: false };
  }
  return {
    isCorrect: sel === q.correctOption,
    selectedOption: sel,
    numericAnswer: null,
    complete: true,
  };
}

export function isAttemptedAnswer(
  type: QuestionType | string | null | undefined,
  selectedOption: number | null | undefined,
  numericAnswer: number | null | undefined
): boolean {
  if (type === "NUMERIC") return numericAnswer != null && Number.isFinite(numericAnswer);
  return selectedOption != null;
}

export function tallyTestScore(
  results: { isCorrect: boolean; complete?: boolean }[],
  wrongPenalty = 0
): {
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  unanswered: number;
  penaltyPerWrong: number;
  penaltyTotal: number;
} {
  const maxScore = results.length;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const r of results) {
    if (r.isCorrect) correct += 1;
    else if (r.complete === false) unanswered += 1;
    else wrong += 1;
  }
  const penaltyPerWrong = Math.max(0, wrongPenalty);
  const penaltyTotal = Math.round(wrong * penaltyPerWrong * 100) / 100;
  const raw = correct - penaltyTotal;
  const score = Math.round(raw * 100) / 100;
  const percentage = maxScore ? Math.max(0, (100 * score) / maxScore) : 0;
  return { score, maxScore, percentage, correct, wrong, unanswered, penaltyPerWrong, penaltyTotal };
}

export function toPublicQuestion(q: {
  id: string;
  type?: QuestionType | string | null;
  stem: string;
  stemImageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionImageA?: string | null;
  optionImageB?: string | null;
  optionImageC?: string | null;
  optionImageD?: string | null;
  topicId: string;
}) {
  const type = (q.type as QuestionType | undefined) ?? "MCQ";
  return {
    id: q.id,
    type,
    stem: q.stem,
    stemImageUrl: q.stemImageUrl ?? null,
    options: visibleOptions(type, q.optionA, q.optionB, q.optionC, q.optionD),
    optionImageUrls: visibleOptionImages(type, q.optionImageA, q.optionImageB, q.optionImageC, q.optionImageD),
    topicId: q.topicId,
  };
}
