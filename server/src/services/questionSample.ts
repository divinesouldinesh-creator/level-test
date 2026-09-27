import { Prisma, type PrismaClient } from "@prisma/client";

export type QuestionSampleFilter = {
  topicId?: string;
  levelIds?: string[];
  subjectId?: string;
  levelIdNull?: boolean;
  chapterTopicId?: string;
};

type SampleRow = { id: string; grp: string; rn: number | bigint; grp_count: number | bigint | string };

function matchSql(filter: QuestionSampleFilter): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];
  if (filter.topicId) parts.push(Prisma.sql`q.topic_id = ${filter.topicId}`);
  if (filter.levelIds) {
    if (filter.levelIds.length === 0) return null;
    parts.push(Prisma.sql`q.level_id IN (${Prisma.join(filter.levelIds)})`);
  }
  if (filter.levelIdNull) parts.push(Prisma.sql`q.level_id IS NULL`);
  if (filter.subjectId) parts.push(Prisma.sql`q.subject_id = ${filter.subjectId}`);
  if (filter.chapterTopicId) parts.push(Prisma.sql`q.chapter_topic_id = ${filter.chapterTopicId}`);
  if (parts.length === 0) return null;
  return Prisma.join(parts, " AND ");
}

function whereSql(match: Prisma.Sql, exclude: string[]): Prisma.Sql {
  if (exclude.length === 0) return match;
  return Prisma.sql`${match} AND q.id NOT IN (${Prisma.join(exclude)})`;
}

/** A few random ids from one bank, in a single query. */
export async function sampleQuestionIds(
  prisma: PrismaClient,
  filter: QuestionSampleFilter,
  need: number,
  exclude: string[] = []
): Promise<{ ids: string[]; available: number }> {
  const match = matchSql(filter);
  if (!match || need <= 0) return { ids: [], available: 0 };
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT q.id AS id
    FROM "Question" q
    WHERE ${whereSql(match, exclude)}
    ORDER BY random()
    LIMIT ${need}
  `;
  const ids = rows.map((row) => row.id);
  return { ids, available: ids.length < need ? ids.length : need };
}

/** Random ids from several banks when a paper still needs a few more questions. */
export async function sampleQuestionIdsAny(
  prisma: PrismaClient,
  filters: QuestionSampleFilter[],
  need: number,
  exclude: string[] = []
): Promise<{ ids: string[]; available: number }> {
  const matches = filters.map(matchSql).filter((sql): sql is Prisma.Sql => sql != null);
  if (matches.length === 0 || need <= 0) return { ids: [], available: 0 };
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT q.id AS id
    FROM "Question" q
    WHERE ${whereSql(Prisma.sql`(${Prisma.join(matches, " OR ")})`, exclude)}
    ORDER BY random()
    LIMIT ${need}
  `;
  const ids = rows.map((row) => row.id);
  return { ids, available: ids.length < need ? ids.length : need };
}

/**
 * One query for every chapter in a level test.
 * Each chapter keeps its own quota. The database sorts only those chapters, then returns the rows needed.
 */
export async function sampleLevelTopics(
  prisma: PrismaClient,
  needs: { order: number; topicId: string; need: number }[]
): Promise<Map<string, { ids: string[]; available: number }>> {
  const result = new Map<string, { ids: string[]; available: number }>();
  for (const row of needs) result.set(row.topicId, { ids: [], available: 0 });
  const active = needs.filter((row) => row.need > 0 && row.topicId);
  if (active.length === 0) return result;

  const byOrder = new Map<number, string[]>();
  for (const row of needs) {
    const list = byOrder.get(row.order) ?? [];
    list.push(row.topicId);
    byOrder.set(row.order, list);
  }
  const bankMatch = Prisma.join(
    [...byOrder.entries()].map(
      ([order, ids]) => Prisma.sql`(l."order" = ${order} AND q.topic_id IN (${Prisma.join(ids)}))`
    ),
    " OR "
  );
  const maxNeed = Math.max(...active.map((row) => row.need));
  const rows = await prisma.$queryRaw<SampleRow[]>`
    SELECT id, grp, rn, grp_count FROM (
      SELECT q.id AS id,
             q.topic_id AS grp,
             row_number() OVER (PARTITION BY q.topic_id ORDER BY random()) AS rn,
             count(*) OVER (PARTITION BY q.topic_id) AS grp_count
      FROM "Question" q
      INNER JOIN "Level" l ON l.id = q.level_id
      WHERE ${bankMatch}
    ) sampled
    WHERE rn <= ${maxNeed}
  `;

  const needByTopic = new Map(needs.map((row) => [row.topicId, row.need]));
  for (const row of rows) {
    const slot = result.get(row.grp) ?? { ids: [], available: 0 };
    slot.available = Number(row.grp_count);
    if (slot.ids.length < (needByTopic.get(row.grp) ?? 0)) slot.ids.push(row.id);
    result.set(row.grp, slot);
  }
  return result;
}

export async function fillLevelTopics(
  prisma: PrismaClient,
  needs: { order: number; topicId: string }[],
  missing: number,
  exclude: string[]
): Promise<string[]> {
  if (missing <= 0 || needs.length === 0) return [];
  const byOrder = new Map<number, string[]>();
  for (const row of needs) {
    const list = byOrder.get(row.order) ?? [];
    list.push(row.topicId);
    byOrder.set(row.order, list);
  }
  const bankMatch = Prisma.join(
    [...byOrder.entries()].map(
      ([order, ids]) => Prisma.sql`(l."order" = ${order} AND q.topic_id IN (${Prisma.join(ids)}))`
    ),
    " OR "
  );
  const excludeSql = exclude.length > 0 ? Prisma.sql`AND q.id NOT IN (${Prisma.join(exclude)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT q.id AS id
    FROM "Question" q
    INNER JOIN "Level" l ON l.id = q.level_id
    WHERE (${bankMatch})
    ${excludeSql}
    ORDER BY random()
    LIMIT ${missing}
  `;
  return rows.map((row) => row.id);
}

type BookUnit = { key: string; topicId?: string; chapterTopicId?: string };

function bookMatch(subjectId: string, units: BookUnit[]): Prisma.Sql | null {
  const topicIds = units.map((unit) => unit.topicId).filter((id): id is string => Boolean(id));
  const chapterTopicIds = units.map((unit) => unit.chapterTopicId).filter((id): id is string => Boolean(id));
  const parts: Prisma.Sql[] = [];
  if (topicIds.length > 0) parts.push(Prisma.sql`q.topic_id IN (${Prisma.join(topicIds)})`);
  if (chapterTopicIds.length > 0) parts.push(Prisma.sql`q.chapter_topic_id IN (${Prisma.join(chapterTopicIds)})`);
  if (parts.length === 0) return null;
  return Prisma.sql`q.subject_id = ${subjectId} AND q.level_id IS NULL AND (${Prisma.join(parts, " OR ")})`;
}

function bookGroup(units: BookUnit[]): Prisma.Sql {
  const chapterTopicIds = units.map((unit) => unit.chapterTopicId).filter((id): id is string => Boolean(id));
  if (chapterTopicIds.length === 0) return Prisma.sql`'ch:' || q.topic_id`;
  return Prisma.sql`CASE WHEN q.chapter_topic_id IN (${Prisma.join(chapterTopicIds)}) THEN 'tp:' || q.chapter_topic_id ELSE 'ch:' || q.topic_id END`;
}

/** How many questions each book chapter has, in one query. */
export async function countBookUnits(
  prisma: PrismaClient,
  subjectId: string,
  units: BookUnit[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const match = bookMatch(subjectId, units);
  if (!match) return counts;
  const grp = bookGroup(units);
  const rows = await prisma.$queryRaw<{ grp: string; n: number }[]>`
    SELECT ${grp} AS grp, count(*)::int AS n
    FROM "Question" q
    WHERE ${match}
    GROUP BY 1
  `;
  for (const row of rows) counts.set(row.grp, Number(row.n));
  return counts;
}

/** One query for a book test: each chapter or topic keeps its own quota. */
export async function sampleBookUnits(
  prisma: PrismaClient,
  subjectId: string,
  needs: { key: string; topicId?: string; chapterTopicId?: string; need: number }[]
): Promise<Map<string, { ids: string[]; available: number }>> {
  const result = new Map<string, { ids: string[]; available: number }>();
  for (const row of needs) result.set(row.key, { ids: [], available: 0 });
  const active = needs.filter((row) => row.need > 0);
  const match = bookMatch(subjectId, needs);
  if (!match || active.length === 0) return result;

  const grp = bookGroup(needs);
  const maxNeed = Math.max(...active.map((row) => row.need));
  const rows = await prisma.$queryRaw<SampleRow[]>`
    SELECT id, grp, rn, grp_count FROM (
      SELECT q.id AS id,
             ${grp} AS grp,
             row_number() OVER (PARTITION BY ${grp} ORDER BY random()) AS rn,
             count(*) OVER (PARTITION BY ${grp}) AS grp_count
      FROM "Question" q
      WHERE ${match}
    ) sampled
    WHERE rn <= ${maxNeed}
  `;
  const needByKey = new Map(needs.map((row) => [row.key, row.need]));
  for (const row of rows) {
    const slot = result.get(row.grp) ?? { ids: [], available: 0 };
    slot.available = Number(row.grp_count);
    if (slot.ids.length < (needByKey.get(row.grp) ?? 0)) slot.ids.push(row.id);
    result.set(row.grp, slot);
  }
  return result;
}
