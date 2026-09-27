import type { Prisma, PrismaClient } from "@prisma/client";

/** The level number whose question bank this chapter uses. */
export function bankOrder(levelOrder: number, questionLevelOrder: number | null | undefined): number {
  return questionLevelOrder ?? levelOrder;
}

/**
 * Level that owns this chapter's questions. A borrowed bank is stored on a level
 * with the source level number so every class reads the same rows.
 */
export async function questionHomeLevel(
  prisma: PrismaClient,
  levelId: string,
  topicId: string
): Promise<{ levelId: string; subjectId: string; order: number } | null> {
  const level = await prisma.level.findUnique({
    where: { id: levelId },
    select: {
      id: true,
      subjectId: true,
      order: true,
      levelTopicParticipations: {
        where: { topicId },
        select: { questionLevelOrder: true },
      },
    },
  });
  if (!level) return null;
  const order = bankOrder(level.order, level.levelTopicParticipations[0]?.questionLevelOrder);
  if (order === level.order) return { levelId: level.id, subjectId: level.subjectId, order };
  const home = await prisma.level.findFirst({
    where: {
      order,
      levelTopicParticipations: { some: { topicId, questionLevelOrder: null } },
    },
    select: { id: true, subjectId: true },
    orderBy: { id: "asc" },
  });
  if (home) return { levelId: home.id, subjectId: home.subjectId, order };
  const any = await prisma.level.findFirst({
    where: { order },
    select: { id: true, subjectId: true },
    orderBy: { id: "asc" },
  });
  return any ? { levelId: any.id, subjectId: any.subjectId, order } : { levelId: level.id, subjectId: level.subjectId, order };
}

/** Level number for a branch level. Chapter questions have no level and are not part of this bank. */
export async function levelOrder(prisma: PrismaClient, levelId: string): Promise<number | null> {
  const level = await prisma.level.findUnique({ where: { id: levelId }, select: { order: true } });
  return level?.order ?? null;
}

/**
 * Questions for this chapter at this level number, from any branch.
 * Level 0 and Level 1 stay separate. Book questions (no level) are not included.
 */
export function sharedLevelQuestionWhere(
  order: number,
  topicId: string | string[]
): Prisma.QuestionWhereInput {
  return {
    topicId: Array.isArray(topicId) ? { in: topicId } : topicId,
    level: { order },
  };
}

/** Every level id that uses this level number, so counts can include the shared bank. */
export async function levelIdsAtOrder(prisma: PrismaClient, order: number): Promise<string[]> {
  const rows = await prisma.level.findMany({ where: { order }, select: { id: true } });
  return rows.map((row) => row.id);
}
