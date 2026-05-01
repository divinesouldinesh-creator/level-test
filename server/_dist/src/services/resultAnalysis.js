export function bandFromPercentage(p) {
    if (p >= 80)
        return "STRONG";
    if (p >= 50)
        return "DEVELOPING";
    return "WEAK";
}
export async function applyAttemptResults(prisma, params) {
    const { studentId, subjectId, levelId, percentage, topicScores } = params;
    const levels = await prisma.level.findMany({
        where: { subjectId },
        orderBy: { order: "asc" },
    });
    const currentIdx = levels.findIndex((l) => l.id === levelId);
    let suggestedNextLevelId = null;
    if (percentage > 80 && currentIdx >= 0 && currentIdx < levels.length - 1) {
        suggestedNextLevelId = levels[currentIdx + 1].id;
    }
    await prisma.studentProgress.upsert({
        where: {
            studentId_subjectId_levelId: { studentId, subjectId, levelId },
        },
        create: {
            studentId,
            subjectId,
            levelId,
            unlocked: true,
            lastPercentage: percentage,
            lastAttemptAt: new Date(),
        },
        update: {
            lastPercentage: percentage,
            lastAttemptAt: new Date(),
        },
    });
    if (suggestedNextLevelId) {
        await prisma.studentProgress.upsert({
            where: {
                studentId_subjectId_levelId: {
                    studentId,
                    subjectId,
                    levelId: suggestedNextLevelId,
                },
            },
            create: {
                studentId,
                subjectId,
                levelId: suggestedNextLevelId,
                unlocked: true,
                lastPercentage: null,
                lastAttemptAt: null,
            },
            update: {},
        });
    }
    for (const [topicId, { correct, total }] of topicScores) {
        await prisma.topicPerformance.upsert({
            where: { studentId_topicId: { studentId, topicId } },
            create: {
                studentId,
                topicId,
                correctTotal: correct,
                attemptedTotal: total,
            },
            update: {
                correctTotal: { increment: correct },
                attemptedTotal: { increment: total },
            },
        });
    }
    return { suggestedNextLevelId };
}
