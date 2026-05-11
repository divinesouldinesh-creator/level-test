import type { Difficulty, PrismaClient } from "@prisma/client";

/**
 * Build the question set for a syllabus test.
 *
 * Algorithm:
 *   1. Equal-split the requested totalCount across selected chapters
 *      (leftover redistributed one-by-one).
 *   2. Within each chapter, allocate the chapter's slots across its topic
 *      participations in proportion to their weightPct (auto-normalized).
 *      Chapters with no weightages defined fall back to equal-share by topic
 *      among the topics that actually have questions at the requested
 *      difficulty.
 *   3. Pick that many questions at the requested difficulty per (chapter,
 *      topic). If short, backfill from the same chapter at the requested
 *      difficulty (any topic), then from the same chapter at adjacent
 *      difficulty levels.
 *   4. Shuffle the final list; assign orderIndex 0..N-1.
 */

export type SyllabusBuildInput = {
  chapterIds: string[];
  difficulty: Difficulty;
  totalCount: number;
};

export type SyllabusBuildResult = {
  questionIds: string[];
  warnings: string[];
};

const ADJACENT: Record<Difficulty, Difficulty[]> = {
  EASY: ["MEDIUM", "HARD"],
  MEDIUM: ["EASY", "HARD"],
  HARD: ["MEDIUM", "EASY"],
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(pool: T[], n: number): T[] {
  if (n <= 0 || pool.length === 0) return [];
  return shuffle(pool).slice(0, n);
}

/** Distribute leftover units one-per-chapter, deterministically by index. */
function equalSplitWithLeftover(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  let leftover = total - base * parts;
  const out = new Array<number>(parts).fill(base);
  for (let i = 0; i < parts && leftover > 0; i++) {
    out[i] += 1;
    leftover -= 1;
  }
  return out;
}

/** Hare-Niemeyer (largest remainder) allocation of `total` slots given weights. */
function allocateByWeights(total: number, weights: number[]): number[] {
  if (total <= 0) return weights.map(() => 0);
  const sumW = weights.reduce((acc, w) => acc + Math.max(0, w), 0);
  if (sumW <= 0) {
    return equalSplitWithLeftover(total, weights.length);
  }
  const raw = weights.map((w) => (Math.max(0, w) * total) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let assigned = floors.reduce((a, b) => a + b, 0);
  const remainders = raw.map((x, i) => ({ i, frac: x - Math.floor(x) }));
  remainders.sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (assigned < total && k < remainders.length) {
    floors[remainders[k].i] += 1;
    assigned += 1;
    k += 1;
  }
  return floors;
}

export async function buildSyllabusTestQuestions(
  prisma: PrismaClient,
  input: SyllabusBuildInput
): Promise<SyllabusBuildResult> {
  const warnings: string[] = [];
  const totalCount = Math.max(1, Math.floor(input.totalCount));
  const chapterIds = [...new Set(input.chapterIds)];
  if (chapterIds.length === 0) return { questionIds: [], warnings: ["No chapters selected"] };

  const chapters = await prisma.chapter.findMany({
    where: { id: { in: chapterIds } },
    include: {
      topicParticipations: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (chapters.length === 0)
    return { questionIds: [], warnings: ["Selected chapters not found"] };

  const perChapter = equalSplitWithLeftover(totalCount, chapters.length);
  const usedQuestionIds = new Set<string>();
  const collected: string[] = [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const chapterTarget = perChapter[ci];
    if (chapterTarget <= 0) continue;

    const allChapterQuestions = await prisma.syllabusQuestion.findMany({
      where: { chapterId: chapter.id },
      select: { id: true, topicId: true, difficulty: true },
    });
    const remainingTopicIds = chapter.topicParticipations.map((p) => p.topicId);
    let topicIdsForAlloc = remainingTopicIds;
    let weights = chapter.topicParticipations.map((p) => p.weightPct);
    if (topicIdsForAlloc.length === 0) {
      const distinctTopicIds = [...new Set(allChapterQuestions.map((q) => q.topicId))];
      topicIdsForAlloc = distinctTopicIds;
      weights = distinctTopicIds.map(() => 1);
    }

    const allocations = topicIdsForAlloc.length
      ? allocateByWeights(chapterTarget, weights)
      : [];

    const collectedThisChapter: string[] = [];

    for (let ti = 0; ti < topicIdsForAlloc.length; ti++) {
      const topicId = topicIdsForAlloc[ti];
      const want = allocations[ti];
      if (want <= 0) continue;
      const candidates = allChapterQuestions
        .filter(
          (q) =>
            q.topicId === topicId &&
            q.difficulty === input.difficulty &&
            !usedQuestionIds.has(q.id)
        )
        .map((q) => q.id);
      const picked = pickN(candidates, want);
      for (const id of picked) {
        usedQuestionIds.add(id);
        collectedThisChapter.push(id);
      }
    }

    let shortfall = chapterTarget - collectedThisChapter.length;
    if (shortfall > 0) {
      const filler = allChapterQuestions
        .filter(
          (q) => q.difficulty === input.difficulty && !usedQuestionIds.has(q.id)
        )
        .map((q) => q.id);
      const picked = pickN(filler, shortfall);
      for (const id of picked) {
        usedQuestionIds.add(id);
        collectedThisChapter.push(id);
      }
      shortfall = chapterTarget - collectedThisChapter.length;
    }

    if (shortfall > 0) {
      for (const altDiff of ADJACENT[input.difficulty]) {
        if (shortfall <= 0) break;
        const filler = allChapterQuestions
          .filter((q) => q.difficulty === altDiff && !usedQuestionIds.has(q.id))
          .map((q) => q.id);
        const picked = pickN(filler, shortfall);
        for (const id of picked) {
          usedQuestionIds.add(id);
          collectedThisChapter.push(id);
        }
        shortfall = chapterTarget - collectedThisChapter.length;
      }
    }

    if (shortfall > 0) {
      warnings.push(
        `Chapter "${chapter.name}" had only ${collectedThisChapter.length} questions available (asked for ${chapterTarget}).`
      );
    }

    collected.push(...collectedThisChapter);
  }

  return { questionIds: shuffle(collected), warnings };
}
