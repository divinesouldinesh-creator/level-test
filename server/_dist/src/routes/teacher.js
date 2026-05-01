import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
const router = Router();
router.use(authMiddleware, requireRole("TEACHER"));
router.get("/classes", async (_req, res) => {
    const classes = await prisma.schoolClass.findMany({
        include: { sections: true, _count: { select: { students: true } } },
        orderBy: { name: "asc" },
    });
    res.json(classes.map((c) => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
        studentCount: c._count.students,
    })));
});
router.get("/sections/:sectionId/students", async (req, res) => {
    const students = await prisma.student.findMany({
        where: { sectionId: req.params.sectionId },
        include: { user: { select: { studentLoginId: true } } },
        orderBy: { fullName: "asc" },
    });
    res.json(students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        studentLoginId: s.user.studentLoginId,
    })));
});
router.get("/students/search", async (req, res) => {
    const classId = req.query.classId;
    const q = req.query.q?.trim();
    if (!classId) {
        res.status(400).json({ error: "classId required" });
        return;
    }
    if (!q || q.length < 2) {
        res.json([]);
        return;
    }
    const students = await prisma.student.findMany({
        where: {
            classId,
            OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { user: { studentLoginId: { contains: q, mode: "insensitive" } } },
            ],
        },
        include: {
            user: { select: { studentLoginId: true } },
            schoolClass: true,
        },
        orderBy: { fullName: "asc" },
        take: 10,
    });
    res.json(students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        studentLoginId: s.user.studentLoginId,
        className: s.schoolClass.name,
    })));
});
router.get("/analytics/weak-topics", async (req, res) => {
    const classId = req.query.classId;
    const whereStudent = classId ? { classId } : {};
    const rows = await prisma.topicPerformance.groupBy({
        by: ["topicId"],
        where: { student: whereStudent },
        _sum: { correctTotal: true, attemptedTotal: true },
        _count: { _all: true },
    });
    const topics = await prisma.topic.findMany({
        where: { id: { in: rows.map((r) => r.topicId) } },
        include: { subject: true },
    });
    const topicMap = new Map(topics.map((t) => [t.id, t]));
    const withPct = rows
        .map((r) => {
        const t = topicMap.get(r.topicId);
        const attempted = r._sum.attemptedTotal ?? 0;
        const correct = r._sum.correctTotal ?? 0;
        const pct = attempted ? (100 * correct) / attempted : 0;
        return {
            topicId: r.topicId,
            topicName: t?.name,
            subjectName: t?.subject.name,
            avgPercentage: Math.round(pct * 10) / 10,
            students: r._count._all,
        };
    })
        .sort((a, b) => a.avgPercentage - b.avgPercentage);
    res.json({ weakest: withPct.slice(0, 15) });
});
router.get("/analytics/student/:studentId/progress", async (req, res) => {
    const progress = await prisma.studentProgress.findMany({
        where: { studentId: req.params.studentId },
        include: { level: true, subject: true },
        orderBy: [{ subjectId: "asc" }, { level: { order: "asc" } }],
    });
    res.json(progress.map((p) => ({
        subject: p.subject.name,
        level: p.level.name,
        unlocked: p.unlocked,
        lastPercentage: p.lastPercentage,
        lastAttemptAt: p.lastAttemptAt,
    })));
});
router.get("/analytics/topic-ryg", async (req, res) => {
    const topicId = req.query.topicId;
    if (!topicId) {
        res.status(400).json({ error: "topicId required" });
        return;
    }
    const perStudent = await prisma.topicPerformance.findMany({
        where: { topicId },
        include: { student: true },
    });
    let red = 0, yellow = 0, green = 0;
    for (const row of perStudent) {
        const pct = row.attemptedTotal > 0 ? (100 * row.correctTotal) / row.attemptedTotal : 0;
        if (pct < 50)
            red++;
        else if (pct < 80)
            yellow++;
        else
            green++;
    }
    res.json({ topicId, red, yellow, green, totalStudents: perStudent.length });
});
router.get("/analytics/students", async (req, res) => {
    const classId = req.query.classId;
    const subjectId = req.query.subjectId;
    const levelId = req.query.levelId;
    const status = req.query.status; // RED | YELLOW | GREEN
    const students = await prisma.student.findMany({
        where: classId ? { classId } : undefined,
        include: {
            schoolClass: true,
            user: { select: { studentLoginId: true } },
        },
        orderBy: { fullName: "asc" },
    });
    const ids = students.map((s) => s.id);
    const progress = await prisma.studentProgress.findMany({
        where: {
            studentId: { in: ids },
            ...(subjectId ? { subjectId } : {}),
            ...(levelId ? { levelId } : {}),
        },
        include: { level: true, subject: true },
    });
    const perf = await prisma.topicPerformance.findMany({
        where: {
            studentId: { in: ids },
            ...(subjectId ? { topic: { subjectId } } : {}),
        },
        include: { topic: true },
    });
    const progressByStudent = new Map();
    for (const p of progress) {
        const arr = progressByStudent.get(p.studentId) ?? [];
        arr.push(p);
        progressByStudent.set(p.studentId, arr);
    }
    const perfByStudent = new Map();
    for (const p of perf) {
        const arr = perfByStudent.get(p.studentId) ?? [];
        arr.push(p);
        perfByStudent.set(p.studentId, arr);
    }
    const out = students
        .map((s) => {
        const pRows = (progressByStudent.get(s.id) ?? []).sort((a, b) => a.level.order - b.level.order);
        const current = pRows[pRows.length - 1] ?? null;
        const latestScore = current?.lastPercentage ?? null;
        let zone = "NA";
        if (latestScore != null) {
            if (latestScore < 50)
                zone = "RED";
            else if (latestScore < 80)
                zone = "YELLOW";
            else
                zone = "GREEN";
        }
        const topicRows = perfByStudent.get(s.id) ?? [];
        const weakTopics = topicRows
            .map((tp) => {
            const pct = tp.attemptedTotal > 0 ? (100 * tp.correctTotal) / tp.attemptedTotal : 0;
            return { name: tp.topic.name, pct };
        })
            .filter((t) => t.pct < 50)
            .sort((a, b) => a.pct - b.pct)
            .slice(0, 3)
            .map((t) => t.name);
        const strongTopics = topicRows
            .map((tp) => {
            const pct = tp.attemptedTotal > 0 ? (100 * tp.correctTotal) / tp.attemptedTotal : 0;
            return { name: tp.topic.name, pct };
        })
            .filter((t) => t.pct >= 80)
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 3)
            .map((t) => t.name);
        const suggestedAction = zone === "RED"
            ? `Retake ${current?.level.name ?? "current level"}`
            : zone === "YELLOW"
                ? `Practice ${current?.level.name ?? "current level"}`
                : zone === "GREEN"
                    ? "Move to next level"
                    : "Start first level";
        return {
            id: s.id,
            studentLoginId: s.user.studentLoginId,
            fullName: s.fullName,
            className: s.schoolClass.name,
            currentLevel: current?.level.name ?? "Not Started",
            latestScore,
            weakTopics,
            strongTopics,
            status: zone,
            suggestedAction,
        };
    })
        .filter((r) => {
        if (!status || status === "ALL")
            return true;
        return r.status === status;
    });
    res.json(out);
});
router.get("/analytics/student/:studentId/detail", async (req, res) => {
    const subjectId = req.query.subjectId;
    const student = await prisma.student.findUnique({
        where: { id: req.params.studentId },
        include: {
            schoolClass: true,
            user: { select: { studentLoginId: true } },
        },
    });
    if (!student) {
        res.status(404).json({ error: "Student not found" });
        return;
    }
    const progress = await prisma.studentProgress.findMany({
        where: {
            studentId: student.id,
            ...(subjectId ? { subjectId } : {}),
        },
        include: { level: true, subject: true },
        orderBy: [{ subjectId: "asc" }, { level: { order: "asc" } }],
    });
    const topicPerf = await prisma.topicPerformance.findMany({
        where: {
            studentId: student.id,
            ...(subjectId ? { topic: { subjectId } } : {}),
        },
        include: { topic: true },
    });
    const tests = await prisma.test.findMany({
        where: { studentId: student.id, status: "COMPLETED", ...(subjectId ? { subjectId } : {}) },
        include: { level: true, attempts: true },
        orderBy: { completedAt: "desc" },
        take: 12,
    });
    const weakTopics = topicPerf
        .map((tp) => {
        const pct = tp.attemptedTotal > 0 ? (100 * tp.correctTotal) / tp.attemptedTotal : 0;
        return { topicName: tp.topic.name, percentage: Math.round(pct * 10) / 10 };
    })
        .filter((t) => t.percentage < 50)
        .sort((a, b) => a.percentage - b.percentage);
    const strongTopics = topicPerf
        .map((tp) => {
        const pct = tp.attemptedTotal > 0 ? (100 * tp.correctTotal) / tp.attemptedTotal : 0;
        return { topicName: tp.topic.name, percentage: Math.round(pct * 10) / 10 };
    })
        .filter((t) => t.percentage >= 80)
        .sort((a, b) => b.percentage - a.percentage);
    const lastProgressDate = progress
        .map((p) => p.lastAttemptAt)
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const lastTestAttempt = tests[0]?.completedAt ?? null;
    const now = Date.now();
    const daysSinceLastActivity = lastTestAttempt ? Math.floor((now - new Date(lastTestAttempt).getTime()) / (1000 * 60 * 60 * 24)) : null;
    res.json({
        student: {
            id: student.id,
            fullName: student.fullName,
            studentLoginId: student.user.studentLoginId,
            className: student.schoolClass.name,
        },
        levelProgress: progress.map((p) => ({
            subject: p.subject.name,
            level: p.level.name,
            unlocked: p.unlocked,
            score: p.lastPercentage,
            lastAttemptAt: p.lastAttemptAt,
        })),
        weakTopics,
        strongTopics,
        tests: tests.map((t) => ({
            testId: t.id,
            level: t.level.name,
            percentage: t.attempts[0]?.percentage ?? null,
            completedAt: t.completedAt,
        })),
        lastTestAttempt,
        lastProgressDate,
        daysSinceLastActivity,
        alerts: {
            noTestIn14Days: daysSinceLastActivity != null ? daysSinceLastActivity >= 14 : true,
            noProgressIn30Days: lastProgressDate
                ? Math.floor((now - new Date(lastProgressDate).getTime()) / (1000 * 60 * 60 * 24)) >= 30
                : true,
        },
    });
});
router.get("/analytics/topic/:topicId/weak-students", async (req, res) => {
    const classId = req.query.classId;
    const topicId = req.params.topicId;
    const rows = await prisma.topicPerformance.findMany({
        where: {
            topicId,
            ...(classId ? { student: { classId } } : {}),
        },
        include: {
            student: {
                include: { schoolClass: true, user: { select: { studentLoginId: true } } },
            },
            topic: true,
        },
        orderBy: { updatedAt: "desc" },
    });
    const weak = rows
        .map((r) => ({
        studentId: r.studentId,
        studentName: r.student.fullName,
        studentLoginId: r.student.user.studentLoginId,
        className: r.student.schoolClass.name,
        percentage: r.attemptedTotal ? Math.round((100 * r.correctTotal) / r.attemptedTotal) : 0,
        attempted: r.attemptedTotal,
    }))
        .filter((r) => r.percentage < 50)
        .sort((a, b) => a.percentage - b.percentage);
    res.json({
        topicId,
        topicName: rows[0]?.topic.name ?? null,
        weakCount: weak.length,
        students: weak,
    });
});
export default router;
