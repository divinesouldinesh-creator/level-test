import { prisma } from "../lib/prisma.js";

/** Subjects whose individual app marks must not be sent to teachers. */
export async function subjectIdsHidingTeacherMarks(): Promise<Set<string>> {
  const rows = await prisma.subject.findMany({
    where: { teacherMarksVisible: false },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** Topics that appear in a subject with teacher marks hidden. Named per-student topic scores use this. */
export async function topicIdsWithHiddenTeacherMarks(hiddenSubjectIds: Set<string>): Promise<Set<string>> {
  if (hiddenSubjectIds.size === 0) return new Set();
  const rows = await prisma.question.groupBy({
    by: ["topicId"],
    where: { subjectId: { in: [...hiddenSubjectIds] } },
  });
  return new Set(rows.map((r) => r.topicId));
}
