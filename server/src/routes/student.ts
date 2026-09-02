import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { pickQuestionsForTest } from "../services/testGenerator.js";
import { bandFromPercentage, applyAttemptResults } from "../services/resultAnalysis.js";
import { attendanceReportForStudent } from "../services/attendanceReport.js";
import { attendanceReportQuerySchema } from "../schemas/attendanceReportQuery.js";
import {
  getOrCreateTodayChallenge,
  getChallengeForStudent,
  submitDailyChallenge,
} from "../services/dailyChallenge.js";
import { getEngagementSummary, performCheckIn } from "../services/studentEngagement.js";
import {
  getMasteryDetail,
  getMasterySession,
  listMasteryQueue,
  markLearnComplete,
  startMasterySession,
  submitMasterySession,
} from "../services/topicMastery.js";
import { MasterySessionKind } from "@prisma/client";

const router = Router();
router.use(authMiddleware, requireRole("STUDENT"));

async function requireStudent(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { student: true },
  });
  return user?.student ?? null;
}

router.get("/home", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });

  const [engagement, challenge, masteryQueue] = await Promise.all([
    getEngagementSummary(prisma, student.id),
    getOrCreateTodayChallenge(prisma, student.id, student.classId),
    listMasteryQueue(prisma, student.id, student.classId),
  ]);

  res.json({
    engagement,
    dailyChallenge: challenge,
    masteryQueue,
  });
});

router.post("/check-in", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const result = await performCheckIn(prisma, student.id);
  res.json(result);
});

router.post("/daily-challenge/start", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const challenge = await getOrCreateTodayChallenge(prisma, student.id, student.classId);
  if (!challenge) {
    return res.status(400).json({
      error: "No daily challenge available — ask your teacher to add skill questions for your class.",
    });
  }
  res.json(challenge);
});

router.get("/daily-challenge/:challengeId", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const challenge = await getChallengeForStudent(prisma, student.id, req.params.challengeId);
  if (!challenge) return res.status(404).json({ error: "Challenge not found" });

  const questions = challenge.questions.map((cq) => {
    const q = cq.question;
    const base = {
      id: q.id,
      stem: q.stem,
      stemImageUrl: q.stemImageUrl,
      options: [q.optionA, q.optionB, q.optionC, q.optionD],
      topicId: q.topicId,
      topicName: q.topic.name,
      orderIndex: cq.orderIndex,
    };
    if (challenge.status === "COMPLETED") {
      return {
        ...base,
        selectedOption: cq.selectedOption,
        correctOption: q.correctOption,
        isCorrect: cq.isCorrect,
      };
    }
    return base;
  });

  res.json({
    id: challenge.id,
    dayKey: challenge.dayKey,
    status: challenge.status,
    subjectName: challenge.subject.name,
    levelName: challenge.level.name,
    focusTopicNames: challenge.focusTopicNames,
    score: challenge.score,
    maxScore: challenge.maxScore,
    percentage: challenge.percentage,
    xpAwarded: challenge.xpAwarded,
    questions,
  });
});

router.post("/daily-challenge/:challengeId/submit", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });

  const parsed = z
    .object({
      answers: z.array(
        z.object({
          questionId: z.string(),
          selectedOption: z.number().int().min(0).max(3),
        })
      ),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const result = await submitDailyChallenge(
    prisma,
    student.id,
    req.params.challengeId,
    parsed.data.answers
  );

  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ error: "Challenge not found" });
    if (result.error === "already_completed") {
      return res.status(409).json({
        error: "Already completed",
        score: result.score,
        maxScore: result.maxScore,
        percentage: result.percentage,
        xpAwarded: result.xpAwarded,
      });
    }
    if (result.error === "incomplete") return res.status(400).json({ error: "Answer every question" });
    return res.status(400).json({ error: "Invalid answers" });
  }

  res.json(result);
});

router.get("/mastery", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const queue = await listMasteryQueue(prisma, student.id, student.classId);
  res.json({ items: queue });
});

router.get("/mastery/:masteryId", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const detail = await getMasteryDetail(prisma, student.id, req.params.masteryId);
  if (!detail) return res.status(404).json({ error: "Mastery path not found" });
  res.json(detail);
});

router.post("/mastery/:masteryId/learn", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const result = await markLearnComplete(prisma, student.id, req.params.masteryId);
  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ error: "Not found" });
    return res.status(400).json({ error: "Already mastered" });
  }
  res.json(result);
});

router.post("/mastery/:masteryId/start", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const parsed = z
    .object({ kind: z.enum(["PRACTICE", "RECHECK"]) })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const masteryId = req.params.masteryId;
  if (!masteryId) return res.status(400).json({ error: "Missing mastery id" });

  const result = await startMasterySession(
    prisma,
    student.id,
    masteryId,
    parsed.data.kind === "RECHECK" ? MasterySessionKind.RECHECK : MasterySessionKind.PRACTICE
  );
  if ("error" in result) {
    const map: Record<string, [number, string]> = {
      not_found: [404, "Not found"],
      already_mastered: [400, "Already mastered"],
      recheck_not_ready: [400, "Pass practice first, then recheck"],
      learn_first: [400, "Complete the Learn step first"],
      no_questions: [400, "No questions available for this topic"],
    };
    const errKey = result.error;
    const [code, msg] = (errKey && map[errKey]) || [400, "Could not start"];
    return res.status(code).json({ error: msg });
  }
  res.json(result);
});

router.get("/mastery/sessions/:sessionId", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const session = await getMasterySession(prisma, student.id, req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const questions = session.questions.map((sq) => {
    const q = sq.question;
    const base = {
      id: q.id,
      stem: q.stem,
      stemImageUrl: q.stemImageUrl,
      options: [q.optionA, q.optionB, q.optionC, q.optionD],
      orderIndex: sq.orderIndex,
    };
    if (session.status === "COMPLETED") {
      return {
        ...base,
        selectedOption: sq.selectedOption,
        correctOption: q.correctOption,
        isCorrect: sq.isCorrect,
      };
    }
    return base;
  });

  res.json({
    id: session.id,
    kind: session.kind,
    status: session.status,
    topicName: session.topicMastery.topic.name,
    subjectName: session.topicMastery.subject.name,
    levelName: session.topicMastery.level.name,
    masteryId: session.topicMasteryId,
    score: session.score,
    maxScore: session.maxScore,
    percentage: session.percentage,
    xpAwarded: session.xpAwarded,
    questions,
  });
});

router.post("/mastery/sessions/:sessionId/submit", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) return res.status(400).json({ error: "Not a student" });
  const parsed = z
    .object({
      answers: z.array(
        z.object({
          questionId: z.string(),
          selectedOption: z.number().int().min(0).max(3),
        })
      ),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const result = await submitMasterySession(
    prisma,
    student.id,
    req.params.sessionId,
    parsed.data.answers
  );
  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ error: "Session not found" });
    if (result.error === "already_completed") {
      return res.status(409).json({
        error: "Already completed",
        score: result.score,
        maxScore: result.maxScore,
        percentage: result.percentage,
        xpAwarded: result.xpAwarded,
      });
    }
    return res.status(400).json({ error: "Answer every question" });
  }
  res.json(result);
});

router.get("/subjects", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const classSubjects = await prisma.classSubject.findMany({
    where: { classId: user.student.classId },
    include: { subject: true },
  });
  res.json(
    classSubjects.map((cs) => ({
      id: cs.subject.id,
      name: cs.subject.name,
      code: cs.subject.code,
    }))
  );
});

router.get("/attendance/report", async (req, res) => {
  const parsed = attendanceReportQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) return res.status(400).json({ error: "Not a student" });
  const report = await attendanceReportForStudent(prisma, user.student.id, {
    range: parsed.data.range,
    anchorDate: parsed.data.date,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  if (!report) return res.status(404).json({ error: "Student not found" });
  if ("error" in report) return res.status(400).json({ error: report.error });
  res.json(report);
});

router.get("/subjects/:subjectId/levels", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const subjectId = req.params.subjectId;
  const allowed = await prisma.classSubject.findFirst({
    where: { classId: user.student.classId, subjectId },
  });
  if (!allowed) {
    res.status(403).json({ error: "Subject not available for your class" });
    return;
  }

  const levels = await prisma.level.findMany({
    where: { subjectId },
    orderBy: { order: "asc" },
    include: {
      testConfig: true,
      _count: { select: { levelTopicParticipations: true } },
    },
  });

  const progress = await prisma.studentProgress.findMany({
    where: { studentId: user.student.id, subjectId },
  });
  const progressByLevel = new Map(progress.map((p) => [p.levelId, p]));

  res.json(
    levels.map((lvl, idx) => {
      const p = progressByLevel.get(lvl.id);
      let unlocked = false;
      if (idx === 0) {
        unlocked = true;
      } else {
        const prev = levels[idx - 1];
        const prevP = progressByLevel.get(prev.id);
        const prevOk = (prevP?.lastPercentage ?? 0) > 80;
        unlocked = prevOk || (p?.unlocked ?? false);
      }
      return {
        id: lvl.id,
        name: lvl.name,
        order: lvl.order,
        questionCount: lvl.testConfig?.questionCount ?? null,
        topicsConfigured: lvl._count.levelTopicParticipations,
        unlocked,
        lastPercentage: p?.lastPercentage ?? null,
      };
    })
  );
});

const startSchema = z.object({
  subjectId: z.string(),
  levelId: z.string(),
});

router.post("/tests/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { subjectId, levelId } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }

  const allowed = await prisma.classSubject.findFirst({
    where: { classId: user.student.classId, subjectId },
  });
  if (!allowed) {
    res.status(403).json({ error: "Subject not allowed" });
    return;
  }

  const level = await prisma.level.findFirst({ where: { id: levelId, subjectId } });
  if (!level) {
    res.status(404).json({ error: "Level not found" });
    return;
  }

  const existing = await prisma.test.findFirst({
    where: {
      studentId: user.student.id,
      subjectId,
      levelId,
      status: "IN_PROGRESS",
    },
    include: {
      testQuestions: { select: { id: true } },
    },
    orderBy: { startedAt: "desc" },
  });
  if (existing && existing.testQuestions.length > 0) {
    res.json({ testId: existing.id, questionCount: existing.testQuestions.length, warnings: [], resumed: true });
    return;
  }

  const { questionIds, warnings } = await pickQuestionsForTest(prisma, levelId);
  if (questionIds.length === 0) {
    res.status(400).json({ error: "No questions available for this level", warnings });
    return;
  }

  const test = await prisma.test.create({
    data: {
      studentId: user.student.id,
      subjectId,
      levelId,
      status: "IN_PROGRESS",
      testQuestions: {
        create: questionIds.map((qid, i) => ({
          questionId: qid,
          orderIndex: i,
        })),
      },
    },
  });

  res.json({ testId: test.id, questionCount: questionIds.length, warnings, resumed: false });
});

function stripQuestion(q: {
  id: string;
  stem: string;
  stemImageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  topicId: string;
}) {
  return {
    id: q.id,
    stem: q.stem,
    stemImageUrl: q.stemImageUrl ?? null,
    options: [q.optionA, q.optionB, q.optionC, q.optionD],
    topicId: q.topicId,
  };
}

router.get("/tests/:testId", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { student: true },
  });
  if (!user?.student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }

  const test = await prisma.test.findFirst({
    where: { id: req.params.testId, studentId: user.student.id },
    include: {
      subject: true,
      level: true,
      testQuestions: {
        orderBy: { orderIndex: "asc" },
        include: { question: { include: { topic: true } } },
      },
      attempts: true,
    },
  });

  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  if (test.status === "COMPLETED" && test.attempts[0]) {
    const attempt = test.attempts[0];
    const answers = await prisma.studentAnswer.findMany({
      where: { testAttemptId: attempt.id },
      include: { question: { include: { topic: true } } },
    });

    const topicMap = new Map<string, { correct: number; total: number; name: string }>();
    for (const a of answers) {
      const tid = a.question.topicId;
      const cur = topicMap.get(tid) ?? { correct: 0, total: 0, name: a.question.topic.name };
      cur.total += 1;
      if (a.isCorrect) cur.correct += 1;
      topicMap.set(tid, cur);
    }

    const topicWise = [...topicMap.entries()].map(([topicId, v]) => ({
      topicId,
      topicName: v.name,
      correct: v.correct,
      total: v.total,
      percentage: v.total ? Math.round((100 * v.correct) / v.total) : 0,
    }));

    const strongTopics = topicWise.filter((t) => t.percentage >= 80).map((t) => t.topicName);
    const weakTopics = topicWise.filter((t) => t.percentage < 50).map((t) => t.topicName);

    res.json({
      status: "completed",
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      band: attempt.band,
      suggestedNextLevelId: attempt.suggestedNextLevelId,
      topicWise,
      strongTopics,
      weakTopics,
      subject: test.subject.name,
      level: test.level.name,
    });
    return;
  }

  res.json({
    status: "in_progress",
    subject: test.subject.name,
    level: test.level.name,
    questions: test.testQuestions.map((tq) => stripQuestion(tq.question)),
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

  const test = await prisma.test.findFirst({
    where: { id: req.params.testId, studentId: user.student.id },
    include: {
      attempts: { include: { studentAnswers: true } },
      testQuestions: {
        orderBy: { orderIndex: "asc" },
        include: { question: { include: { topic: true } } },
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
  const answerByQ = new Map(attempt.studentAnswers.map((a) => [a.questionId, a]));

  const questions = test.testQuestions.map((tq) => {
    const q = tq.question;
    const sa = answerByQ.get(q.id);
    return {
      id: q.id,
      stem: q.stem,
      stemImageUrl: q.stemImageUrl ?? null,
      options: [q.optionA, q.optionB, q.optionC, q.optionD],
      selectedOption: sa?.selectedOption ?? null,
      correctOption: q.correctOption,
      isCorrect: sa?.isCorrect ?? false,
      topicId: q.topicId,
      topicName: q.topic.name,
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
      selectedOption: z.number().min(0).max(3),
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
    const studentRecordId = user.student.id;

    const test = await prisma.test.findFirst({
      where: { id: req.params.testId, studentId: studentRecordId, status: "IN_PROGRESS" },
      include: {
        testQuestions: { include: { question: true } },
        subject: true,
        level: true,
      },
    });

    if (!test) {
      res.status(404).json({ error: "Test not found or already submitted" });
      return;
    }

    const answerByQ = new Map(parsed.data.answers.map((a) => [a.questionId, a.selectedOption]));
    const expectedIds = new Set(test.testQuestions.map((tq) => tq.questionId));
    if (answerByQ.size !== expectedIds.size || [...expectedIds].some((id) => !answerByQ.has(id))) {
      res.status(400).json({ error: "Answer every question" });
      return;
    }

    let score = 0;
    const maxScore = test.testQuestions.length;
    const topicScores = new Map<string, { correct: number; total: number }>();

    for (const tq of test.testQuestions) {
      const q = tq.question;
      const sel = answerByQ.get(q.id)!;
      const isCorrect = sel === q.correctOption;
      if (isCorrect) score += 1;
      const cur = topicScores.get(q.topicId) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (isCorrect) cur.correct += 1;
      topicScores.set(q.topicId, cur);
    }

    const percentage = maxScore ? (100 * score) / maxScore : 0;
    const band = bandFromPercentage(percentage);

    const levels = await prisma.level.findMany({
      where: { subjectId: test.subjectId },
      orderBy: { order: "asc" },
    });
    const currentIdx = levels.findIndex((l) => l.id === test.levelId);
    let suggestedNextLevelId: string | null = null;
    if (percentage > 80 && currentIdx >= 0 && currentIdx < levels.length - 1) {
      suggestedNextLevelId = levels[currentIdx + 1].id;
    }

    const markedCompleted = await prisma.test.updateMany({
      where: { id: test.id, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (markedCompleted.count === 0) {
      res.status(409).json({ error: "Test already submitted" });
      return;
    }

    await prisma.testAttempt.create({
      data: {
        testId: test.id,
        score,
        maxScore,
        percentage,
        band,
        suggestedNextLevelId,
        studentAnswers: {
          create: test.testQuestions.map((tq) => {
            const q = tq.question;
            const sel = answerByQ.get(q.id)!;
            return {
              questionId: q.id,
              selectedOption: sel,
              isCorrect: sel === q.correctOption,
            };
          }),
        },
      },
    });

    await applyAttemptResults(prisma, {
      studentId: studentRecordId,
      subjectId: test.subjectId,
      levelId: test.levelId,
      testId: test.id,
      percentage,
      topicScores,
    });

    const topicWise = await Promise.all(
      [...topicScores.entries()].map(async ([topicId, v]) => {
        const topic = await prisma.topic.findUnique({ where: { id: topicId } });
        return {
          topicId,
          topicName: topic?.name ?? topicId,
          correct: v.correct,
          total: v.total,
          percentage: v.total ? Math.round((100 * v.correct) / v.total) : 0,
        };
      })
    );

    const strongTopics = topicWise.filter((t) => t.percentage >= 80).map((t) => t.topicName);
    const weakTopics = topicWise.filter((t) => t.percentage < 50).map((t) => t.topicName);

    res.json({
      score,
      maxScore,
      percentage: Math.round(percentage * 10) / 10,
      band,
      suggestedNextLevelId,
      topicWise,
      strongTopics,
      weakTopics,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Test already submitted" });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Failed to submit test" });
  }
});

export default router;
