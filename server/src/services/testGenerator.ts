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
  chapterTopicIds: string[] = []
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
  const quotas = new Map<string, number | null>();
  for (const key of unitKeys) quotas.set(key, null);
  const counts = allocateQuestionCounts(total, unitKeys, quotas);
  let sum = 0;
  for (const n of counts.values()) sum += n;
  if (sum !== total) {
    const first = unitKeys[0];
    counts.set(first, (counts.get(first) ?? 0) + (total - sum));
  }

  const picked: string[] = [];
  const pickedSet = new Set<string>();
  for (const unit of units) {
    const need = counts.get(unit.key) ?? 0;
    if (need <= 0) continue;
    const pool = await prisma.question.findMany({
      where: unit.where,
      select: { id: true },
    });
    const shuffled = shuffle(pool.map((p) => p.id));
    const take = Math.min(need, shuffled.length);
    if (take < need) {
      const label = nameByKey.get(unit.key) ?? unit.label;
      warnings.push(`${unit.key.startsWith("tp:") ? "Topic" : "Chapter"} "${label}": need ${need}, only ${shuffled.length} in bank`);
    }
    for (const id of shuffled.slice(0, take)) {
      picked.push(id);
      pickedSet.add(id);
    }
  }

  const missing = total - picked.length;
  if (missing > 0) {
    const extraPool = await prisma.question.findMany({
      where: {
        subjectId,
        levelId: null,
        OR: units.map((u) => u.where),
        id: { notIn: [...pickedSet] },
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
