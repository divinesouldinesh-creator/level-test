import {
  MasterySessionKind,
  MasterySessionStatus,
  PrismaClient,
  TopicMasteryStatus,
  XpReason,
} from "@prisma/client";
import {
  awardMasteryRelatedXp,
  XP_TOPIC_MASTERY,
  XP_TOPIC_PRACTICE,
} from "./studentEngagement.js";

const PRACTICE_COUNT = 5;
const RECHECK_COUNT = 3;
const PRACTICE_PASS_PCT = 70;
const RECHECK_PASS_PCT = 80;
/** Mark NEEDS_WORK when accuracy below this with enough attempts. */
const WEAK_ACCURACY = 0.5;
const MIN_ATTEMPTS_FOR_WEAK = 2;
const MIN_QUESTIONS_FOR_PATH = 3;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type LevelRow = { id: string; name: string; order: number; subjectId: string };

function isLevelUnlocked(
  levels: LevelRow[],
  idx: number,
  progressByLevel: Map<string, { unlocked: boolean; lastPercentage: number | null }>
): boolean {
  if (idx === 0) return true;
  const prev = levels[idx - 1];
  const prevP = progressByLevel.get(prev.id);
  const cur = progressByLevel.get(levels[idx].id);
  const prevOk = (prevP?.lastPercentage ?? 0) > 80;
  return prevOk || (cur?.unlocked ?? false);
}

function currentLevelForSubject(
  levels: LevelRow[],
  progressByLevel: Map<string, { unlocked: boolean; lastPercentage: number | null }>
): LevelRow | null {
  if (levels.length === 0) return null;
  let current = levels[0];
  for (let i = 0; i < levels.length; i++) {
    if (isLevelUnlocked(levels, i, progressByLevel)) current = levels[i];
    else break;
  }
  return current;
}

const STATUS_PRIORITY: Record<TopicMasteryStatus, number> = {
  REVIEW_DUE: 0,
  NEEDS_WORK: 1,
  LEARNING: 2,
  PRACTICING: 3,
  MASTERED: 9,
};

export type MasteryQueueItem = {
  masteryId: string;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  levelId: string;
  levelName: string;
  status: TopicMasteryStatus;
  accuracyPct: number | null;
  questionCount: number;
  hasLesson: boolean;
  nextStep: "learn" | "practice" | "recheck" | "done";
};

function nextStepFor(status: TopicMasteryStatus, learnDone: boolean): MasteryQueueItem["nextStep"] {
  if (status === TopicMasteryStatus.MASTERED) return "done";
  if (status === TopicMasteryStatus.REVIEW_DUE) return "recheck";
  if (!learnDone || status === TopicMasteryStatus.NEEDS_WORK || status === TopicMasteryStatus.LEARNING) {
    return learnDone ? "practice" : "learn";
  }
  return "practice";
}

/** Sync weak topics into TopicMastery and return active fix queue. */
export async function listMasteryQueue(
  prisma: PrismaClient,
  studentId: string,
  classId: string,
  opts?: { subjectIds?: string[] }
): Promise<MasteryQueueItem[]> {
  const classSubjects = await prisma.classSubject.findMany({
    where: {
      classId,
      ...(opts?.subjectIds?.length ? { subjectId: { in: opts.subjectIds } } : {}),
    },
    include: { subject: true },
  });
  if (classSubjects.length === 0) return [];

  const subjectIds = classSubjects.map((cs) => cs.subjectId);
  const [allLevels, allProgress] = await Promise.all([
    prisma.level.findMany({
      where: { subjectId: { in: subjectIds } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, subjectId: true },
    }),
    prisma.studentProgress.findMany({ where: { studentId } }),
  ]);

  const levelsBySubject = new Map<string, LevelRow[]>();
  for (const level of allLevels) {
    const list = levelsBySubject.get(level.subjectId) ?? [];
    list.push(level);
    levelsBySubject.set(level.subjectId, list);
  }

  const currentBySubject = new Map<string, LevelRow>();
  for (const cs of classSubjects) {
    const levels = levelsBySubject.get(cs.subjectId) ?? [];
    const progressByLevel = new Map(
      allProgress
        .filter((p) => p.subjectId === cs.subjectId)
        .map((p) => [p.levelId, { unlocked: p.unlocked, lastPercentage: p.lastPercentage }])
    );
    const level = currentLevelForSubject(levels, progressByLevel);
    if (level) currentBySubject.set(cs.subjectId, level);
  }

  const currentLevels = [...currentBySubject.values()];
  if (currentLevels.length === 0) return [];

  const levelIds = [...new Set(currentLevels.map((l) => l.id))];
  const parts = await prisma.levelTopicParticipation.findMany({
    where: { levelId: { in: levelIds } },
    include: {
      topic: { select: { id: true, name: true, lesson: { select: { id: true } } } },
    },
  });
  if (parts.length === 0) return [];

  const topicIds = [...new Set(parts.map((p) => p.topicId))];
  const [perfs, counts, existingMasteries] = await Promise.all([
    prisma.topicPerformance.findMany({
      where: { studentId, topicId: { in: topicIds } },
    }),
    prisma.question.groupBy({
      by: ["levelId", "topicId"],
      where: { levelId: { in: levelIds }, topicId: { in: topicIds } },
      _count: { _all: true },
    }),
    prisma.topicMastery.findMany({
      where: { studentId, levelId: { in: levelIds }, topicId: { in: topicIds } },
    }),
  ]);

  const perfByTopic = new Map(perfs.map((p) => [p.topicId, p]));
  const countByLevelTopic = new Map(counts.map((c) => [`${c.levelId}:${c.topicId}`, c._count._all]));
  let masteryByLevelTopic = new Map(existingMasteries.map((m) => [`${m.levelId}:${m.topicId}`, m]));

  const toCreate: {
    studentId: string;
    topicId: string;
    subjectId: string;
    levelId: string;
    status: TopicMasteryStatus;
  }[] = [];
  const toDemote: string[] = [];

  type WorkItem = {
    part: (typeof parts)[number];
    subjectId: string;
    subjectName: string;
    level: LevelRow;
    qCount: number;
    accuracy: number | null;
    key: string;
  };
  const work: WorkItem[] = [];

  for (const cs of classSubjects) {
    const level = currentBySubject.get(cs.subjectId);
    if (!level) continue;
    for (const part of parts) {
      if (part.levelId !== level.id) continue;
      const qCount = countByLevelTopic.get(`${level.id}:${part.topicId}`) ?? 0;
      if (qCount < MIN_QUESTIONS_FOR_PATH) continue;

      const perf = perfByTopic.get(part.topicId);
      const attempted = perf?.attemptedTotal ?? 0;
      const correct = perf?.correctTotal ?? 0;
      const accuracy = attempted > 0 ? correct / attempted : null;
      const isWeak =
        accuracy != null && attempted >= MIN_ATTEMPTS_FOR_WEAK && accuracy < WEAK_ACCURACY;
      const key = `${level.id}:${part.topicId}`;
      const mastery = masteryByLevelTopic.get(key) ?? null;

      if (!mastery && isWeak) {
        toCreate.push({
          studentId,
          topicId: part.topicId,
          subjectId: cs.subjectId,
          levelId: level.id,
          status: TopicMasteryStatus.NEEDS_WORK,
        });
      } else if (mastery && mastery.status === TopicMasteryStatus.MASTERED && isWeak) {
        toDemote.push(mastery.id);
      }

      work.push({
        part,
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        level,
        qCount,
        accuracy,
        key,
      });
    }
  }

  if (toCreate.length) {
    await prisma.topicMastery.createMany({ data: toCreate, skipDuplicates: true });
  }
  if (toDemote.length) {
    await prisma.topicMastery.updateMany({
      where: { id: { in: toDemote } },
      data: { status: TopicMasteryStatus.NEEDS_WORK, masteredAt: null },
    });
  }
  if (toCreate.length || toDemote.length) {
    const refreshed = await prisma.topicMastery.findMany({
      where: { studentId, levelId: { in: levelIds }, topicId: { in: topicIds } },
    });
    masteryByLevelTopic = new Map(refreshed.map((m) => [`${m.levelId}:${m.topicId}`, m]));
  }

  const items: MasteryQueueItem[] = [];
  for (const row of work) {
    const mastery = masteryByLevelTopic.get(row.key);
    if (!mastery) continue;
    if (mastery.status === TopicMasteryStatus.MASTERED) continue;
    items.push({
      masteryId: mastery.id,
      topicId: row.part.topicId,
      topicName: row.part.topic.name,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      levelId: row.level.id,
      levelName: row.level.name,
      status: mastery.status,
      accuracyPct: row.accuracy != null ? Math.round(row.accuracy * 1000) / 10 : null,
      questionCount: row.qCount,
      hasLesson: !!row.part.topic.lesson,
      nextStep: nextStepFor(mastery.status, !!mastery.learnCompletedAt),
    });
  }

  items.sort((a, b) => {
    const ps = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (ps !== 0) return ps;
    const aa = a.accuracyPct ?? 50;
    const bb = b.accuracyPct ?? 50;
    return aa - bb;
  });

  return items;
}

/** Topic IDs that Daily 5 should prefer for this student. */
export async function masteryPriorityTopicIds(
  prisma: PrismaClient,
  studentId: string
): Promise<Set<string>> {
  const rows = await prisma.topicMastery.findMany({
    where: {
      studentId,
      status: {
        in: [
          TopicMasteryStatus.NEEDS_WORK,
          TopicMasteryStatus.LEARNING,
          TopicMasteryStatus.PRACTICING,
          TopicMasteryStatus.REVIEW_DUE,
        ],
      },
    },
    select: { topicId: true },
  });
  return new Set(rows.map((r) => r.topicId));
}

export async function getMasteryDetail(prisma: PrismaClient, studentId: string, masteryId: string) {
  const mastery = await prisma.topicMastery.findFirst({
    where: { id: masteryId, studentId },
    include: {
      topic: { include: { lesson: true } },
      subject: true,
      level: true,
    },
  });
  if (!mastery) return null;

  const perf = await prisma.topicPerformance.findUnique({
    where: { studentId_topicId: { studentId, topicId: mastery.topicId } },
  });
  const accuracy =
    perf && perf.attemptedTotal > 0 ? perf.correctTotal / perf.attemptedTotal : null;

  const defaultBody =
    `Focus on "${mastery.topic.name}".\n\n` +
    `1. Recall the key idea or formula for this topic.\n` +
    `2. Try a simple example on paper.\n` +
    `3. Then practice 5 questions — don't rush.\n` +
    `4. After you pass practice, do a short recheck to lock it in.`;

  return {
    masteryId: mastery.id,
    status: mastery.status,
    topicId: mastery.topicId,
    topicName: mastery.topic.name,
    subjectId: mastery.subjectId,
    subjectName: mastery.subject.name,
    levelId: mastery.levelId,
    levelName: mastery.level.name,
    learnCompletedAt: mastery.learnCompletedAt,
    lastPracticePct: mastery.lastPracticePct,
    lastRecheckPct: mastery.lastRecheckPct,
    masteredAt: mastery.masteredAt,
    accuracyPct: accuracy != null ? Math.round(accuracy * 1000) / 10 : null,
    nextStep: nextStepFor(mastery.status, !!mastery.learnCompletedAt),
    lesson: {
      title: mastery.topic.lesson?.title ?? `Learn: ${mastery.topic.name}`,
      body: mastery.topic.lesson?.body ?? defaultBody,
      isDefault: !mastery.topic.lesson,
    },
  };
}

export async function markLearnComplete(prisma: PrismaClient, studentId: string, masteryId: string) {
  const mastery = await prisma.topicMastery.findFirst({
    where: { id: masteryId, studentId },
  });
  if (!mastery) return { error: "not_found" as const };
  if (mastery.status === TopicMasteryStatus.MASTERED) {
    return { error: "already_mastered" as const };
  }

  const updated = await prisma.topicMastery.update({
    where: { id: masteryId },
    data: {
      learnCompletedAt: mastery.learnCompletedAt ?? new Date(),
      status:
        mastery.status === TopicMasteryStatus.REVIEW_DUE
          ? TopicMasteryStatus.REVIEW_DUE
          : TopicMasteryStatus.PRACTICING,
    },
  });
  return { ok: true as const, status: updated.status, nextStep: "practice" as const };
}

async function pickTopicQuestions(
  prisma: PrismaClient,
  studentId: string,
  levelId: string,
  topicId: string,
  count: number
): Promise<string[]> {
  const pool = await prisma.question.findMany({
    where: { levelId, topicId },
    select: { id: true },
  });
  if (pool.length === 0) return [];

  const seen = await prisma.studentAnswer.findMany({
    where: {
      questionId: { in: pool.map((p) => p.id) },
      testAttempt: { test: { studentId } },
    },
    select: { questionId: true },
    distinct: ["questionId"],
  });
  const seenSet = new Set(seen.map((s) => s.questionId));
  const unseen = shuffle(pool.filter((p) => !seenSet.has(p.id)).map((p) => p.id));
  const seenIds = shuffle(pool.filter((p) => seenSet.has(p.id)).map((p) => p.id));
  return [...unseen, ...seenIds].slice(0, count);
}

export async function startMasterySession(
  prisma: PrismaClient,
  studentId: string,
  masteryId: string,
  kind: MasterySessionKind
) {
  const mastery = await prisma.topicMastery.findFirst({
    where: { id: masteryId, studentId },
  });
  if (!mastery) return { error: "not_found" as const };
  if (mastery.status === TopicMasteryStatus.MASTERED) {
    return { error: "already_mastered" as const };
  }

  if (kind === MasterySessionKind.RECHECK && mastery.status !== TopicMasteryStatus.REVIEW_DUE) {
    return { error: "recheck_not_ready" as const };
  }
  if (kind === MasterySessionKind.PRACTICE && mastery.status === TopicMasteryStatus.REVIEW_DUE) {
    // Allow practice again if they want, but prefer recheck — still OK
  }
  if (kind === MasterySessionKind.PRACTICE && !mastery.learnCompletedAt) {
    return { error: "learn_first" as const };
  }

  const count = kind === MasterySessionKind.PRACTICE ? PRACTICE_COUNT : RECHECK_COUNT;
  const questionIds = await pickTopicQuestions(
    prisma,
    studentId,
    mastery.levelId,
    mastery.topicId,
    count
  );
  if (questionIds.length === 0) {
    return { error: "no_questions" as const };
  }

  // Abandon any open session for this mastery.
  await prisma.masterySession.updateMany({
    where: {
      topicMasteryId: masteryId,
      studentId,
      status: MasterySessionStatus.IN_PROGRESS,
    },
    data: { status: MasterySessionStatus.COMPLETED, completedAt: new Date() },
  });

  if (kind === MasterySessionKind.PRACTICE && mastery.status !== TopicMasteryStatus.REVIEW_DUE) {
    await prisma.topicMastery.update({
      where: { id: masteryId },
      data: { status: TopicMasteryStatus.PRACTICING },
    });
  }

  const session = await prisma.masterySession.create({
    data: {
      studentId,
      topicMasteryId: masteryId,
      kind,
      questions: {
        create: questionIds.map((qid, i) => ({
          questionId: qid,
          orderIndex: i,
        })),
      },
    },
  });

  return { ok: true as const, sessionId: session.id, kind, questionCount: questionIds.length };
}

export async function getMasterySession(
  prisma: PrismaClient,
  studentId: string,
  sessionId: string
) {
  const session = await prisma.masterySession.findFirst({
    where: { id: sessionId, studentId },
    include: {
      topicMastery: {
        include: { topic: true, subject: true, level: true },
      },
      questions: {
        orderBy: { orderIndex: "asc" },
        include: { question: true },
      },
    },
  });
  return session;
}

export async function submitMasterySession(
  prisma: PrismaClient,
  studentId: string,
  sessionId: string,
  answers: { questionId: string; selectedOption: number }[]
) {
  const session = await prisma.masterySession.findFirst({
    where: { id: sessionId, studentId },
    include: {
      questions: { include: { question: true } },
      topicMastery: true,
    },
  });
  if (!session) return { error: "not_found" as const };
  if (session.status === MasterySessionStatus.COMPLETED) {
    return {
      error: "already_completed" as const,
      score: session.score,
      maxScore: session.maxScore,
      percentage: session.percentage,
      xpAwarded: session.xpAwarded,
    };
  }

  const answerByQ = new Map(answers.map((a) => [a.questionId, a.selectedOption]));
  const expected = new Set(session.questions.map((q) => q.questionId));
  if (answers.length !== expected.size || answers.some((a) => !expected.has(a.questionId))) {
    return { error: "incomplete" as const };
  }

  let score = 0;
  const maxScore = session.questions.length;
  for (const sq of session.questions) {
    const selected = answerByQ.get(sq.questionId)!;
    if (selected === sq.question.correctOption) score += 1;
  }
  const percentage = maxScore > 0 ? Math.round((score * 1000) / maxScore) / 10 : 0;

  await prisma.$transaction(async (tx) => {
    for (const sq of session.questions) {
      const selected = answerByQ.get(sq.questionId)!;
      const isCorrect = selected === sq.question.correctOption;
      await tx.masterySessionQuestion.update({
        where: { id: sq.id },
        data: { selectedOption: selected, isCorrect },
      });
    }

    const topicId = session.topicMastery.topicId;
    await tx.topicPerformance.upsert({
      where: { studentId_topicId: { studentId, topicId } },
      create: {
        studentId,
        topicId,
        correctTotal: score,
        attemptedTotal: maxScore,
      },
      update: {
        correctTotal: { increment: score },
        attemptedTotal: { increment: maxScore },
      },
    });
  });

  let newStatus = session.topicMastery.status;
  let xpAwarded = 0;
  let xpTotal: number | undefined;
  let practiceStreak: number | undefined;
  let mastered = false;
  let practicePassed = false;

  if (session.kind === MasterySessionKind.PRACTICE) {
    if (percentage >= PRACTICE_PASS_PCT) {
      newStatus = TopicMasteryStatus.REVIEW_DUE;
      practicePassed = true;
      const xp = await awardMasteryRelatedXp(
        prisma,
        studentId,
        XP_TOPIC_PRACTICE,
        XpReason.TOPIC_PRACTICE,
        sessionId
      );
      xpAwarded = xp.xpAwarded;
      xpTotal = xp.xpTotal;
      practiceStreak = xp.practiceStreak;
    } else {
      newStatus = TopicMasteryStatus.PRACTICING;
    }
    await prisma.topicMastery.update({
      where: { id: session.topicMasteryId },
      data: {
        status: newStatus,
        lastPracticePct: percentage,
        lastPracticeAt: new Date(),
      },
    });
  } else {
    if (percentage >= RECHECK_PASS_PCT) {
      newStatus = TopicMasteryStatus.MASTERED;
      mastered = true;
      const xp = await awardMasteryRelatedXp(
        prisma,
        studentId,
        XP_TOPIC_MASTERY,
        XpReason.TOPIC_MASTERY,
        sessionId
      );
      xpAwarded = xp.xpAwarded;
      xpTotal = xp.xpTotal;
      practiceStreak = xp.practiceStreak;
      await prisma.topicMastery.update({
        where: { id: session.topicMasteryId },
        data: {
          status: newStatus,
          lastRecheckPct: percentage,
          lastRecheckAt: new Date(),
          masteredAt: new Date(),
        },
      });
    } else {
      newStatus = TopicMasteryStatus.NEEDS_WORK;
      await prisma.topicMastery.update({
        where: { id: session.topicMasteryId },
        data: {
          status: newStatus,
          lastRecheckPct: percentage,
          lastRecheckAt: new Date(),
          learnCompletedAt: null,
        },
      });
    }
  }

  await prisma.masterySession.update({
    where: { id: sessionId },
    data: {
      status: MasterySessionStatus.COMPLETED,
      score,
      maxScore,
      percentage,
      xpAwarded,
      completedAt: new Date(),
    },
  });

  return {
    ok: true as const,
    kind: session.kind,
    score,
    maxScore,
    percentage,
    status: newStatus,
    practicePassed,
    mastered,
    xpAwarded,
    xpTotal,
    practiceStreak,
    passThreshold: session.kind === MasterySessionKind.PRACTICE ? PRACTICE_PASS_PCT : RECHECK_PASS_PCT,
  };
}
