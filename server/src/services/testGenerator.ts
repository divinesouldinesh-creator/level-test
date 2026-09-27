import { Prisma, type PrismaClient } from "@prisma/client";
import { allocateByWeights, allocateQuestionCounts } from "./allocateQuotas.js";
import { levelOrder, sharedLevelQuestionWhere } from "./sharedQuestionBank.js";

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

  const order = await levelOrder(prisma, levelId);
  if (order == null) {
    throw new Error("Level not found");
  }

  const picked: string[] = [];
  for (const [topicId, need] of counts) {
    if (need <= 0) continue;
    const pool = await prisma.question.findMany({
      where: sharedLevelQuestionWhere(order, topicId),
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
        ...sharedLevelQuestionWhere(order, topicIds),
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

type BoardSampleRow = {
  id: string;
  topic_id: string;
  rn: number | bigint;
  topic_count: number | bigint | string;
};

/**
 * Same paper rules as pickQuestionsForTest: the level's question count, split across its topics.
 * Asks the database for only those rows instead of loading every id in the bank.
 * Used by the teacher board so student tests keep the original picker.
 */
export async function pickBoardQuestions(
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

  const order = await levelOrder(prisma, levelId);
  if (order == null) {
    throw new Error("Level not found");
  }

  const maxNeed = Math.max(0, ...counts.values());
  const rows =
    maxNeed > 0
      ? await prisma.$queryRaw<BoardSampleRow[]>`
          SELECT id, topic_id, rn, topic_count FROM (
            SELECT q.id AS id,
                   q.topic_id AS topic_id,
                   row_number() OVER (PARTITION BY q.topic_id ORDER BY random()) AS rn,
                   count(*) OVER (PARTITION BY q.topic_id) AS topic_count
            FROM "Question" q
            INNER JOIN "Level" l ON l.id = q.level_id
            WHERE l."order" = ${order}
              AND q.topic_id IN (${Prisma.join(topicIds)})
          ) sampled
          WHERE rn <= ${maxNeed}
        `
      : [];

  const byTopic = new Map<string, BoardSampleRow[]>();
  const countByTopic = new Map<string, number>();
  for (const row of rows) {
    const list = byTopic.get(row.topic_id) ?? [];
    list.push(row);
    byTopic.set(row.topic_id, list);
    countByTopic.set(row.topic_id, Number(row.topic_count));
  }

  const picked: string[] = [];
  for (const [topicId, need] of counts) {
    if (need <= 0) continue;
    const have = countByTopic.get(topicId) ?? 0;
    const pool = (byTopic.get(topicId) ?? []).slice().sort((a, b) => Number(a.rn) - Number(b.rn));
    const take = Math.min(need, pool.length);
    if (take < need) {
      warnings.push(
        `Topic "${parts.find((p) => p.topicId === topicId)?.topic.name ?? topicId}": need ${need}, only ${have} in bank`
      );
    }
    picked.push(...pool.slice(0, take).map((row) => row.id));
  }

  const missing = total - picked.length;
  if (missing > 0) {
    const more =
      picked.length === 0
        ? await prisma.$queryRaw<{ id: string }[]>`
            SELECT q.id AS id
            FROM "Question" q
            INNER JOIN "Level" l ON l.id = q.level_id
            WHERE l."order" = ${order}
              AND q.topic_id IN (${Prisma.join(topicIds)})
            ORDER BY random()
            LIMIT ${missing}
          `
        : await prisma.$queryRaw<{ id: string }[]>`
            SELECT q.id AS id
            FROM "Question" q
            INNER JOIN "Level" l ON l.id = q.level_id
            WHERE l."order" = ${order}
              AND q.topic_id IN (${Prisma.join(topicIds)})
              AND q.id NOT IN (${Prisma.join(picked)})
            ORDER BY random()
            LIMIT ${missing}
          `;
    picked.push(...more.map((row) => row.id));
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
  let counts: Map<string, number>;
  if (weightByBank) {
    const weights = new Map<string, number>();
    for (const unit of units) {
      weights.set(unit.key, await prisma.question.count({ where: unit.where }));
    }
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
