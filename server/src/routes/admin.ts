import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
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
  randomFourDigitPassword,
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
  const cs = await prisma.classSubject.create({
    data: { classId: req.params.classId, subjectId: p.data.subjectId },
  });
  res.json(cs);
});

// --- Subjects / levels / topics ---
router.get("/subjects", async (_req, res) => {
  res.json(await prisma.subject.findMany({ include: { levels: { orderBy: { order: "asc" } } } }));
});

router.post("/subjects", async (req, res) => {
  const schema = z.object({ name: z.string(), code: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  res.json(await prisma.subject.create({ data: p.data }));
});

router.post("/subjects/:subjectId/levels", async (req, res) => {
  const schema = z.object({ name: z.string(), order: z.number().int() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const lvl = await prisma.level.create({
    data: { subjectId: req.params.subjectId, name: p.data.name, order: p.data.order },
  });
  res.json(lvl);
});

router.post("/subjects/:subjectId/topics", async (req, res) => {
  const schema = z.object({ name: z.string(), levelId: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const t = await prisma.topic.create({
    data: {
      subjectId: req.params.subjectId,
      name: p.data.name,
      levelId: p.data.levelId,
    },
  });
  res.json(t);
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
  const where = topicId ? { topicId } : {};
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
  let skipped = 0;
  const errors: string[] = [];

  for (const pq of parsed) {
    const hash = questionContentHash(p.data.topicId, pq.stem, pq.correctOption);
    const exists = await prisma.question.findUnique({ where: { contentHash: hash } });
    if (exists) {
      skipped++;
      continue;
    }
    try {
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
      importedCount: imported,
      skippedDuplicates: skipped,
      errorsJson: errors.length ? JSON.stringify(errors.slice(0, 20)) : null,
    },
  });

  res.json({ batchId: batch.id, imported, skipped, parseCount: parsed.length, errors });
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

router.patch("/students/:studentId/reset-password", async (req, res) => {
  const studentId = req.params.studentId;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: true },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });
  const password = randomFourDigitPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: student.userId },
    data: { passwordHash },
  });
  res.json({
    password,
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
