import type { Prisma, PrismaClient } from "@prisma/client";

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
