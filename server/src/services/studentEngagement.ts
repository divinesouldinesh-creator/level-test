import { PrismaClient, XpReason } from "@prisma/client";
import { daysBetweenIst, istDayKey, previousIstDayKey } from "./engagementCalendar.js";

export const XP_CHECK_IN = 5;
export const XP_CHALLENGE_COMPLETE = 15;
export const XP_CHALLENGE_HIGH = 10; // >= 80%
export const XP_CHALLENGE_PERFECT = 5; // 100%
export const XP_TOPIC_PRACTICE = 10;
export const XP_TOPIC_MASTERY = 25;

export async function ensureEngagement(prisma: PrismaClient, studentId: string) {
  return prisma.studentEngagement.upsert({
    where: { studentId },
    create: { studentId },
    update: {},
  });
}

function nextStreak(lastDay: string | null | undefined, today: string, current: number): number {
  if (!lastDay) return 1;
  if (lastDay === today) return current;
  if (lastDay === previousIstDayKey(today)) return current + 1;
  return 1;
}

export async function performCheckIn(prisma: PrismaClient, studentId: string) {
  const today = istDayKey();
  const engagement = await ensureEngagement(prisma, studentId);

  if (engagement.lastCheckInDay === today) {
    return {
      alreadyCheckedIn: true as const,
      xpAwarded: 0,
      xpTotal: engagement.xpTotal,
      checkInStreak: engagement.checkInStreak,
      bestCheckInStreak: engagement.bestCheckInStreak,
      dayKey: today,
    };
  }

  const checkInStreak = nextStreak(engagement.lastCheckInDay, today, engagement.checkInStreak);
  const bestCheckInStreak = Math.max(engagement.bestCheckInStreak, checkInStreak);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.xpEvent.create({
      data: {
        studentId,
        amount: XP_CHECK_IN,
        reason: XpReason.CHECK_IN,
        dayKey: today,
      },
    });
    return tx.studentEngagement.update({
      where: { studentId },
      data: {
        xpTotal: { increment: XP_CHECK_IN },
        checkInStreak,
        bestCheckInStreak,
        lastCheckInDay: today,
      },
    });
  });

  return {
    alreadyCheckedIn: false as const,
    xpAwarded: XP_CHECK_IN,
    xpTotal: updated.xpTotal,
    checkInStreak: updated.checkInStreak,
    bestCheckInStreak: updated.bestCheckInStreak,
    dayKey: today,
  };
}

export function challengeXpForScore(score: number, maxScore: number): {
  base: number;
  bonus: number;
  total: number;
} {
  const base = XP_CHALLENGE_COMPLETE;
  let bonus = 0;
  if (maxScore > 0) {
    const pct = (score * 100) / maxScore;
    if (pct >= 100) bonus += XP_CHALLENGE_PERFECT;
    if (pct >= 80) bonus += XP_CHALLENGE_HIGH;
  }
  return { base, bonus, total: base + bonus };
}

export async function awardDailyChallengeXp(
  prisma: PrismaClient,
  studentId: string,
  challengeId: string,
  score: number,
  maxScore: number
) {
  const today = istDayKey();
  const engagement = await ensureEngagement(prisma, studentId);
  const { base, bonus, total } = challengeXpForScore(score, maxScore);

  const practiceStreak = nextStreak(engagement.lastPracticeDay, today, engagement.practiceStreak);
  const bestPracticeStreak = Math.max(engagement.bestPracticeStreak, practiceStreak);

  // Also count challenge completion as a check-in if they haven't checked in yet.
  let checkInStreak = engagement.checkInStreak;
  let bestCheckInStreak = engagement.bestCheckInStreak;
  let lastCheckInDay = engagement.lastCheckInDay;
  let extraCheckInXp = 0;

  if (engagement.lastCheckInDay !== today) {
    checkInStreak = nextStreak(engagement.lastCheckInDay, today, engagement.checkInStreak);
    bestCheckInStreak = Math.max(engagement.bestCheckInStreak, checkInStreak);
    lastCheckInDay = today;
    extraCheckInXp = XP_CHECK_IN;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.xpEvent.create({
      data: {
        studentId,
        amount: base,
        reason: XpReason.DAILY_CHALLENGE,
        dayKey: today,
        refId: challengeId,
      },
    });
    if (bonus > 0) {
      await tx.xpEvent.create({
        data: {
          studentId,
          amount: bonus,
          reason: XpReason.DAILY_CHALLENGE_BONUS,
          dayKey: today,
          refId: challengeId,
        },
      });
    }
    if (extraCheckInXp > 0) {
      await tx.xpEvent.create({
        data: {
          studentId,
          amount: extraCheckInXp,
          reason: XpReason.CHECK_IN,
          dayKey: today,
          refId: challengeId,
        },
      });
    }
    return tx.studentEngagement.update({
      where: { studentId },
      data: {
        xpTotal: { increment: total + extraCheckInXp },
        practiceStreak,
        bestPracticeStreak,
        lastPracticeDay: today,
        checkInStreak,
        bestCheckInStreak,
        lastCheckInDay,
      },
    });
  });

  return {
    xpAwarded: total + extraCheckInXp,
    challengeXp: total,
    checkInXp: extraCheckInXp,
    xpTotal: updated.xpTotal,
    practiceStreak: updated.practiceStreak,
    bestPracticeStreak: updated.bestPracticeStreak,
    checkInStreak: updated.checkInStreak,
    dayKey: today,
    daysSinceLastPractice: engagement.lastPracticeDay
      ? daysBetweenIst(engagement.lastPracticeDay, today)
      : null,
  };
}

export async function getEngagementSummary(prisma: PrismaClient, studentId: string) {
  const today = istDayKey();
  const engagement = await ensureEngagement(prisma, studentId);
  return {
    dayKey: today,
    xpTotal: engagement.xpTotal,
    checkInStreak: engagement.checkInStreak,
    bestCheckInStreak: engagement.bestCheckInStreak,
    practiceStreak: engagement.practiceStreak,
    bestPracticeStreak: engagement.bestPracticeStreak,
    checkedInToday: engagement.lastCheckInDay === today,
    practicedToday: engagement.lastPracticeDay === today,
  };
}

/** Award XP for topic practice pass or mastery; also bumps practice streak. */
export async function awardMasteryRelatedXp(
  prisma: PrismaClient,
  studentId: string,
  amount: number,
  reason: typeof XpReason.TOPIC_PRACTICE | typeof XpReason.TOPIC_MASTERY,
  refId: string
) {
  const today = istDayKey();
  await ensureEngagement(prisma, studentId);
  const engagement = await prisma.studentEngagement.findUniqueOrThrow({ where: { studentId } });
  const practiceStreak = nextStreak(engagement.lastPracticeDay, today, engagement.practiceStreak);
  const bestPracticeStreak = Math.max(engagement.bestPracticeStreak, practiceStreak);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.xpEvent.create({
      data: { studentId, amount, reason, dayKey: today, refId },
    });
    return tx.studentEngagement.update({
      where: { studentId },
      data: {
        xpTotal: { increment: amount },
        practiceStreak,
        bestPracticeStreak,
        lastPracticeDay: today,
      },
    });
  });

  return {
    xpAwarded: amount,
    xpTotal: updated.xpTotal,
    practiceStreak: updated.practiceStreak,
  };
}
