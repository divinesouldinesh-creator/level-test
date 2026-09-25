import type { Difficulty, PrismaClient, QuestionType } from "@prisma/client";
import { questionContentHash } from "../utils/questionHash.js";
import { questionAnswerKey } from "./questionAnswer.js";
import type { ParsedQuestion } from "./wordImport.js";

export type QuestionWriteFields = {
  type: QuestionType;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  correctNumeric: number | null;
  numericTolerance: number;
};

export function normalizeQuestionFields(data: {
  type?: QuestionType | string | null;
  stem: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctOption?: number | null;
  correctNumeric?: number | null;
  numericTolerance?: number | null;
}): { ok: true; fields: QuestionWriteFields } | { ok: false; error: string } {
  const stem = data.stem.trim();
  if (!stem) return { ok: false, error: "Question statement is required" };
  const type = (data.type as QuestionType | undefined) ?? "MCQ";
  if (type === "NUMERIC") {
    const n = data.correctNumeric;
    if (n == null || !Number.isFinite(n)) return { ok: false, error: "Numeric answer is required" };
    const tol = data.numericTolerance ?? 0;
    if (!Number.isFinite(tol) || tol < 0) return { ok: false, error: "Tolerance must be 0 or greater" };
    return {
      ok: true,
      fields: {
        type,
        stem,
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        correctOption: 0,
        correctNumeric: n,
        numericTolerance: tol,
      },
    };
  }
  const a = (data.optionA ?? "").trim();
  const b = (data.optionB ?? "").trim();
  if (type === "MCQ2") {
    if (!a || !b) return { ok: false, error: "Options A and B are required" };
    const co = data.correctOption;
    if (co == null || !Number.isInteger(co) || co < 0 || co > 1) {
      return { ok: false, error: "Correct option must be A or B" };
    }
    return {
      ok: true,
      fields: {
        type,
        stem,
        optionA: a,
        optionB: b,
        optionC: "",
        optionD: "",
        correctOption: co,
        correctNumeric: null,
        numericTolerance: 0,
      },
    };
  }
  const c = (data.optionC ?? "").trim();
  const d = (data.optionD ?? "").trim();
  if (!a || !b || !c || !d) return { ok: false, error: "Four options are required" };
  const co = data.correctOption;
  if (co == null || !Number.isInteger(co) || co < 0 || co > 3) {
    return { ok: false, error: "Correct option must be A–D" };
  }
  return {
    ok: true,
    fields: {
      type: "MCQ",
      stem,
      optionA: a,
      optionB: b,
      optionC: c,
      optionD: d,
      correctOption: co,
      correctNumeric: null,
      numericTolerance: 0,
    },
  };
}

export function parsedQuestionWriteData(
  pq: ParsedQuestion,
  ids: { subjectId: string; levelId: string | null; topicId: string; chapterTopicId?: string | null },
  difficulty: Difficulty
) {
  return {
    subjectId: ids.subjectId,
    levelId: ids.levelId,
    topicId: ids.topicId,
    chapterTopicId: ids.chapterTopicId ?? null,
    type: pq.type,
    stem: pq.stem,
    optionA: pq.optionA,
    optionB: pq.optionB,
    optionC: pq.optionC,
    optionD: pq.optionD,
    correctOption: pq.type === "NUMERIC" ? 0 : pq.correctOption,
    correctNumeric: pq.type === "NUMERIC" ? pq.correctNumeric : null,
    numericTolerance: pq.type === "NUMERIC" ? pq.numericTolerance : 0,
    difficulty,
    ...(pq.stemImageUrl !== undefined ? { stemImageUrl: pq.stemImageUrl || null } : {}),
    contentHash: questionContentHash(ids.topicId, pq.stem, questionAnswerKey(pq)),
  };
}

export async function persistParsedQuestions(
  prisma: PrismaClient,
  opts: {
    parsed: ParsedQuestion[];
    subjectId: string;
    levelId: string | null;
    topicId: string;
    chapterTopicId?: string | null;
    mode: "insert" | "sync" | "replace";
    defaultDifficulty: Difficulty;
    createdById: string;
    filename?: string;
    recordBatch?: boolean;
  }
) {
  const chapterTopicId = opts.chapterTopicId ?? null;
  const ids = { subjectId: opts.subjectId, levelId: opts.levelId, topicId: opts.topicId, chapterTopicId };
  if (opts.mode === "replace") {
    await prisma.question.deleteMany({
      where: { subjectId: opts.subjectId, levelId: opts.levelId, topicId: opts.topicId, chapterTopicId },
    });
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const pq of opts.parsed) {
    try {
      const difficulty = pq.difficulty ?? opts.defaultDifficulty;
      const data = parsedQuestionWriteData(pq, ids, difficulty);
      if (opts.mode === "sync") {
        const existingByStem = await prisma.question.findFirst({
          where: {
            subjectId: opts.subjectId,
            topicId: opts.topicId,
            levelId: opts.levelId,
            chapterTopicId,
            stem: pq.stem,
          },
        });
        if (existingByStem) {
          const clash = await prisma.question.findUnique({ where: { contentHash: data.contentHash } });
          if (clash && clash.id !== existingByStem.id) {
            skipped++;
            continue;
          }
          await prisma.question.update({
            where: { id: existingByStem.id },
            data,
          });
          updated++;
          continue;
        }
      }
      const exists = await prisma.question.findUnique({ where: { contentHash: data.contentHash } });
      if (exists) {
        skipped++;
        continue;
      }
      await prisma.question.create({
        data: { ...data, createdById: opts.createdById },
      });
      imported++;
    } catch (e) {
      errors.push(String(e));
    }
  }

  let batchId: string | undefined;
  if (opts.recordBatch) {
    const batch = await prisma.questionImport.create({
      data: {
        filename: opts.filename ?? "import",
        uploadedById: opts.createdById,
        importedCount: imported + updated,
        skippedDuplicates: skipped,
        errorsJson: errors.length ? JSON.stringify(errors.slice(0, 20)) : null,
      },
    });
    batchId = batch.id;
  }

  return {
    batchId,
    mode: opts.mode,
    imported,
    updated,
    skipped,
    parseCount: opts.parsed.length,
    errors,
  };
}

