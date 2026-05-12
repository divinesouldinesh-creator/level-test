import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware, requireRole("TEACHER"));

/** Syllabus subjects linked to a class (same scope students see). */
router.get("/subjects", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  if (!classId) {
    res.status(400).json({ error: "classId required" });
    return;
  }

  const subjects = await prisma.syllabusSubject.findMany({
    where: { schoolClassId: classId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
  res.json(subjects);
});

/** Per-student activity for one syllabus subject in a class. */
router.get("/students", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const syllabusSubjectId =
    typeof req.query.syllabusSubjectId === "string" ? req.query.syllabusSubjectId : "";
  if (!classId || !syllabusSubjectId) {
    res.status(400).json({ error: "classId and syllabusSubjectId required" });
    return;
  }

  const subject = await prisma.syllabusSubject.findFirst({
    where: { id: syllabusSubjectId, schoolClassId: classId },
  });
  if (!subject) {
    res.status(404).json({ error: "Syllabus subject not found for this class" });
    return;
  }

  const students = await prisma.student.findMany({
    where: { classId },
    include: {
      schoolClass: { select: { name: true } },
      user: { select: { studentLoginId: true } },
    },
    orderBy: { fullName: "asc" },
  });

  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) {
    res.json([]);
    return;
  }

  const completedGrouped = await prisma.syllabusTest.groupBy({
    by: ["studentId"],
    where: {
      studentId: { in: studentIds },
      syllabusSubjectId,
      status: "COMPLETED",
      completedAt: { not: null },
    },
    _max: { completedAt: true },
  });

  const inProgressGrouped = await prisma.syllabusTest.groupBy({
    by: ["studentId"],
    where: {
      studentId: { in: studentIds },
      syllabusSubjectId,
      status: "IN_PROGRESS",
    },
  });
  const inProgressSet = new Set(inProgressGrouped.map((t) => t.studentId));

  const completedMap = new Map(
    completedGrouped.map((g) => [g.studentId, g._max.completedAt] as const)
  );

  res.json(
    students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      studentLoginId: s.user.studentLoginId,
      className: s.schoolClass.name,
      hasCompletedTest: completedMap.has(s.id),
      hasInProgressTest: inProgressSet.has(s.id),
      lastCompletedTestAt: completedMap.get(s.id) ?? null,
    }))
  );
});

/** Completed syllabus tests for one student + subject (marks and history). */
router.get("/student/:studentId/detail", async (req, res) => {
  const syllabusSubjectId =
    typeof req.query.syllabusSubjectId === "string" ? req.query.syllabusSubjectId : "";
  if (!syllabusSubjectId) {
    res.status(400).json({ error: "syllabusSubjectId required" });
    return;
  }

  const student = await prisma.student.findUnique({
    where: { id: req.params.studentId },
    include: {
      schoolClass: { select: { name: true } },
      user: { select: { studentLoginId: true } },
    },
  });
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const subject = await prisma.syllabusSubject.findFirst({
    where: { id: syllabusSubjectId, schoolClassId: student.classId },
  });
  if (!subject) {
    res.status(404).json({ error: "Syllabus subject not found for this student's class" });
    return;
  }

  const tests = await prisma.syllabusTest.findMany({
    where: {
      studentId: student.id,
      syllabusSubjectId,
      status: "COMPLETED",
    },
    include: {
      attempts: true,
      testChapters: { include: { chapter: { select: { name: true } } } },
    },
    orderBy: { completedAt: "desc" },
    take: 50,
  });

  const lastCompleted = tests[0]?.completedAt ?? null;

  res.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      studentLoginId: student.user.studentLoginId,
      className: student.schoolClass.name,
    },
    syllabusSubject: { id: subject.id, name: subject.name, code: subject.code },
    lastCompletedTestAt: lastCompleted,
    tests: tests.map((t) => ({
      testId: t.id,
      completedAt: t.completedAt,
      score: t.attempts[0]?.score ?? null,
      maxScore: t.attempts[0]?.maxScore ?? null,
      percentage: t.attempts[0]?.percentage ?? null,
      difficulty: t.difficulty,
      questionCount: t.questionCount,
      chapters:
        t.testChapters.length > 0
          ? t.testChapters.map((tc) => tc.chapter.name).join(", ")
          : null,
    })),
  });
});

export default router;
