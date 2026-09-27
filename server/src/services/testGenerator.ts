import type { PrismaClient } from "@prisma/client";
import { allocateByWeights, allocateQuestionCounts } from "./allocateQuotas.js";
import {
  countBookUnits,
  fillLevelTopics,
  sampleBookUnits,
  sampleQuestionIdsAny,
  sampleLevelTopics,
  type QuestionSampleFilter,
} from "./questionSample.js";
import { bankOrder } from "./sharedQuestionBank.js";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export { allocateQuestionCounts };

export async function pickQuestionsForTest(
  prisma: PrismaClient,
  levelId: string
): Promise<{ questionIds: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const parts = await prisma.$queryRaw<
    {
      level_order: number;
      question_count: number | null;
      topic_id: string | null;
      quota: number | null;
      question_level_order: number | null;
      topic_name: string | null;
    }[]
  >`
    SELECT l."order" AS level_order,
           c.question_count AS question_count,
           p.topic_id AS topic_id,
           p.quota AS quota,
           p.question_level_order AS question_level_order,
           t.name AS topic_name
    FROM "Level" l
    LEFT JOIN "LevelTestConfig" c ON c.level_id = l.id
    LEFT JOIN "LevelTopicParticipation" p ON p.level_id = l.id
    LEFT JOIN "Topic" t ON t.id = p.topic_id
    WHERE l.id = ${levelId}
    ORDER BY p.sort_order ASC
  `;
  if (parts.length === 0) {
    throw new Error("Level not found");
  }
  if (parts[0]?.question_count == null) {
    throw new Error("Level test config not found");
  }
  const chapters = parts.filter((row) => row.topic_id && row.topic_name);
  if (chapters.length === 0) {
    throw new Error("No topics configured for this level");
  }
  const total = Number(parts[0].question_count);
  const topicIds = chapters.map((row) => row.topic_id as string);
  const quotas = new Map<string, number | null>();
  for (const row of chapters) quotas.set(row.topic_id as string, row.quota);

  const counts = allocateQuestionCounts(total, topicIds, quotas);
  let sum = 0;
  for (const n of counts.values()) sum += n;
  if (sum !== total) {
    const first = topicIds[0];
    counts.set(first, (counts.get(first) ?? 0) + (total - sum));
  }

  const levelOrder = Number(parts[0].level_order);
  const needs = chapters.map((row) => ({
    order: bankOrder(levelOrder, row.question_level_order),
    topicId: row.topic_id as string,
    need: counts.get(row.topic_id as string) ?? 0,
  }));
  const sampled = await sampleLevelTopics(prisma, needs);
  const picked: string[] = [];
  for (const row of chapters) {
    const topicId = row.topic_id as string;
    const need = counts.get(topicId) ?? 0;
    const sample = sampled.get(topicId) ?? { ids: [], available: 0 };
    if (need > 0 && sample.ids.length < need) {
      warnings.push(`Topic "${row.topic_name}": need ${need}, only ${sample.available} in bank`);
    }
    picked.push(...sample.ids);
  }

  const missing = total - picked.length;
  if (missing > 0) {
    const more = await fillLevelTopics(prisma, needs, missing, picked);
    picked.push(...more);
    if (picked.length < total) {
      warnings.push(`Could only fill ${picked.length} of ${total} questions`);
    }
  }

  return { questionIds: shuffle(picked.slice(0, total)), warnings };
}

/** Teacher board uses the same paper rules and the same short draw as a student level test. */
export async function pickBoardQuestions(
  prisma: PrismaClient,
  levelId: string
): Promise<{ questionIds: string[]; warnings: string[] }> {
  return pickQuestionsForTest(prisma, levelId);
}

type ChapterPickUnit = {
  key: string;
  label: string;
  where: { subjectId: string; levelId: null; topicId?: string; chapterTopicId?: string };
};

/** Book tests: whole chapters, or topics inside a chapter. Questions have no level. */
export async function pickQuestionsForChapterTest(
  prisma: PrismaClient,
  subjectId: string,
  topicIds: string[],
  total: number,
  chapterTopicIds: string[] = [],
  weightByBank = false
): Promise<{ questionIds: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const uniqueChapterIds = [...new Set(topicIds.filter(Boolean))];
  const uniqueTopicIds = [...new Set(chapterTopicIds.filter(Boolean))];
  if (uniqueChapterIds.length === 0 && uniqueTopicIds.length === 0) {
    throw new Error("Select at least one chapter");
  }
  if (total <= 0) {
    throw new Error("Question count must be at least 1");
  }

  const chapterTopics = uniqueTopicIds.length
    ? await prisma.chapterTopic.findMany({
        where: { id: { in: uniqueTopicIds } },
        select: { id: true, name: true, subjectChapter: { select: { topicId: true } } },
      })
    : [];
  const coveredChapters = new Set(uniqueChapterIds);
  const units: ChapterPickUnit[] = uniqueChapterIds.map((topicId) => ({
    key: `ch:${topicId}`,
    label: topicId,
    where: { subjectId, levelId: null, topicId },
  }));
  for (const row of chapterTopics) {
    if (coveredChapters.has(row.subjectChapter.topicId)) continue;
    units.push({
      key: `tp:${row.id}`,
      label: row.name,
      where: { subjectId, levelId: null, chapterTopicId: row.id },
    });
  }
  if (units.length === 0) {
    throw new Error("Select at least one chapter");
  }

  const chapterNames = uniqueChapterIds.length
    ? await prisma.topic.findMany({
        where: { id: { in: uniqueChapterIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameByKey = new Map<string, string>();
  for (const ch of chapterNames) nameByKey.set(`ch:${ch.id}`, ch.name);
  for (const row of chapterTopics) nameByKey.set(`tp:${row.id}`, row.name);

  const unitKeys = units.map((u) => u.key);
  const bookUnits = units.map((unit) => ({
    key: unit.key,
    topicId: unit.where.topicId,
    chapterTopicId: unit.where.chapterTopicId,
  }));
  let counts: Map<string, number>;
  if (weightByBank) {
    const weights = await countBookUnits(prisma, subjectId, bookUnits);
    for (const key of unitKeys) if (!weights.has(key)) weights.set(key, 0);
    counts = allocateByWeights(total, weights);
  } else {
    const quotas = new Map<string, number | null>();
    for (const key of unitKeys) quotas.set(key, null);
    counts = allocateQuestionCounts(total, unitKeys, quotas);
  }
  let sum = 0;
  for (const n of counts.values()) sum += n;
  if (sum !== total) {
    const first = unitKeys[0];
    counts.set(first, (counts.get(first) ?? 0) + (total - sum));
  }

  const sampled = await sampleBookUnits(
    prisma,
    subjectId,
    bookUnits.map((unit) => ({ ...unit, need: counts.get(unit.key) ?? 0 }))
  );
  const picked: string[] = [];
  const filters: QuestionSampleFilter[] = bookUnits.map((unit) => ({
    subjectId,
    levelIdNull: true,
    topicId: unit.topicId,
    chapterTopicId: unit.chapterTopicId,
  }));
  for (const unit of units) {
    const need = counts.get(unit.key) ?? 0;
    const sample = sampled.get(unit.key) ?? { ids: [], available: 0 };
    if (need > 0 && sample.ids.length < need) {
      const label = nameByKey.get(unit.key) ?? unit.label;
      warnings.push(
        `${unit.key.startsWith("tp:") ? "Topic" : "Chapter"} "${label}": need ${need}, only ${sample.available} in bank`
      );
    }
    picked.push(...sample.ids);
  }

  const missing = total - picked.length;
  if (missing > 0) {
    const more = await sampleQuestionIdsAny(prisma, filters, missing, picked);
    picked.push(...more.ids);
    if (picked.length < total) {
      warnings.push(`Could only fill ${picked.length} of ${total} questions`);
    }
  }

  return { questionIds: shuffle(picked.slice(0, total)), warnings };
}
