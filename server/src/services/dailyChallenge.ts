import type { PrismaClient } from "@prisma/client";
import { DailyChallengeStatus } from "@prisma/client";
import { istDayKey, previousIstDayKey } from "./engagementCalendar.js";
import { awardDailyChallengeXp } from "./studentEngagement.js";
import { masteryPriorityTopicIds } from "./topicMastery.js";

const DAILY_QUESTION_COUNT = 5;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type LevelRow = {
  id: string;
  name: string;
  order: number;
  subjectId: string;
};

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
    if (isLevelUnlocked(levels, i, progressByLevel)) {
      current = levels[i];
    } else {
      break;
    }
  }
  return current;
}

type TopicCand = {
  topicId: string;
  topicName: string;
  accuracy: number; // 0..1, 0.5 if unknown
  attempted: number;
  poolSize: number;
  masteryBoost: number; // higher = prefer in Daily 5
};

async function pickQuestionsForDaily(
  prisma: PrismaClient,
  levelId: string,
  topicCands: TopicCand[],
  count: number
): Promise<{ questionIds: string[]; focusTopicNames: string[] }> {
  const usable = topicCands.filter((t) => t.poolSize > 0);
  if (usable.length === 0) return { questionIds: [], focusTopicNames: [] };

  // Prefer mastery-queue topics, then weak, then least practiced.
  usable.sort((a, b) => {
    if (a.masteryBoost !== b.masteryBoost) return b.masteryBoost - a.masteryBoost;
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    return a.attempted - b.attempted;
  });

  const focus = usable.slice(0, Math.min(3, usable.length));
  const focusTopicNames = focus.map((t) => t.topicName);

  // Allocate: more to weaker topics.
  const weights = focus.map((_, i) => focus.length - i);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const needByTopic = new Map<string, number>();
  let assigned = 0;
  for (let i = 0; i < focus.length; i++) {
    const n = Math.max(1, Math.round((count * weights[i]) / weightSum));
    needByTopic.set(focus[i].topicId, n);
    assigned += n;
  }
  // Fix rounding to exact count.
  while (assigned > count) {
    const richest = [...needByTopic.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!richest || richest[1] <= 1) break;
    needByTopic.set(richest[0], richest[1] - 1);
    assigned -= 1;
  }
  while (assigned < count) {
    const poorest = [...needByTopic.entries()].sort((a, b) => a[1] - b[1])[0];
    if (!poorest) break;
    needByTopic.set(poorest[0], poorest[1] + 1);
    assigned += 1;
  }

  const picked: string[] = [];
  for (const [topicId, need] of needByTopic) {
    const pool = await prisma.question.findMany({
      where: { levelId, topicId },
      select: { id: true },
    });
    const take = shuffle(pool.map((p) => p.id)).slice(0, need);
    picked.push(...take);
  }

  if (picked.length < count) {
    const extra = await prisma.question.findMany({
      where: {
        levelId,
        topicId: { in: usable.map((t) => t.topicId) },
        id: { notIn: picked },
      },
      select: { id: true },
    });
    picked.push(...shuffle(extra.map((e) => e.id)).slice(0, count - picked.length));
  }

  return { questionIds: shuffle(picked.slice(0, count)), focusTopicNames };
}

async function chooseSubjectAndLevel(
  prisma: PrismaClient,
  studentId: string,
  classId: string,
  today: string
): Promise<{
  subjectId: string;
  subjectName: string;
  levelId: string;
  levelName: string;
  topicCands: TopicCand[];
} | null> {
  const classSubjects = await prisma.classSubject.findMany({
    where: { classId },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });
  if (classSubjects.length === 0) return null;

  const yesterday = previousIstDayKey(today);
  const recent = await prisma.dailyChallenge.findMany({
    where: { studentId, dayKey: { in: [yesterday, today] } },
    select: { dayKey: true, subjectId: true },
  });
  const yesterdaySubjectId = recent.find((r) => r.dayKey === yesterday)?.subjectId ?? null;
  const priorityTopics = await masteryPriorityTopicIds(prisma, studentId);

  type Cand = {
    subjectId: string;
    subjectName: string;
    levelId: string;
    levelName: string;
    weakness: number; // lower = weaker = preferred
    topicCands: TopicCand[];
  };

  const cands: Cand[] = [];

  for (const cs of classSubjects) {
    const levels = await prisma.level.findMany({
      where: { subjectId: cs.subjectId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, subjectId: true },
    });
    if (levels.length === 0) continue;

    const progress = await prisma.studentProgress.findMany({
      where: { studentId, subjectId: cs.subjectId },
    });
    const progressByLevel = new Map(
      progress.map((p) => [p.levelId, { unlocked: p.unlocked, lastPercentage: p.lastPercentage }])
    );
    const level = currentLevelForSubject(levels, progressByLevel);
    if (!level) continue;

    const parts = await prisma.levelTopicParticipation.findMany({
      where: { levelId: level.id },
      include: { topic: true },
      orderBy: { sortOrder: "asc" },
    });
    if (parts.length === 0) continue;

    const topicIds = parts.map((p) => p.topicId);
    const perfs = await prisma.topicPerformance.findMany({
      where: { studentId, topicId: { in: topicIds } },
    });
    const perfByTopic = new Map(perfs.map((p) => [p.topicId, p]));

    const counts = await prisma.question.groupBy({
      by: ["topicId"],
      where: { levelId: level.id, topicId: { in: topicIds } },
      _count: { _all: true },
    });
    const countByTopic = new Map(counts.map((c) => [c.topicId, c._count._all]));

    const topicCands: TopicCand[] = parts.map((p) => {
      const perf = perfByTopic.get(p.topicId);
      const attempted = perf?.attemptedTotal ?? 0;
      const correct = perf?.correctTotal ?? 0;
      const accuracy = attempted > 0 ? correct / attempted : 0.5;
      return {
        topicId: p.topicId,
        topicName: p.topic.name,
        accuracy,
        attempted,
        poolSize: countByTopic.get(p.topicId) ?? 0,
        masteryBoost: priorityTopics.has(p.topicId) ? 1 : 0,
      };
    });

    if (topicCands.every((t) => t.poolSize === 0)) continue;

    const withPool = topicCands.filter((t) => t.poolSize > 0);
    const avgAcc =
      withPool.reduce((s, t) => s + t.accuracy, 0) / Math.max(1, withPool.length);
    const levelPct = progressByLevel.get(level.id)?.lastPercentage;
    const weakness = levelPct != null ? levelPct / 100 : avgAcc;
    const masteryBoostSum = withPool.reduce((s, t) => s + t.masteryBoost, 0);

    cands.push({
      subjectId: cs.subjectId,
      subjectName: cs.subject.name,
      levelId: level.id,
      levelName: level.name,
      // Lower is chosen first; mastery topics pull subject ahead.
      weakness: weakness - masteryBoostSum * 0.15,
      topicCands,
    });
  }

  if (cands.length === 0) return null;

  // Prefer not repeating yesterday's subject when alternatives exist.
  const rotated = cands.filter((c) => c.subjectId !== yesterdaySubjectId);
  const pool = rotated.length > 0 ? rotated : cands;
  pool.sort((a, b) => a.weakness - b.weakness);
  const chosen = pool[0];

  return {
    subjectId: chosen.subjectId,
    subjectName: chosen.subjectName,
    levelId: chosen.levelId,
    levelName: chosen.levelName,
    topicCands: chosen.topicCands,
  };
}

export async function getOrCreateTodayChallenge(
  prisma: PrismaClient,
  studentId: string,
  classId: string
) {
  const today = istDayKey();
  const existing = await prisma.dailyChallenge.findUnique({
    where: { studentId_dayKey: { studentId, dayKey: today } },
    include: {
      subject: true,
      level: true,
      questions: { select: { id: true } },
    },
  });
  if (existing) {
    return {
      id: existing.id,
      dayKey: existing.dayKey,
      status: existing.status,
      subjectId: existing.subjectId,
      subjectName: existing.subject.name,
      levelId: existing.levelId,
      levelName: existing.level.name,
      focusTopicNames: existing.focusTopicNames,
      questionCount: existing.questions.length,
      score: existing.score,
      maxScore: existing.maxScore,
      percentage: existing.percentage,
      xpAwarded: existing.xpAwarded,
      completedAt: existing.completedAt,
    };
  }

  const pick = await chooseSubjectAndLevel(prisma, studentId, classId, today);
  if (!pick) {
    return null;
  }

  const { questionIds, focusTopicNames } = await pickQuestionsForDaily(
    prisma,
    pick.levelId,
    pick.topicCands,
    DAILY_QUESTION_COUNT
  );
  if (questionIds.length === 0) {
    return null;
  }

  try {
    const created = await prisma.dailyChallenge.create({
      data: {
        studentId,
        dayKey: today,
        subjectId: pick.subjectId,
        levelId: pick.levelId,
        focusTopicNames,
        questions: {
          create: questionIds.map((qid, i) => ({
            questionId: qid,
            orderIndex: i,
          })),
        },
      },
      include: {
        subject: true,
        level: true,
        questions: { select: { id: true } },
      },
    });

    return {
      id: created.id,
      dayKey: created.dayKey,
      status: created.status,
      subjectId: created.subjectId,
      subjectName: created.subject.name,
      levelId: created.levelId,
      levelName: created.level.name,
      focusTopicNames: created.focusTopicNames,
      questionCount: created.questions.length,
      score: created.score,
      maxScore: created.maxScore,
      percentage: created.percentage,
      xpAwarded: created.xpAwarded,
      completedAt: created.completedAt,
    };
  } catch (e) {
    // Concurrent home loads can race on unique (studentId, dayKey).
    const again = await prisma.dailyChallenge.findUnique({
      where: { studentId_dayKey: { studentId, dayKey: today } },
      include: {
        subject: true,
        level: true,
        questions: { select: { id: true } },
      },
    });
    if (again) {
      return {
        id: again.id,
        dayKey: again.dayKey,
        status: again.status,
        subjectId: again.subjectId,
        subjectName: again.subject.name,
        levelId: again.levelId,
        levelName: again.level.name,
        focusTopicNames: again.focusTopicNames,
        questionCount: again.questions.length,
        score: again.score,
        maxScore: again.maxScore,
        percentage: again.percentage,
        xpAwarded: again.xpAwarded,
        completedAt: again.completedAt,
      };
    }
    throw e;
  }
}

export async function getChallengeForStudent(
  prisma: PrismaClient,
  studentId: string,
  challengeId: string
) {
  const challenge = await prisma.dailyChallenge.findFirst({
    where: { id: challengeId, studentId },
    include: {
      subject: true,
      level: true,
      questions: {
        orderBy: { orderIndex: "asc" },
        include: {
          question: { include: { topic: true } },
        },
      },
    },
  });
  return challenge;
}

export async function submitDailyChallenge(
  prisma: PrismaClient,
  studentId: string,
  challengeId: string,
  answers: { questionId: string; selectedOption: number }[]
) {
  const challenge = await prisma.dailyChallenge.findFirst({
    where: { id: challengeId, studentId },
    include: {
      questions: { include: { question: true } },
    },
  });
  if (!challenge) return { error: "not_found" as const };
  if (challenge.status === DailyChallengeStatus.COMPLETED) {
    return {
      error: "already_completed" as const,
      score: challenge.score,
      maxScore: challenge.maxScore,
      percentage: challenge.percentage,
      xpAwarded: challenge.xpAwarded,
    };
  }

  const answerByQ = new Map(answers.map((a) => [a.questionId, a.selectedOption]));
  const expected = new Set(challenge.questions.map((q) => q.questionId));
  if (answers.length !== expected.size || answers.some((a) => !expected.has(a.questionId))) {
    return { error: "incomplete" as const };
  }
  for (const a of answers) {
    if (!Number.isInteger(a.selectedOption) || a.selectedOption < 0 || a.selectedOption > 3) {
      return { error: "invalid_option" as const };
    }
  }

  let score = 0;
  const maxScore = challenge.questions.length;
  const topicScores = new Map<string, { correct: number; total: number }>();

  for (const cq of challenge.questions) {
    const selected = answerByQ.get(cq.questionId)!;
    const isCorrect = selected === cq.question.correctOption;
    if (isCorrect) score += 1;
    const tid = cq.question.topicId;
    const cur = topicScores.get(tid) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (isCorrect) cur.correct += 1;
    topicScores.set(tid, cur);
  }

  const percentage = maxScore > 0 ? Math.round((score * 1000) / maxScore) / 10 : 0;

  await prisma.$transaction(async (tx) => {
    for (const cq of challenge.questions) {
      const selected = answerByQ.get(cq.questionId)!;
      const isCorrect = selected === cq.question.correctOption;
      await tx.dailyChallengeQuestion.update({
        where: { id: cq.id },
        data: { selectedOption: selected, isCorrect },
      });
    }

    for (const [topicId, v] of topicScores) {
      await tx.topicPerformance.upsert({
        where: { studentId_topicId: { studentId, topicId } },
        create: {
          studentId,
          topicId,
          correctTotal: v.correct,
          attemptedTotal: v.total,
        },
        update: {
          correctTotal: { increment: v.correct },
          attemptedTotal: { increment: v.total },
        },
      });
    }
  });

  const xp = await awardDailyChallengeXp(prisma, studentId, challengeId, score, maxScore);

  const updated = await prisma.dailyChallenge.update({
    where: { id: challengeId },
    data: {
      status: DailyChallengeStatus.COMPLETED,
      score,
      maxScore,
      percentage,
      xpAwarded: xp.xpAwarded,
      completedAt: new Date(),
    },
    include: { subject: true, level: true },
  });

  const topicWise = await Promise.all(
    [...topicScores.entries()].map(async ([topicId, v]) => {
      const topic = await prisma.topic.findUnique({ where: { id: topicId } });
      return {
        topicId,
        topicName: topic?.name ?? topicId,
        correct: v.correct,
        total: v.total,
        percentage: v.total > 0 ? Math.round((v.correct * 1000) / v.total) / 10 : 0,
      };
    })
  );

  return {
    ok: true as const,
    challengeId: updated.id,
    subjectName: updated.subject.name,
    levelName: updated.level.name,
    score,
    maxScore,
    percentage,
    topicWise,
    xpAwarded: xp.xpAwarded,
    xpTotal: xp.xpTotal,
    practiceStreak: xp.practiceStreak,
    checkInStreak: xp.checkInStreak,
  };
}
