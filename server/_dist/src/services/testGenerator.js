import { allocateQuestionCounts } from "./allocateQuotas.js";
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
export { allocateQuestionCounts };
export async function pickQuestionsForTest(prisma, levelId) {
    const warnings = [];
    const config = await prisma.levelTestConfig.findUnique({ where: { levelId } });
    if (!config) {
        throw new Error("Level test config not found");
    }
    const total = config.questionCount;
    const parts = await prisma.levelTopicParticipation.findMany({
        where: { levelId },
        orderBy: { sortOrder: "asc" },
        include: { topic: true },
    });
    if (parts.length === 0) {
        throw new Error("No topics configured for this level");
    }
    const topicIds = parts.map((p) => p.topicId);
    const quotas = new Map();
    for (const p of parts)
        quotas.set(p.topicId, p.quota);
    const counts = allocateQuestionCounts(total, topicIds, quotas);
    let sum = 0;
    for (const n of counts.values())
        sum += n;
    if (sum !== total) {
        const first = topicIds[0];
        counts.set(first, (counts.get(first) ?? 0) + (total - sum));
    }
    const picked = [];
    for (const [topicId, need] of counts) {
        if (need <= 0)
            continue;
        const pool = await prisma.question.findMany({
            where: { levelId, topicId },
            select: { id: true },
        });
        const shuffled = shuffle(pool.map((p) => p.id));
        const take = Math.min(need, shuffled.length);
        if (take < need) {
            warnings.push(`Topic "${parts.find((p) => p.topicId === topicId)?.topic.name ?? topicId}": need ${need}, only ${shuffled.length} in bank`);
        }
        picked.push(...shuffled.slice(0, take));
    }
    const missing = total - picked.length;
    if (missing > 0) {
        const extraPool = await prisma.question.findMany({
            where: {
                levelId,
                topicId: { in: topicIds },
                id: { notIn: picked },
            },
            select: { id: true },
        });
        const more = shuffle(extraPool.map((p) => p.id)).slice(0, missing);
        picked.push(...more);
        if (more.length < missing) {
            warnings.push(`Could only fill ${picked.length} of ${total} questions`);
        }
    }
    return { questionIds: shuffle(picked.slice(0, total)), warnings };
}
