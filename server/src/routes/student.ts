import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, isDatabaseUnreachable } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { pickQuestionsForTest, pickQuestionsForChapterTest } from "../services/testGenerator.js";
import { bandFromPercentage, applyAttemptResults } from "../services/resultAnalysis.js";
import { attendanceReportForStudent } from "../services/attendanceReport.js";
import { attendanceReportQuerySchema } from "../schemas/attendanceReportQuery.js";
import {
  getOrCreateTodayChallenge,
  getChallengeForStudent,
  submitDailyChallenge,
} from "../services/dailyChallenge.js";
import { getEngagementSummary, performCheckIn, recordDailyPractice } from "../services/studentEngagement.js";
import {
  getMasteryDetail,
  getMasterySession,
  listMasteryQueue,
  markLearnComplete,
  startMasterySession,
  submitMasterySession,
} from "../services/topicMastery.js";
import { MasterySessionKind } from "@prisma/client";
import { CACHE_KEY, CACHE_TTL_MS, cacheGetOrSet, invalidateStudentMastery } from "../lib/memoryCache.js";
import {
  isAttemptedAnswer,
  scoreSubmittedAnswer,
  tallyTestScore,
  toPublicQuestion,
} from "../services/questionAnswer.js";

const submittedAnswerSchema = z.object({
  questionId: z.string(),
  selectedOption: z.number().int().min(0).max(3).optional(),
  numericAnswer: z.number().finite().optional(),
});

const router = Router();
router.use(authMiddleware, requireRole("STUDENT"));

async function requireStudent(userId: string) {
  return cacheGetOrSet(CACHE_KEY.studentByUser(userId), CACHE_TTL_MS.studentProfile, () =>
    prisma.student.findUnique({ where: { userId } })
  );
}

function sendRouteError(res: import("express").Response, error: unknown, fallback: string) {
  console.error(error);
  if (isDatabaseUnreachable(error)) {
    res.status(503).json({ error: "Database is unreachable. Try again in a moment." });
    return;
  }
  res.status(500).json({ error: fallback });
}

router.get("/home", async (req, res) => {
  try {
    const student = await requireStudent(req.user!.sub);
    if (!student) return res.status(400).json({ error: "Not a student" });

    const engagement = await getEngagementSummary(prisma, student.id);

    res.json({
      engagement,
    });
  } catch (error) {
    sendRouteError(res, error, "Server error");
  }
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
      ...toPublicQuestion(q),
      topicName: q.topic.name,
      orderIndex: cq.orderIndex,
    };
    if (challenge.status === "COMPLETED") {
      return {
        ...base,
        selectedOption: cq.selectedOption,
        numericAnswer: cq.numericAnswer,
        correctOption: q.correctOption,
        correctNumeric: q.type === "NUMERIC" ? q.correctNumeric : null,
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
      answers: z.array(submittedAnswerSchema),
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
  const raw =
    typeof req.query.subjectId === "string"
      ? req.query.subjectId
      : typeof req.query.subjectIds === "string"
        ? req.query.subjectIds
        : "";
  const subjectIds = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const filterKey = subjectIds.length ? [...subjectIds].sort().join(",") : "all";
  const queue = await cacheGetOrSet(
    CACHE_KEY.studentMastery(student.id, filterKey),
    CACHE_TTL_MS.studentMastery,
    () =>
      listMasteryQueue(
        prisma,
        student.id,
        student.classId,
        subjectIds.length ? { subjectIds } : undefined
      )
  );
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
  invalidateStudentMastery(student.id);
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
      ...toPublicQuestion(q),
      orderIndex: sq.orderIndex,
    };
    if (session.status === "COMPLETED") {
      return {
        ...base,
        selectedOption: sq.selectedOption,
        numericAnswer: sq.numericAnswer,
        correctOption: q.correctOption,
        correctNumeric: q.type === "NUMERIC" ? q.correctNumeric : null,
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
      answers: z.array(submittedAnswerSchema),
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
  invalidateStudentMastery(student.id);
  res.json(result);
});

router.get("/subjects", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const payload = await cacheGetOrSet(
    CACHE_KEY.studentSubjects(student.classId),
    CACHE_TTL_MS.catalog,
    async () => {
      const classSubjects = await prisma.classSubject.findMany({
        where: { classId: student.classId },
        include: {
          subject: {
            include: { area: { select: { id: true, name: true, code: true } } },
          },
        },
      });
      return classSubjects.map((cs) => ({
        id: cs.subject.id,
        name: cs.subject.name,
        code: cs.subject.code,
        areaId: cs.subject.areaId,
        areaName: cs.subject.area?.name ?? null,
        areaCode: cs.subject.area?.code ?? null,
        testMode: cs.subject.testMode,
      }));
    }
  );
  res.json(payload);
});

router.get("/subject-areas", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const payload = await cacheGetOrSet(
    CACHE_KEY.studentAreas(student.classId),
    CACHE_TTL_MS.catalog,
    async () => {
      const classSubjects = await prisma.classSubject.findMany({
        where: { classId: student.classId },
        include: {
          subject: {
            include: { area: true },
          },
        },
      });
      const byArea = new Map<
        string,
        { id: string; name: string; code: string | null; branches: { id: string; name: string; code: string | null; testMode: string }[] }
      >();
      for (const cs of classSubjects) {
        const area = cs.subject.area;
        const areaKey = area?.id ?? "__none__";
        const areaName = area?.name ?? "Other";
        const areaCode = area?.code ?? null;
        if (!byArea.has(areaKey)) {
          byArea.set(areaKey, {
            id: areaKey,
            name: areaName,
            code: areaCode,
            branches: [],
          });
        }
        byArea.get(areaKey)!.branches.push({
          id: cs.subject.id,
          name: cs.subject.name,
          code: cs.subject.code,
          testMode: cs.subject.testMode,
        });
      }
      return [...byArea.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
  );
  res.json(payload);
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

router.get("/subjects/:subjectId/chapters", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const subjectId = req.params.subjectId;
  const allowed = await prisma.classSubject.findFirst({
    where: { classId: student.classId, subjectId },
    include: { subject: { select: { id: true, name: true, testMode: true, chapterTestQuestionCount: true, chapterNegativeMarking: true, chapterWrongPenalty: true } } },
  });
  if (!allowed) {
    res.status(403).json({ error: "Subject not available for your class" });
    return;
  }
  if (allowed.subject.testMode !== "CHAPTER") {
    res.status(400).json({ error: "This branch uses levels, not chapters" });
    return;
  }

  const chapters = await prisma.subjectChapter.findMany({
    where: { subjectId },
    orderBy: { sortOrder: "asc" },
    include: {
      topic: { select: { id: true, name: true } },
      chapterTopics: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
    },
  });
  const counts = await prisma.question.groupBy({
    by: ["topicId", "chapterTopicId"],
    where: {
      subjectId,
      levelId: null,
      topicId: { in: chapters.map((c) => c.topicId) },
    },
    _count: { _all: true },
  });
  const countByChapter = new Map<string, number>();
  const countByFolder = new Map<string, number>();
  for (const row of counts) {
    countByChapter.set(row.topicId, (countByChapter.get(row.topicId) ?? 0) + row._count._all);
    if (row.chapterTopicId) countByFolder.set(row.chapterTopicId, row._count._all);
  }

  res.json({
    subjectId: allowed.subject.id,
    subjectName: allowed.subject.name,
    testMode: allowed.subject.testMode,
    questionCount: allowed.subject.chapterTestQuestionCount,
    negativeMarking: allowed.subject.chapterNegativeMarking,
    wrongPenalty: allowed.subject.chapterNegativeMarking ? allowed.subject.chapterWrongPenalty : 0,
    chapters: chapters.map((c) => ({
      id: c.topic.id,
      name: c.topic.name,
      questionCount: countByChapter.get(c.topicId) ?? 0,
      topics: c.chapterTopics.map((t) => ({
        id: t.id,
        name: t.name,
        questionCount: countByFolder.get(t.id) ?? 0,
      })),
    })),
  });
});

router.get("/subjects/:subjectId/levels", async (req, res) => {
  const student = await requireStudent(req.user!.sub);
  if (!student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }
  const subjectId = req.params.subjectId;
  const allowed = await prisma.classSubject.findFirst({
    where: { classId: student.classId, subjectId },
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
    where: { studentId: student.id, subjectId },
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

const startSchema = z
  .object({
    subjectId: z.string(),
    levelId: z.string().optional(),
    topicIds: z.array(z.string()).optional(),
    chapterTopicIds: z.array(z.string()).optional(),
  })
  .refine((d) => Boolean(d.levelId) || Boolean(d.topicIds?.length) || Boolean(d.chapterTopicIds?.length), {
    message: "levelId or topicIds required",
  });

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

router.post("/tests/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { subjectId, levelId, topicIds, chapterTopicIds } = parsed.data;

  const student = await requireStudent(req.user!.sub);
  if (!student) {
    res.status(400).json({ error: "Not a student" });
    return;
  }

  const allowed = await prisma.classSubject.findFirst({
    where: { classId: student.classId, subjectId },
    include: { subject: { select: { id: true, testMode: true, chapterTestQuestionCount: true, chapterNegativeMarking: true, chapterWrongPenalty: true } } },
  });
  if (!allowed) {
    res.status(403).json({ error: "Subject not allowed" });
    return;
  }

  if (allowed.subject.testMode === "CHAPTER") {
    const requestedIds = [...new Set((topicIds ?? []).filter(Boolean))];
    const requestedFolders = [...new Set((chapterTopicIds ?? []).filter(Boolean))];
    if (requestedIds.length === 0 && requestedFolders.length === 0) {
      res.status(400).json({ error: "Select at least one chapter" });
      return;
    }
    const chapters = requestedIds.length
      ? await prisma.subjectChapter.findMany({
          where: { subjectId, topicId: { in: requestedIds } },
          select: { topicId: true },
        })
      : [];
    if (chapters.length !== requestedIds.length) {
      res.status(400).json({ error: "One or more chapters are not on this branch" });
      return;
    }
    const folders = requestedFolders.length
      ? await prisma.chapterTopic.findMany({
          where: { id: { in: requestedFolders }, subjectChapter: { subjectId } },
          select: { id: true, subjectChapter: { select: { topicId: true } } },
        })
      : [];
    if (folders.length !== requestedFolders.length) {
      res.status(400).json({ error: "One or more topics are not on this book" });
      return;
    }
    const wholeChapters = new Set(requestedIds);
    const folderIds = folders.filter((f) => !wholeChapters.has(f.subjectChapter.topicId)).map((f) => f.id);

    const existing = await prisma.test.findFirst({
      where: {
        studentId: student.id,
        subjectId,
        levelId: null,
        status: "IN_PROGRESS",
      },
      include: {
        testQuestions: { select: { id: true } },
      },
      orderBy: { startedAt: "desc" },
    });
    if (
      existing &&
      existing.testQuestions.length > 0 &&
      sameIdSet(existing.selectedTopicIds, requestedIds) &&
      sameIdSet(existing.selectedChapterTopicIds, folderIds)
    ) {
      res.json({ testId: existing.id, questionCount: existing.testQuestions.length, warnings: [], resumed: true });
      return;
    }
    if (existing) {
      await prisma.test.update({
        where: { id: existing.id },
        data: { status: "ABANDONED" },
      });
    }

    const total = allowed.subject.chapterTestQuestionCount || 10;
    const { questionIds, warnings } = await pickQuestionsForChapterTest(
      prisma,
      subjectId,
      requestedIds,
      total,
      folderIds
    );
    if (questionIds.length === 0) {
      res.status(400).json({ error: "No questions available for the selected chapters", warnings });
      return;
    }

    const wrongPenalty = allowed.subject.chapterNegativeMarking
      ? Math.max(0, allowed.subject.chapterWrongPenalty)
      : 0;

    const test = await prisma.test.create({
      data: {
        studentId: student.id,
        subjectId,
        levelId: null,
        selectedTopicIds: requestedIds,
        selectedChapterTopicIds: folderIds,
        wrongPenalty,
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
    return;
  }

  if (!levelId) {
    res.status(400).json({ error: "levelId required" });
    return;
  }

  const level = await prisma.level.findFirst({ where: { id: levelId, subjectId } });
  if (!level) {
    res.status(404).json({ error: "Level not found" });
    return;
  }

  const existing = await prisma.test.findFirst({
    where: {
      studentId: student.id,
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
      studentId: student.id,
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

function resultSlice(q: {
  topicId: string;
  topic?: { name: string } | null;
  chapterTopicId?: string | null;
  chapterTopic?: { name: string } | null;
}) {
  if (q.chapterTopicId && q.chapterTopic) return { id: q.chapterTopicId, name: q.chapterTopic.name };
  return { id: q.topicId, name: q.topic?.name ?? "Chapter" };
}

function stripQuestion(q: {
  id: string;
  type?: string;
  stem: string;
  stemImageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  topicId: string;
}) {
  return toPublicQuestion(q);
}

router.get("/tests/:testId", async (req, res) => {
  try {
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
          include: { question: { include: { topic: true, chapterTopic: true } } },
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
        include: { question: { include: { topic: true, chapterTopic: true } } },
      });

      const topicMap = new Map<string, { correct: number; total: number; name: string }>();
      for (const a of answers) {
        const slice = resultSlice(a.question);
        const cur = topicMap.get(slice.id) ?? { correct: 0, total: 0, name: slice.name };
        cur.total += 1;
        if (a.isCorrect) cur.correct += 1;
        topicMap.set(slice.id, cur);
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
      const wrongCount = answers.filter(
        (a) => !a.isCorrect && isAttemptedAnswer(a.question.type, a.selectedOption, a.numericAnswer)
      ).length;
      const unansweredCount = answers.filter(
        (a) => !isAttemptedAnswer(a.question.type, a.selectedOption, a.numericAnswer)
      ).length;
      const penaltyTotal = Math.round(wrongCount * test.wrongPenalty * 100) / 100;

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
        subjectId: test.subjectId,
        levelId: test.levelId,
        kind: test.levelId ? "level" : "chapter",
        wrongPenalty: test.wrongPenalty,
        negativeMarking: test.wrongPenalty > 0,
        wrongCount,
        unansweredCount,
        penaltyTotal,
        subject: test.subject.name,
        level: test.level?.name ?? null,
      });
      return;
    }

    res.json({
      status: "in_progress",
      subjectId: test.subjectId,
      levelId: test.levelId,
      kind: test.levelId ? "level" : "chapter",
      wrongPenalty: test.wrongPenalty,
      negativeMarking: test.wrongPenalty > 0,
      subject: test.subject.name,
      level: test.level?.name ?? null,
      questions: test.testQuestions.map((tq) => stripQuestion(tq.question)),
    });
  } catch (error) {
    sendRouteError(res, error, "Failed to load test");
  }
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
      ...toPublicQuestion(q),
      selectedOption: sa?.selectedOption ?? null,
      numericAnswer: sa?.numericAnswer ?? null,
      correctOption: q.correctOption,
      correctNumeric: q.type === "NUMERIC" ? q.correctNumeric : null,
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
  answers: z.array(submittedAnswerSchema),
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
        testQuestions: { include: { question: { include: { topic: true, chapterTopic: true } } } },
        subject: true,
        level: true,
      },
    });

    if (!test) {
      res.status(404).json({ error: "Test not found or already submitted" });
      return;
    }

    const isChapterTest = !test.levelId;
    const answerByQ = new Map(parsed.data.answers.map((a) => [a.questionId, a]));
    const expectedIds = new Set(test.testQuestions.map((tq) => tq.questionId));
    if (!isChapterTest) {
      if (answerByQ.size !== expectedIds.size || [...expectedIds].some((id) => !answerByQ.has(id))) {
        res.status(400).json({ error: "Answer every question" });
        return;
      }
    }

    const scored = test.testQuestions.map((tq) => {
      const result = scoreSubmittedAnswer(tq.question, answerByQ.get(tq.questionId));
      return { tq, result };
    });
    if (!isChapterTest && scored.some((s) => !s.result.complete)) {
      res.status(400).json({ error: "Answer every question" });
      return;
    }

    const tally = tallyTestScore(
      scored.map((s) => s.result),
      test.levelId ? 0 : test.wrongPenalty
    );
    const { score, maxScore, percentage } = tally;
    const band = bandFromPercentage(percentage);

    const topicScores = new Map<string, { correct: number; total: number }>();
    const displayScores = new Map<string, { correct: number; total: number; name: string }>();
    for (const { tq, result } of scored) {
      const cur = topicScores.get(tq.question.topicId) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (result.isCorrect) cur.correct += 1;
      topicScores.set(tq.question.topicId, cur);
      const slice = resultSlice(tq.question);
      const shown = displayScores.get(slice.id) ?? { correct: 0, total: 0, name: slice.name };
      shown.total += 1;
      if (result.isCorrect) shown.correct += 1;
      displayScores.set(slice.id, shown);
    }

    let suggestedNextLevelId: string | null = null;
    if (test.levelId) {
      const levels = await prisma.level.findMany({
        where: { subjectId: test.subjectId },
        orderBy: { order: "asc" },
      });
      const currentIdx = levels.findIndex((l) => l.id === test.levelId);
      if (percentage > 80 && currentIdx >= 0 && currentIdx < levels.length - 1) {
        suggestedNextLevelId = levels[currentIdx + 1].id;
      }
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
          create: scored.map(({ tq, result }) => ({
            questionId: tq.questionId,
            selectedOption: result.selectedOption,
            numericAnswer: result.numericAnswer,
            isCorrect: result.isCorrect,
          })),
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
    invalidateStudentMastery(studentRecordId);

    const practice = await recordDailyPractice(prisma, studentRecordId);

    const topicWise = [...displayScores.entries()].map(([topicId, v]) => ({
      topicId,
      topicName: v.name,
      correct: v.correct,
      total: v.total,
      percentage: v.total ? Math.round((100 * v.correct) / v.total) : 0,
    }));

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
      subjectId: test.subjectId,
      levelId: test.levelId,
      kind: test.levelId ? "level" : "chapter",
      wrongPenalty: tally.penaltyPerWrong,
      negativeMarking: tally.penaltyPerWrong > 0,
      wrongCount: tally.wrong,
      unansweredCount: tally.unanswered,
      penaltyTotal: tally.penaltyTotal,
      practiceStreak: practice.practiceStreak,
      practicedToday: true,
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
