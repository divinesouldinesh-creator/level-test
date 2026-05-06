import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { questionContentHash } from "../utils/questionHash.js";
import { extractTextFromDocx, parseQuestionBlocks, parseDifficulty } from "../services/wordImport.js";
import {
  buildRowsFromUpload,
  classLabelForDisplay,
  generateStudentRows,
  parseStudentSheetBuffer,
  saveStudentAccounts,
} from "../services/studentAccounts.js";

const router = Router();
router.use(authMiddleware, requireRole("ADMIN"));

const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function normHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "");
}

type SheetQuestion = {
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
};

function parseQuestionSheetBuffer(buf: Buffer): SheetQuestion[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  if (!wb.SheetNames.length) throw new Error("Empty workbook");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const out: SheetQuestion[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const mapped = new Map<string, string>();
    for (const [k, v] of Object.entries(raw)) mapped.set(normHeader(String(k)), String(v ?? "").trim());
    const stem = mapped.get("question") ?? mapped.get("stem") ?? "";
    const optionA = mapped.get("optiona") ?? mapped.get("a") ?? "";
    const optionB = mapped.get("optionb") ?? mapped.get("b") ?? "";
    const optionC = mapped.get("optionc") ?? mapped.get("c") ?? "";
    const optionD = mapped.get("optiond") ?? mapped.get("d") ?? "";
    const answerRaw = (mapped.get("answer") ?? "").trim().toUpperCase();
    if (!stem && !optionA && !optionB && !optionC && !optionD && !answerRaw) continue;
    if (!stem || !optionA || !optionB || !optionC || !optionD || !answerRaw) {
      throw new Error(`Row ${i + 2}: question, optionA-D and answer are required`);
    }
    const letter = answerRaw[0] ?? "";
    const idx = letter.charCodeAt(0) - 65;
    if (idx < 0 || idx > 3) throw new Error(`Row ${i + 2}: answer must be A/B/C/D`);
    const diffRaw = (mapped.get("difficulty") ?? "").trim().toUpperCase();
    const difficulty: "EASY" | "MEDIUM" | "HARD" | undefined =
      diffRaw === "EASY" || diffRaw === "E" ? "EASY" : diffRaw === "HARD" || diffRaw === "H" ? "HARD" : diffRaw === "MEDIUM" || diffRaw === "M" ? "MEDIUM" : undefined;
    out.push({ stem, optionA, optionB, optionC, optionD, correctOption: idx, difficulty });
  }
  if (!out.length) throw new Error("No valid question rows found in file");
  return out;
}

// --- Dashboard ---
router.get("/dashboard/summary", async (_req, res) => {
  const [topicRows, classRows, students] = await Promise.all([
    prisma.topicPerformance.groupBy({
      by: ["topicId"],
      _sum: { correctTotal: true, attemptedTotal: true },
    }),
    prisma.student.groupBy({
      by: ["classId"],
      _count: { _all: true },
    }),
    prisma.student.findMany({
      include: {
        studentProgress: { orderBy: { lastAttemptAt: "desc" }, take: 5 },
      },
    }),
  ]);

  const topics = await prisma.topic.findMany({
    where: { id: { in: topicRows.map((t) => t.topicId) } },
    include: { subject: true },
  });
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  const topicStats = topicRows
    .map((r) => {
      const t = topicMap.get(r.topicId);
      const att = r._sum.attemptedTotal ?? 0;
      const cor = r._sum.correctTotal ?? 0;
      const pct = att ? (100 * cor) / att : 0;
      return {
        topicId: r.topicId,
        name: t?.name,
        subject: t?.subject.name,
        avgPercentage: Math.round(pct * 10) / 10,
      };
    })
    .sort((a, b) => a.avgPercentage - b.avgPercentage);

  const classes = await prisma.schoolClass.findMany();
  const classMap = new Map(classes.map((c) => [c.id, c.name]));

  const classAgg = classRows.map((c) => ({
    classId: c.classId,
    className: classMap.get(c.classId),
    students: c._count._all,
  }));

  res.json({
    weakestTopics: topicStats.slice(0, 10),
    strongestTopics: [...topicStats].sort((a, b) => b.avgPercentage - a.avgPercentage).slice(0, 10),
    classSizes: classAgg,
    studentCount: students.length,
  });
});

// --- Curriculum coverage ---
router.get("/coverage/summary", async (_req, res) => {
  const [totalClasses, totalSubjects, totalLevels, totalQuestions, classes] = await Promise.all([
    prisma.schoolClass.count(),
    prisma.subject.count(),
    prisma.level.count(),
    prisma.question.count(),
    prisma.schoolClass.findMany({
      orderBy: { name: "asc" },
      include: {
        subjects: {
          include: {
            subject: {
              include: {
                _count: { select: { levels: true, questions: true } },
                levels: {
                  orderBy: { order: "asc" },
                  include: { _count: { select: { questions: true } } },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  res.json({
    totals: {
      classes: totalClasses,
      subjects: totalSubjects,
      levels: totalLevels,
      questions: totalQuestions,
    },
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      subjects: c.subjects.map((cs) => ({
        id: cs.subject.id,
        name: cs.subject.name,
        code: cs.subject.code,
        levelCount: cs.subject._count.levels,
        questionCount: cs.subject._count.questions,
        levels: cs.subject.levels.map((lvl) => ({
          id: lvl.id,
          name: lvl.name,
          order: lvl.order,
          questionCount: lvl._count.questions,
        })),
      })),
    })),
  });
});

// --- Classes / sections ---
router.get("/classes", async (_req, res) => {
  const list = await prisma.schoolClass.findMany({
    include: { sections: true, subjects: { include: { subject: true } } },
  });
  res.json(list);
});

router.post("/classes", async (req, res) => {
  const schema = z.object({ name: z.string(), grade: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const c = await prisma.schoolClass.create({ data: p.data });
  res.json(c);
});

router.post("/classes/:classId/sections", async (req, res) => {
  const schema = z.object({ name: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const s = await prisma.section.create({
    data: { classId: req.params.classId, name: p.data.name },
  });
  res.json(s);
});

router.post("/classes/:classId/subjects", async (req, res) => {
  const schema = z.object({ subjectId: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const existingLink = await prisma.classSubject.findFirst({
    where: { subjectId: p.data.subjectId },
  });
  if (existingLink && existingLink.classId !== req.params.classId) {
    return res.status(400).json({
      error: "This subject is already assigned to another class. Create a separate subject for each class.",
    });
  }
  const cs = await prisma.classSubject.create({
    data: { classId: req.params.classId, subjectId: p.data.subjectId },
  });
  res.json(cs);
});

router.post("/classes/:classId/subjects/create", async (req, res) => {
  const classId = req.params.classId;
  const schema = z.object({ name: z.string().min(1), code: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const created = await prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: { name: p.data.name.trim(), code: p.data.code?.trim() || undefined },
    });
    await tx.classSubject.create({
      data: { classId, subjectId: subject.id },
    });
    return subject;
  });
  res.json(created);
});

router.post("/classes/:classId/subjects/:subjectId/clone", async (req, res) => {
  const targetClassId = req.params.classId;
  const sourceSubjectId = req.params.subjectId;
  const schema = z.object({
    name: z.string().min(1).optional(),
    code: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const sourceSubject = await prisma.subject.findUnique({
    where: { id: sourceSubjectId },
    include: {
      levels: {
        orderBy: { order: "asc" },
        include: {
          testConfig: true,
          levelTopicParticipations: { include: { topic: true }, orderBy: { sortOrder: "asc" } },
        },
      },
      topics: true,
      classSubjects: true,
    },
  });
  if (!sourceSubject) return res.status(404).json({ error: "Source subject not found" });
  if (sourceSubject.classSubjects.length === 0) {
    return res.status(400).json({ error: "Source subject is not linked to any class" });
  }
  const sourceClassId = sourceSubject.classSubjects[0]!.classId;
  if (sourceClassId === targetClassId) {
    return res.status(400).json({ error: "Source and target class must be different" });
  }

  const created = await prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: {
        name: p.data.name?.trim() || sourceSubject.name,
        code:
          p.data.code !== undefined
            ? p.data.code.trim() || null
            : sourceSubject.code,
      },
    });
    await tx.classSubject.create({
      data: { classId: targetClassId, subjectId: subject.id },
    });

    const levelIdMap = new Map<string, string>();
    for (const lvl of sourceSubject.levels) {
      const createdLevel = await tx.level.create({
        data: {
          subjectId: subject.id,
          name: lvl.name,
          order: lvl.order,
        },
      });
      levelIdMap.set(lvl.id, createdLevel.id);
      await tx.levelTestConfig.create({
        data: {
          levelId: createdLevel.id,
          questionCount: lvl.testConfig?.questionCount ?? 8,
        },
      });
    }

    const topicIdMap = new Map<string, string>();
    for (const topic of sourceSubject.topics) {
      const createdTopic = await tx.topic.create({
        data: {
          subjectId: subject.id,
          name: topic.name,
          levelId: topic.levelId ? levelIdMap.get(topic.levelId) ?? null : null,
        },
      });
      topicIdMap.set(topic.id, createdTopic.id);
    }

    for (const lvl of sourceSubject.levels) {
      const newLevelId = levelIdMap.get(lvl.id);
      if (!newLevelId) continue;
      for (const part of lvl.levelTopicParticipations) {
        const newTopicId = topicIdMap.get(part.topicId);
        if (!newTopicId) continue;
        await tx.levelTopicParticipation.create({
          data: {
            levelId: newLevelId,
            topicId: newTopicId,
            quota: part.quota,
            sortOrder: part.sortOrder,
          },
        });
      }
    }

    return subject;
  });

  res.json(created);
});

router.delete("/classes/:classId/subjects/:subjectId", async (req, res) => {
  const { classId, subjectId } = req.params;
  try {
    await prisma.classSubject.delete({
      where: { classId_subjectId: { classId, subjectId } },
    });
  } catch {
    return res.status(404).json({ error: "Class subject link not found" });
  }
  res.json({ ok: true });
});

// --- Subjects / levels / topics ---
router.get("/subjects", async (_req, res) => {
  const list = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      classSubjects: {
        include: {
          schoolClass: {
            select: { id: true, name: true, grade: true },
          },
        },
      },
      topics: { orderBy: [{ levelId: "asc" }, { name: "asc" }] },
      levels: {
        orderBy: { order: "asc" },
        include: {
          testConfig: true,
          levelTopicParticipations: {
            orderBy: { sortOrder: "asc" },
            include: { topic: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  res.json(list);
});

router.post("/subjects", async (req, res) => {
  const schema = z.object({ name: z.string(), code: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  res.json(await prisma.subject.create({ data: p.data }));
});

router.post("/subjects/:subjectId/levels", async (req, res) => {
  const subjectId = req.params.subjectId;
  const schema = z.object({
    name: z.string(),
    order: z.number().int().optional(),
    questionCount: z.number().int().positive().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const agg = await prisma.level.aggregate({
    where: { subjectId },
    _max: { order: true },
  });
  const order = p.data.order ?? (agg._max.order ?? -1) + 1;
  const lvl = await prisma.level.create({
    data: { subjectId, name: p.data.name, order },
  });
  await prisma.levelTestConfig.create({
    data: { levelId: lvl.id, questionCount: p.data.questionCount ?? 8 },
  });
  res.json(lvl);
});

router.post("/subjects/:subjectId/topics", async (req, res) => {
  const subjectId = req.params.subjectId;
  const schema = z.object({ name: z.string(), levelId: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const normalizedName = p.data.name.trim();
  if (p.data.levelId) {
    const lvl = await prisma.level.findFirst({
      where: { id: p.data.levelId, subjectId },
    });
    if (!lvl) return res.status(400).json({ error: "levelId must belong to this subject" });
  }
  const duplicateTopic = await prisma.topic.findFirst({
    where: {
      subjectId,
      levelId: p.data.levelId ?? null,
      name: { equals: normalizedName, mode: "insensitive" },
    },
  });
  if (duplicateTopic) {
    return res.status(400).json({ error: "Topic name already exists in this level" });
  }
  const t = await prisma.topic.create({
    data: {
      subjectId,
      name: normalizedName,
      levelId: p.data.levelId,
    },
  });
  res.json(t);
});

router.delete("/subjects/:subjectId", async (req, res) => {
  const subjectId = req.params.subjectId;
  const force = String(req.query.force ?? "").toLowerCase();
  const forceDelete = force === "1" || force === "true" || force === "yes";
  if (!forceDelete) {
    const [usedInTests, hasProgress] = await Promise.all([
      prisma.test.findFirst({ where: { subjectId }, select: { id: true } }),
      prisma.studentProgress.findFirst({ where: { subjectId }, select: { id: true } }),
    ]);
    if (usedInTests || hasProgress) {
      return res.status(400).json({
        error:
          "Cannot delete subject with student test/progress history. Remove only unused subjects. Use force delete to remove anyway.",
      });
    }
  }
  try {
    await prisma.subject.delete({ where: { id: subjectId } });
  } catch {
    return res.status(404).json({ error: "Subject not found" });
  }
  res.json({ ok: true });
});

router.patch("/topics/:topicId", async (req, res) => {
  const topicId = req.params.topicId;
  const schema = z.object({
    name: z.string().optional(),
    levelId: z.string().nullable().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const existing = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!existing) return res.status(404).json({ error: "Topic not found" });
  if (p.data.levelId !== undefined && p.data.levelId !== null) {
    const lvl = await prisma.level.findFirst({
      where: { id: p.data.levelId, subjectId: existing.subjectId },
    });
    if (!lvl) return res.status(400).json({ error: "levelId must belong to the same subject" });
  }
  const nextName = p.data.name?.trim();
  const nextLevelId = p.data.levelId !== undefined ? p.data.levelId : existing.levelId;
  if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateTopic = await prisma.topic.findFirst({
      where: {
        subjectId: existing.subjectId,
        levelId: nextLevelId,
        name: { equals: nextName, mode: "insensitive" },
        id: { not: topicId },
      },
    });
    if (duplicateTopic) return res.status(400).json({ error: "Topic name already exists in this level" });
  }
  const t = await prisma.topic.update({
    where: { id: topicId },
    data: {
      ...(p.data.name !== undefined ? { name: nextName } : {}),
      ...(p.data.levelId !== undefined ? { levelId: p.data.levelId } : {}),
    },
  });
  res.json(t);
});

router.delete("/topics/:topicId", async (req, res) => {
  const topicId = req.params.topicId;
  const force = String(req.query.force ?? "").toLowerCase();
  const forceDelete = force === "1" || force === "true" || force === "yes";
  if (!forceDelete) {
    const [hasPerformance, usedInTestOrAnswer] = await Promise.all([
      prisma.topicPerformance.findFirst({ where: { topicId }, select: { id: true } }),
      prisma.question.findFirst({
        where: {
          topicId,
          OR: [{ testQuestions: { some: {} } }, { studentAnswers: { some: {} } }],
        },
        select: { id: true },
      }),
    ]);
    if (hasPerformance || usedInTestOrAnswer) {
      return res.status(400).json({
        error: "Cannot delete topic with student usage/history. Use force delete to remove anyway.",
      });
    }
  }
  try {
    await prisma.topic.delete({ where: { id: topicId } });
  } catch {
    return res.status(404).json({ error: "Topic not found" });
  }
  res.json({ ok: true });
});

router.delete("/levels/:levelId", async (req, res) => {
  const levelId = req.params.levelId;
  const force = String(req.query.force ?? "").toLowerCase();
  const forceDelete = force === "1" || force === "true" || force === "yes";
  if (!forceDelete) {
    const [usedInTests, hasProgress] = await Promise.all([
      prisma.test.findFirst({ where: { levelId }, select: { id: true } }),
      prisma.studentProgress.findFirst({ where: { levelId }, select: { id: true } }),
    ]);
    if (usedInTests || hasProgress) {
      return res.status(400).json({
        error: "Cannot delete level with student test/progress history. Use force delete to remove anyway.",
      });
    }
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.topic.deleteMany({ where: { levelId } });
      await tx.level.delete({ where: { id: levelId } });
    });
  } catch {
    return res.status(404).json({ error: "Level not found" });
  }
  res.json({ ok: true });
});

router.patch("/levels/:levelId", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    order: z.number().int().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const existing = await prisma.level.findUnique({ where: { id: req.params.levelId } });
  if (!existing) return res.status(404).json({ error: "Level not found" });
  const updated = await prisma.level.update({
    where: { id: existing.id },
    data: {
      ...(p.data.name !== undefined ? { name: p.data.name.trim() } : {}),
      ...(p.data.order !== undefined ? { order: p.data.order } : {}),
    },
  });
  res.json(updated);
});

router.put("/levels/:levelId/test-config", async (req, res) => {
  const schema = z.object({ questionCount: z.number().int().positive() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const cfg = await prisma.levelTestConfig.upsert({
    where: { levelId: req.params.levelId },
    create: { levelId: req.params.levelId, questionCount: p.data.questionCount },
    update: { questionCount: p.data.questionCount },
  });
  res.json(cfg);
});

router.put("/levels/:levelId/topics", async (req, res) => {
  const schema = z.array(
    z.object({ topicId: z.string(), quota: z.number().int().positive().nullable().optional(), sortOrder: z.number().optional() })
  );
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  await prisma.levelTopicParticipation.deleteMany({ where: { levelId: req.params.levelId } });
  for (let i = 0; i < p.data.length; i++) {
    const row = p.data[i];
    await prisma.levelTopicParticipation.create({
      data: {
        levelId: req.params.levelId,
        topicId: row.topicId,
        quota: row.quota ?? null,
        sortOrder: row.sortOrder ?? i,
      },
    });
  }
  res.json({ ok: true });
});

// --- Questions CRUD ---
router.get("/questions", async (req, res) => {
  const topicId = req.query.topicId as string | undefined;
  const levelId = req.query.levelId as string | undefined;
  const subjectId = req.query.subjectId as string | undefined;
  const where = {
    ...(topicId ? { topicId } : {}),
    ...(levelId ? { levelId } : {}),
    ...(subjectId ? { subjectId } : {}),
  };
  const list = await prisma.question.findMany({
    where,
    take: 200,
    orderBy: { createdAt: "desc" },
    include: { topic: true, level: true, subject: true },
  });
  res.json(list);
});

router.post("/questions", async (req, res) => {
  const schema = z.object({
    subjectId: z.string(),
    levelId: z.string(),
    topicId: z.string(),
    stem: z.string(),
    optionA: z.string(),
    optionB: z.string(),
    optionC: z.string(),
    optionD: z.string(),
    correctOption: z.number().min(0).max(3),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const hash = questionContentHash(p.data.topicId, p.data.stem, p.data.correctOption);
  const dup = await prisma.question.findUnique({ where: { contentHash: hash } });
  if (dup) {
    res.status(409).json({ error: "Duplicate question", id: dup.id });
    return;
  }
  const q = await prisma.question.create({
    data: {
      ...p.data,
      contentHash: hash,
      createdById: req.user!.sub,
      difficulty: p.data.difficulty ?? "MEDIUM",
    },
  });
  res.json(q);
});

router.delete("/questions/:id", async (req, res) => {
  await prisma.question.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.patch("/questions/:id", async (req, res) => {
  const schema = z.object({
    stem: z.string().optional(),
    optionA: z.string().optional(),
    optionB: z.string().optional(),
    optionC: z.string().optional(),
    optionD: z.string().optional(),
    correctOption: z.number().int().min(0).max(3).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Question not found" });

  const nextStem = p.data.stem ?? existing.stem;
  const nextCorrectOption = p.data.correctOption ?? existing.correctOption;
  const nextHash = questionContentHash(existing.topicId, nextStem, nextCorrectOption);
  const dup = await prisma.question.findUnique({ where: { contentHash: nextHash } });
  if (dup && dup.id !== existing.id) return res.status(409).json({ error: "Duplicate question", id: dup.id });

  const q = await prisma.question.update({
    where: { id: existing.id },
    data: {
      ...p.data,
      contentHash: nextHash,
    },
  });
  res.json(q);
});

// --- Word import ---
router.post("/questions/import", upload.single("file"), async (req, res) => {
  const schema = z.object({
    subjectId: z.string(),
    levelId: z.string(),
    topicId: z.string(),
    difficulty: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: p.success ? "file required" : p.error.flatten() });
    return;
  }

  const originalname = req.file.originalname;
  const buf = fs.readFileSync(req.file.path);
  fs.unlink(req.file.path, () => {});

  let text: string;
  try {
    text = await extractTextFromDocx(buf);
  } catch (e) {
    res.status(400).json({ error: "Could not read document" });
    return;
  }

  const parsed = parseQuestionBlocks(text);
  const diff = parseDifficulty(p.data.difficulty);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const modeRaw = String(req.body.mode ?? "insert").toLowerCase();
  const mode = modeRaw === "sync" || modeRaw === "replace" ? modeRaw : "insert";
  if (mode === "replace") {
    await prisma.question.deleteMany({
      where: {
        subjectId: p.data.subjectId,
        levelId: p.data.levelId,
        topicId: p.data.topicId,
      },
    });
  }

  for (const pq of parsed) {
    try {
      const hash = questionContentHash(p.data.topicId, pq.stem, pq.correctOption);
      if (mode === "sync") {
        const existingByStem = await prisma.question.findFirst({
          where: {
            topicId: p.data.topicId,
            stem: pq.stem,
          },
        });
        if (existingByStem) {
          const clash = await prisma.question.findUnique({ where: { contentHash: hash } });
          if (clash && clash.id !== existingByStem.id) {
            skipped++;
            continue;
          }
          await prisma.question.update({
            where: { id: existingByStem.id },
            data: {
              subjectId: p.data.subjectId,
              levelId: p.data.levelId,
              topicId: p.data.topicId,
              stem: pq.stem,
              optionA: pq.optionA,
              optionB: pq.optionB,
              optionC: pq.optionC,
              optionD: pq.optionD,
              correctOption: pq.correctOption,
              difficulty: diff,
              contentHash: hash,
            },
          });
          updated++;
          continue;
        }
      }
      const exists = await prisma.question.findUnique({ where: { contentHash: hash } });
      if (exists) {
        skipped++;
        continue;
      }
      await prisma.question.create({
        data: {
          subjectId: p.data.subjectId,
          levelId: p.data.levelId,
          topicId: p.data.topicId,
          stem: pq.stem,
          optionA: pq.optionA,
          optionB: pq.optionB,
          optionC: pq.optionC,
          optionD: pq.optionD,
          correctOption: pq.correctOption,
          difficulty: diff,
          contentHash: hash,
          createdById: req.user!.sub,
        },
      });
      imported++;
    } catch (e) {
      errors.push(String(e));
    }
  }

  const batch = await prisma.questionImport.create({
    data: {
      filename: originalname,
      uploadedById: req.user!.sub,
      importedCount: imported + updated,
      skippedDuplicates: skipped,
      errorsJson: errors.length ? JSON.stringify(errors.slice(0, 20)) : null,
    },
  });

  res.json({ batchId: batch.id, mode, imported, updated, skipped, parseCount: parsed.length, errors });
});

// --- Excel/CSV import ---
router.post("/questions/import-sheet", upload.single("file"), async (req, res) => {
  const schema = z.object({
    subjectId: z.string(),
    levelId: z.string(),
    topicId: z.string(),
    mode: z.enum(["insert", "sync", "replace"]).optional(),
    difficulty: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: p.success ? "file required" : p.error.flatten() });
    return;
  }
  const buf = fs.readFileSync(req.file.path);
  fs.unlink(req.file.path, () => {});
  let parsed: SheetQuestion[];
  try {
    parsed = parseQuestionSheetBuffer(buf);
  } catch (e) {
    res.status(400).json({ error: String(e) });
    return;
  }

  const diffFallback = parseDifficulty(p.data.difficulty);
  const mode = p.data.mode ?? "insert";
  if (mode === "replace") {
    await prisma.question.deleteMany({
      where: { subjectId: p.data.subjectId, levelId: p.data.levelId, topicId: p.data.topicId },
    });
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of parsed) {
    try {
      const hash = questionContentHash(p.data.topicId, row.stem, row.correctOption);
      if (mode === "sync") {
        const existingByStem = await prisma.question.findFirst({
          where: { topicId: p.data.topicId, stem: row.stem },
        });
        if (existingByStem) {
          const clash = await prisma.question.findUnique({ where: { contentHash: hash } });
          if (clash && clash.id !== existingByStem.id) {
            skipped++;
            continue;
          }
          await prisma.question.update({
            where: { id: existingByStem.id },
            data: {
              subjectId: p.data.subjectId,
              levelId: p.data.levelId,
              topicId: p.data.topicId,
              stem: row.stem,
              optionA: row.optionA,
              optionB: row.optionB,
              optionC: row.optionC,
              optionD: row.optionD,
              correctOption: row.correctOption,
              difficulty: row.difficulty ?? diffFallback,
              contentHash: hash,
            },
          });
          updated++;
          continue;
        }
      }
      const exists = await prisma.question.findUnique({ where: { contentHash: hash } });
      if (exists) {
        skipped++;
        continue;
      }
      await prisma.question.create({
        data: {
          subjectId: p.data.subjectId,
          levelId: p.data.levelId,
          topicId: p.data.topicId,
          stem: row.stem,
          optionA: row.optionA,
          optionB: row.optionB,
          optionC: row.optionC,
          optionD: row.optionD,
          correctOption: row.correctOption,
          difficulty: row.difficulty ?? diffFallback,
          contentHash: hash,
          createdById: req.user!.sub,
        },
      });
      imported++;
    } catch (e) {
      errors.push(String(e));
    }
  }
  res.json({ mode, imported, updated, skipped, parseCount: parsed.length, errors });
});

// --- Student account management ---
const generateStudentsSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  count: z.number().int().min(1).max(500),
});

router.post("/generate-students", async (req, res) => {
  const p = generateStudentsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  try {
    const students = await generateStudentRows(prisma, p.data);
    res.json({ students });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

const uploadRowsSchema = z.object({
  rows: z.array(
    z.object({
      name: z.string(),
      class: z.string(),
      section: z.string(),
    })
  ),
});

router.post("/upload-students", async (req, res) => {
  const p = uploadRowsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  try {
    const students = await buildRowsFromUpload(prisma, p.data.rows);
    res.json({ students });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.post(
  "/upload-students/file",
  upload.single("file"),
  async (req, res) => {
    if (!req.file?.path) return res.status(400).json({ error: "Missing file" });
    try {
      const buf = fs.readFileSync(req.file.path);
      fs.unlinkSync(req.file.path);
      const rows = parseStudentSheetBuffer(buf);
      const students = await buildRowsFromUpload(prisma, rows);
      res.json({ students });
    } catch (e) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: String(e) });
    }
  }
);

const saveStudentsSchema = z.object({
  students: z.array(
    z.object({
      fullName: z.string().min(1),
      studentLoginId: z.string().min(1),
      password: z.string().min(4).max(32),
      classId: z.string().min(1),
      sectionId: z.string().min(1),
      className: z.string().optional(),
      classLabel: z.string().optional(),
      sectionName: z.string().optional(),
    })
  ),
});

router.post("/save-students", async (req, res) => {
  const p = saveStudentsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  try {
    const result = await saveStudentAccounts(prisma, p.data.students);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.get("/students", async (req, res) => {
  const classId =
    typeof req.query.classId === "string" && req.query.classId ? req.query.classId : undefined;
  const sectionId =
    typeof req.query.sectionId === "string" && req.query.sectionId ? req.query.sectionId : undefined;

  const list = await prisma.student.findMany({
    where: {
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
    },
    include: {
      schoolClass: true,
      section: true,
      user: { select: { studentLoginId: true } },
    },
    orderBy: [{ schoolClass: { name: "asc" } }, { section: { name: "asc" } }, { fullName: "asc" }],
  });

  res.json({
    students: list.map((s) => ({
      id: s.id,
      userId: s.userId,
      fullName: s.fullName,
      classId: s.classId,
      sectionId: s.sectionId,
      className: s.schoolClass.name,
      classLabel: classLabelForDisplay(s.schoolClass),
      sectionName: s.section.name,
      username: s.user.studentLoginId ?? "",
    })),
  });
});

const resetPasswordSchema = z.object({
  password: z.string().min(4).max(32),
});

router.patch("/students/:studentId/reset-password", async (req, res) => {
  const p = resetPasswordSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const studentId = req.params.studentId;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: true },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });
  const passwordHash = await bcrypt.hash(p.data.password, 10);
  await prisma.user.update({
    where: { id: student.userId },
    data: { passwordHash },
  });
  res.json({
    password: p.data.password,
    student: {
      id: student.id,
      fullName: student.fullName,
      username: student.user.studentLoginId,
    },
  });
});

router.delete("/students/:studentId", async (req, res) => {
  const studentId = req.params.studentId;
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return res.status(404).json({ error: "Student not found" });
  await prisma.user.delete({ where: { id: student.userId } });
  res.json({ ok: true });
});

const bulkDeleteStudentsSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(500),
});

router.delete("/students", async (req, res) => {
  const p = bulkDeleteStudentsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const requestedIds = [...new Set(p.data.studentIds)];
  const students = await prisma.student.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true, userId: true },
  });

  const foundIdSet = new Set(students.map((s) => s.id));
  const notFoundIds = requestedIds.filter((id) => !foundIdSet.has(id));
  const userIds = [...new Set(students.map((s) => s.userId))];

  if (userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  res.json({
    requested: requestedIds.length,
    deleted: students.length,
    notFoundIds,
  });
});

// --- Users: students / teachers (single create) ---

const studentCreateSchema = z.object({
  studentLoginId: z.string(),
  password: z.string().min(6),
  fullName: z.string(),
  classId: z.string(),
  sectionId: z.string(),
});

router.post("/students", async (req, res) => {
  const p = studentCreateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const passwordHash = await bcrypt.hash(p.data.password, 10);
  const user = await prisma.user.create({
    data: {
      studentLoginId: p.data.studentLoginId,
      passwordHash,
      role: "STUDENT",
    },
  });
  const st = await prisma.student.create({
    data: {
      userId: user.id,
      fullName: p.data.fullName,
      classId: p.data.classId,
      sectionId: p.data.sectionId,
    },
  });
  res.json({ id: st.id, userId: user.id });
});

router.post("/teachers", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const passwordHash = await bcrypt.hash(p.data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: p.data.email.toLowerCase(),
      passwordHash,
      role: "TEACHER",
    },
  });
  const t = await prisma.teacher.create({
    data: { userId: user.id, fullName: p.data.fullName },
  });
  res.json({ id: t.id });
});

export default router;
