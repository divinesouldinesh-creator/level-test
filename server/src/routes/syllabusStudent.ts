import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { buildSyllabusTestQuestions } from "../services/syllabusTestBuilder.js";

const router = Router();
router.use(authMiddleware, requireRole("STUDENT"));

const MAX_QUESTIONS_PER_TEST = 100;
const DEFAULT_QUESTIONS_PER_TEST = 10;

router.get("/subjects", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const list = await prisma.syllabusSubject.findMany({
    where: { schoolClassId: user.student.classId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { chapters: true } },
    },
  });
  res.json(
    list.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      chapterCount: s._count.chapters,
    }))
  );
});

router.get("/subjects/:subjectId/chapters", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const subjectId = req.params.subjectId;
  const subject = await prisma.syllabusSubject.findFirst({
    where: { id: subjectId, schoolClassId: user.student.classId },
  });
  if (!subject) {
    res.status(403).json({ error: "Subject not available for your class" });
    return;
  }
  const chapters = await prisma.chapter.findMany({
    where: { syllabusSubjectId: subjectId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { questions: true } } },
  });
  res.json(
    chapters.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      questionCount: c._count.questions,
    }))
  );
});

const startSchema = z.object({
  syllabusSubjectId: z.string(),
  chapterIds: z.array(z.string()).min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  questionCount: z.number().int().min(1).max(MAX_QUESTIONS_PER_TEST).optional(),
});

router.post("/tests/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }

  const subject = await prisma.syllabusSubject.findFirst({
    where: { id: parsed.data.syllabusSubjectId, schoolClassId: user.student.classId },
  });
  if (!subject) {
    res.status(403).json({ error: "Subject not available for your class" });
    return;
  }

  const chapters = await prisma.chapter.findMany({
    where: {
      id: { in: parsed.data.chapterIds },
      syllabusSubjectId: parsed.data.syllabusSubjectId,
    },
  });
  if (chapters.length !== parsed.data.chapterIds.length) {
    res.status(400).json({ error: "One or more chapters do not belong to this subject" });
    return;
  }

  const totalCount = parsed.data.questionCount ?? DEFAULT_QUESTIONS_PER_TEST;
  const built = await buildSyllabusTestQuestions(prisma, {
    chapterIds: chapters.map((c) => c.id),
    difficulty: parsed.data.difficulty,
    totalCount,
  });

  if (built.questionIds.length === 0) {
    res.status(400).json({
      error: "No questions available for the selected chapters and difficulty.",
      warnings: built.warnings,
    });
    return;
  }

  const test = await prisma.syllabusTest.create({
    data: {
      studentId: user.student.id,
      syllabusSubjectId: parsed.data.syllabusSubjectId,
      difficulty: parsed.data.difficulty,
      questionCount: built.questionIds.length,
      status: "IN_PROGRESS",
      testChapters: {
        create: chapters.map((c) => ({ chapterId: c.id })),
      },
      testQuestions: {
        create: built.questionIds.map((qid, i) => ({
          syllabusQuestionId: qid,
          orderIndex: i,
        })),
      },
    },
  });

  res.json({
    testId: test.id,
    questionCount: built.questionIds.length,
    requestedCount: totalCount,
    warnings: built.warnings,
  });
});

router.get("/tests/:testId", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }

  const test = await prisma.syllabusTest.findFirst({
    where: { id: req.params.testId, studentId: user.student.id },
    include: {
      syllabusSubject: true,
      testChapters: { include: { chapter: true } },
      testQuestions: {
        orderBy: { orderIndex: "asc" },
        include: { syllabusQuestion: { include: { topic: true, chapter: true } } },
      },
      attempts: { include: { studentAnswers: true } },
    },
  });

  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  if (test.status === "COMPLETED" && test.attempts[0]) {
    const attempt = test.attempts[0];
    const ansByQ = new Map(attempt.studentAnswers.map((a) => [a.syllabusQuestionId, a]));
    const chapterMap = new Map<
      string,
      { name: string; correct: number; total: number }
    >();
    for (const tq of test.testQuestions) {
      const a = ansByQ.get(tq.syllabusQuestionId);
      const ch = tq.syllabusQuestion.chapter;
      const cur = chapterMap.get(ch.id) ?? { name: ch.name, correct: 0, total: 0 };
      cur.total += 1;
      if (a?.isCorrect) cur.correct += 1;
      chapterMap.set(ch.id, cur);
    }
    const chapterWise = [...chapterMap.entries()].map(([id, v]) => ({
      chapterId: id,
      chapterName: v.name,
      correct: v.correct,
      total: v.total,
      percentage: v.total ? Math.round((100 * v.correct) / v.total) : 0,
    }));
    res.json({
      status: "completed",
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      subject: test.syllabusSubject.name,
      difficulty: test.difficulty,
      chapters: test.testChapters.map((tc) => tc.chapter.name),
      chapterWise,
    });
    return;
  }

  res.json({
    status: "in_progress",
    subject: test.syllabusSubject.name,
    difficulty: test.difficulty,
    chapters: test.testChapters.map((tc) => tc.chapter.name),
    questions: test.testQuestions.map((tq) => ({
      id: tq.syllabusQuestion.id,
      stem: tq.syllabusQuestion.stem,
      options: [
        tq.syllabusQuestion.optionA,
        tq.syllabusQuestion.optionB,
        tq.syllabusQuestion.optionC,
        tq.syllabusQuestion.optionD,
      ],
      chapterId: tq.syllabusQuestion.chapterId,
      topicId: tq.syllabusQuestion.topicId,
    })),
  });
});

router.get("/tests/:testId/review", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }

  const test = await prisma.syllabusTest.findFirst({
    where: { id: req.params.testId, studentId: user.student.id },
    include: {
      attempts: { include: { studentAnswers: true } },
      testQuestions: {
        orderBy: { orderIndex: "asc" },
        include: {
          syllabusQuestion: {
            include: { topic: true, chapter: true },
          },
        },
      },
    },
  });
  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }
  if (test.status !== "COMPLETED" || !test.attempts[0]) {
    res.status(400).json({ error: "Test not yet submitted" });
    return;
  }
  const attempt = test.attempts[0];
  const answerByQ = new Map(attempt.studentAnswers.map((a) => [a.syllabusQuestionId, a]));
  const questions = test.testQuestions.map((tq) => {
    const q = tq.syllabusQuestion;
    const sa = answerByQ.get(q.id);
    return {
      id: q.id,
      stem: q.stem,
      options: [q.optionA, q.optionB, q.optionC, q.optionD],
      selectedOption: sa?.selectedOption ?? null,
      correctOption: q.correctOption,
      isCorrect: sa?.isCorrect ?? false,
      topicId: q.topicId,
      topicName: q.topic.name,
      chapterId: q.chapterId,
      chapterName: q.chapter.name,
    };
  });
  res.json({
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    questions,
  });
});

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      selectedOption: z.number().int().min(0).max(3),
    })
  ),
});

router.post("/tests/:testId/submit", async (req, res) => {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { student: true },
    });
    if (!user?.student) {
      res.status(400).json({ error: "Not a student" });
      return;
    }

    const test = await prisma.syllabusTest.findFirst({
      where: { id: req.params.testId, studentId: user.student.id, status: "IN_PROGRESS" },
      include: {
        testQuestions: { include: { syllabusQuestion: { include: { chapter: true } } } },
      },
    });
    if (!test) {
      res.status(404).json({ error: "Test not found or already submitted" });
      return;
    }

    const answerByQ = new Map(parsed.data.answers.map((a) => [a.questionId, a.selectedOption]));
    const expectedIds = new Set(test.testQuestions.map((tq) => tq.syllabusQuestionId));
    if (
      answerByQ.size !== expectedIds.size ||
      [...expectedIds].some((id) => !answerByQ.has(id))
    ) {
      res.status(400).json({ error: "Answer every question" });
      return;
    }

    let score = 0;
    const maxScore = test.testQuestions.length;
    const chapterScores = new Map<string, { name: string; correct: number; total: number }>();
    for (const tq of test.testQuestions) {
      const q = tq.syllabusQuestion;
      const sel = answerByQ.get(q.id)!;
      const isCorrect = sel === q.correctOption;
      if (isCorrect) score += 1;
      const cur = chapterScores.get(q.chapterId) ?? { name: q.chapter.name, correct: 0, total: 0 };
      cur.total += 1;
      if (isCorrect) cur.correct += 1;
      chapterScores.set(q.chapterId, cur);
    }
    const percentage = maxScore ? (100 * score) / maxScore : 0;

    const marked = await prisma.syllabusTest.updateMany({
      where: { id: test.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (marked.count === 0) {
      res.status(409).json({ error: "Test already submitted" });
      return;
    }

    await prisma.syllabusTestAttempt.create({
      data: {
        testId: test.id,
        score,
        maxScore,
        percentage,
        studentAnswers: {
          create: test.testQuestions.map((tq) => {
            const q = tq.syllabusQuestion;
            const sel = answerByQ.get(q.id)!;
            return {
              syllabusQuestionId: q.id,
              selectedOption: sel,
              isCorrect: sel === q.correctOption,
            };
          }),
        },
      },
    });

    const chapterWise = [...chapterScores.entries()].map(([id, v]) => ({
      chapterId: id,
      chapterName: v.name,
      correct: v.correct,
      total: v.total,
      percentage: v.total ? Math.round((100 * v.correct) / v.total) : 0,
    }));

    res.json({
      score,
      maxScore,
      percentage: Math.round(percentage * 10) / 10,
      chapterWise,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      res.status(409).json({ error: "Test already submitted" });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Failed to submit syllabus test" });
  }
});

export default router;
