import type { PrismaClient } from "@prisma/client";
import { allocateQuestionCounts } from "./allocateQuotas.js";

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
  const config = await prisma.levelTestConfig.findUnique({ where: { levelId } });
  if (!config) {
    throw new Error("Level test config not found");
  }
  const total = config.questionCount;
  const parts = await prisma.levelTopicParticipation.findMany({
    where: { levelId },
    orderBy: { sortOrder: "asc" },
    include: { topic: true },
  });
  if (parts.length === 0) {
    throw new Error("No topics configured for this level");
  }
  const topicIds = parts.map((p) => p.topicId);
  const quotas = new Map<string, number | null>();
  for (const p of parts) quotas.set(p.topicId, p.quota);

  const counts = allocateQuestionCounts(total, topicIds, quotas);
  let sum = 0;
  for (const n of counts.values()) sum += n;
  if (sum !== total) {
    const first = topicIds[0];
    counts.set(first, (counts.get(first) ?? 0) + (total - sum));
  }

  const picked: string[] = [];
  for (const [topicId, need] of counts) {
    if (need <= 0) continue;
    const pool = await prisma.question.findMany({
      where: { levelId, topicId },
      select: { id: true },
    });
    const shuffled = shuffle(pool.map((p) => p.id));
    const take = Math.min(need, shuffled.length);
    if (take < need) {
      warnings.push(`Topic "${parts.find((p) => p.topicId === topicId)?.topic.name ?? topicId}": need ${need}, only ${shuffled.length} in bank`);
    }
    picked.push(...shuffled.slice(0, take));
  }

  const missing = total - picked.length;
  if (missing > 0) {
    const extraPool = await prisma.question.findMany({
      where: {
        levelId,
        topicId: { in: topicIds },
        id: { notIn: picked },
      },
      select: { id: true },
    });
    const more = shuffle(extraPool.map((p) => p.id)).slice(0, missing);
    picked.push(...more);
    if (more.length < missing) {
      warnings.push(`Could only fill ${picked.length} of ${total} questions`);
    }
  }

  return { questionIds: shuffle(picked.slice(0, total)), warnings };
}

/** Book/chapter tests: draw from selected chapters only. Questions have no level. */
export async function pickQuestionsForChapterTest(
  prisma: PrismaClient,
  subjectId: string,
  topicIds: string[],
  total: number
): Promise<{ questionIds: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const uniqueIds = [...new Set(topicIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Select at least one chapter");
  }
  if (total <= 0) {
    throw new Error("Question count must be at least 1");
  }

  const topics = await prisma.topic.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(topics.map((t) => [t.id, t.name]));

  const quotas = new Map<string, number | null>();
  for (const id of uniqueIds) quotas.set(id, null);
  const counts = allocateQuestionCounts(total, uniqueIds, quotas);
  let sum = 0;
  for (const n of counts.values()) sum += n;
  if (sum !== total) {
    const first = uniqueIds[0];
    counts.set(first, (counts.get(first) ?? 0) + (total - sum));
  }

  const picked: string[] = [];
  for (const [topicId, need] of counts) {
    if (need <= 0) continue;
    const pool = await prisma.question.findMany({
      where: { subjectId, topicId, levelId: null },
      select: { id: true },
    });
    const shuffled = shuffle(pool.map((p) => p.id));
    const take = Math.min(need, shuffled.length);
    if (take < need) {
      warnings.push(
        `Chapter "${nameById.get(topicId) ?? topicId}": need ${need}, only ${shuffled.length} in bank`
      );
    }
    picked.push(...shuffled.slice(0, take));
  }

  const missing = total - picked.length;
  if (missing > 0) {
    const extraPool = await prisma.question.findMany({
      where: {
        subjectId,
        topicId: { in: uniqueIds },
        levelId: null,
        id: { notIn: picked },
      },
      select: { id: true },
    });
    const more = shuffle(extraPool.map((p) => p.id)).slice(0, missing);
    picked.push(...more);
    if (more.length < missing) {
      warnings.push(`Could only fill ${picked.length} of ${total} questions`);
    }
  }

  return { questionIds: shuffle(picked.slice(0, total)), warnings };
}
