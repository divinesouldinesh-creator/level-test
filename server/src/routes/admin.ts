import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { attendanceOverviewForSchool, attendanceReportForStudent, attendanceSummaryForClassSection } from "../services/attendanceReport.js";
import {
  attendanceOverviewQuerySchema,
  attendanceReportQuerySchemaWithStudent,
  attendanceSummaryQuerySchema,
} from "../schemas/attendanceReportQuery.js";
import { updateStudentNameSchema } from "../schemas/student.js";
import { questionContentHash } from "../utils/questionHash.js";
import {
  extractTextFromDocx,
  parseQuestionDocument,
  parseDifficulty,
  type ParsedQuestion,
} from "../services/wordImport.js";
import { questionAnswerKey } from "../services/questionAnswer.js";
import { persistParsedQuestions, normalizeQuestionFields } from "../services/questionPersist.js";
import { parseQuestionSheetWithImages } from "../services/sheetQuestionImport.js";
import {
  buildRowsFromUpload,
  classLabelForDisplay,
  generateStudentRows,
  parseStudentSheetBuffer,
  saveStudentAccounts,
} from "../services/studentAccounts.js";
import {
  getSchoolBranding,
  updateSchoolLogo,
  updateSchoolName,
} from "../services/schoolBranding.js";
import { sendBrandingError } from "../utils/brandingErrors.js";
import { CACHE_KEY, CACHE_TTL_MS, cacheGetOrSet, invalidateCatalog } from "../lib/memoryCache.js";
import {
  deleteHolidayException,
  getHolidaySettings,
  holidayNameForDate,
  parseIsoDate,
  resolveHolidays,
  updateHolidaySettings,
  upsertHolidayException,
} from "../services/schoolHolidays.js";
import feesRoutes from "./fees.js";
import { todayLoginCompletionCounts } from "../services/studentEngagement.js";

const router = Router();
router.use(authMiddleware, requireRole("ADMIN", "OFFICE"));

/** Office may use people/attendance admin APIs only; curriculum stays ADMIN-only. */
function officeMayAccessAdminRoute(method: string, path: string): boolean {
  const p = path.split("?")[0] || "/";
  const prefixes = [
    "/students",
    "/teachers",
    "/attendance",
    "/fees",
    "/generate-students",
    "/upload-students",
    "/save-students",
  ];
  if (prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
    return true;
  }
  // Class list for filters / student create â€” read only
  if (p === "/classes" || p.startsWith("/classes/")) {
    return method.toUpperCase() === "GET";
  }
  return false;
}

router.use((req, res, next) => {
  if (req.user?.role === "ADMIN") {
    next();
    return;
  }
  if (req.user?.role === "OFFICE" && officeMayAccessAdminRoute(req.method, req.path)) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
});

router.use(feesRoutes);

router.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    next();
    return;
  }
  const p = req.path.split("?")[0] || "/";
  const isCatalogWrite =
    p === "/classes" ||
    p.startsWith("/classes/") ||
    p === "/subjects" ||
    p.startsWith("/subjects/") ||
    p === "/subject-areas" ||
    p.startsWith("/subject-areas/") ||
    p === "/topics" ||
    p.startsWith("/topics/") ||
    p.startsWith("/chapter-topics/") ||
    p === "/levels" ||
    p.startsWith("/levels/");
  if (!isCatalogWrite) {
    next();
    return;
  }
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode < 400) invalidateCatalog();
    return originalJson(body);
  }) as typeof res.json;
  next();
});

const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const questionsUploadDir = path.join(uploadDir, "questions");
if (!fs.existsSync(questionsUploadDir)) {
  fs.mkdirSync(questionsUploadDir, { recursive: true });
}
const schoolUploadDir = path.join(uploadDir, "school");
if (!fs.existsSync(schoolUploadDir)) {
  fs.mkdirSync(schoolUploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 15 * 1024 * 1024 },
});

function withSingleUpload(field: string) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    upload.single(field)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File is too large (max 15 MB)" });
        return;
      }
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: message });
    });
  };
}

const sheetUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 40 * 1024 * 1024 },
});

function withSheetUpload(field: string) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    sheetUpload.single(field)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File is too large (max 40 MB)" });
        return;
      }
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: message });
    });
  };
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, questionsUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext) ? ext : ".jpg";
      cb(null, `${randomUUID()}${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, GIF, or WebP images are allowed"));
  },
});

const schoolLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, schoolUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext) ? ext : ".png";
      cb(null, `logo-${randomUUID()}${safe}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, GIF, or WebP images are allowed"));
  },
});

const stemImageUrlSchema = z
  .string()
  .max(2048)
  .nullable()
  .optional()
  .refine((v) => v == null || v === "" || v.startsWith("/uploads/") || /^https?:\/\//i.test(v), {
    message: "Invalid image URL",
  });

const subjectTestModeSchema = z.enum(["LEVEL", "CHAPTER"]);

function parseOptionalLevelId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (!v || v === "none" || v === "null") return undefined;
  return v;
}

async function resolveQuestionPlacement(
  subjectId: string,
  topicId: string,
  levelId?: string | null,
  chapterTopicId?: string | null
): Promise<
  | { ok: true; subjectId: string; levelId: string | null; topicId: string; chapterTopicId: string | null }
  | { ok: false; status: number; error: string }
> {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, testMode: true },
  });
  if (!subject) return { ok: false, status: 404, error: "Subject not found" };
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) return { ok: false, status: 400, error: "Chapter not found" };

  if (subject.testMode === "CHAPTER") {
    const chapter = await prisma.subjectChapter.findUnique({
      where: { subjectId_topicId: { subjectId, topicId } },
      include: { _count: { select: { chapterTopics: true } } },
    });
    if (!chapter) return { ok: false, status: 400, error: "Chapter is not on this branch" };
    const requested = chapterTopicId?.trim() || null;
    if (requested) {
      const folder = await prisma.chapterTopic.findFirst({
        where: { id: requested, subjectChapterId: chapter.id },
        select: { id: true },
      });
      if (!folder) return { ok: false, status: 400, error: "Topic is not in this chapter" };
      return { ok: true, subjectId, topicId, levelId: null, chapterTopicId: folder.id };
    }
    if (chapter._count.chapterTopics > 0) {
      return { ok: false, status: 400, error: "Choose a topic in this chapter" };
    }
    return { ok: true, subjectId, topicId, levelId: null, chapterTopicId: null };
  }

  if (!levelId) return { ok: false, status: 400, error: "levelId required" };
  const level = await prisma.level.findFirst({
    where: { id: levelId, subjectId },
    select: { id: true },
  });
  if (!level) return { ok: false, status: 400, error: "Level not found for this subject" };
  if (chapterTopicId) return { ok: false, status: 400, error: "Topics inside a chapter are only for book branches" };
  return { ok: true, subjectId, topicId, levelId, chapterTopicId: null };
}

// --- Dashboard ---
router.get("/dashboard/summary", async (_req, res) => {
  const activeWindowDays = 30;
  const activeSince = new Date(Date.now() - activeWindowDays * 24 * 60 * 60 * 1000);
  const [classRows, studentCount, studentsUsedRecently, activeClassRows, classes, todayLogin] =
    await Promise.all([
      prisma.student.groupBy({
        by: ["classId"],
        _count: { _all: true },
      }),
      prisma.student.count(),
      prisma.test.groupBy({
        by: ["studentId"],
        where: { startedAt: { gte: activeSince } },
      }),
      prisma.student.groupBy({
        by: ["classId"],
        where: {
          tests: {
            some: {
              startedAt: { gte: activeSince },
            },
          },
        },
        _count: { _all: true },
      }),
      prisma.schoolClass.findMany({ select: { id: true, name: true } }),
      todayLoginCompletionCounts(prisma).catch((err) => {
        console.error("today login completion counts failed", err);
        return {
          dayKey: "",
          loggedIn: 0,
          completed: 0,
          leftWithoutCompleting: 0,
        };
      }),
    ]);

  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const classAgg = classRows.map((c) => ({
    classId: c.classId,
    className: classMap.get(c.classId),
    students: c._count._all,
  }));
  const activeByClass = new Map(activeClassRows.map((c) => [c.classId, c._count._all]));
  const classActivity = classAgg.map((c) => ({
    classId: c.classId,
    className: c.className,
    students: c.students,
    activeStudents: activeByClass.get(c.classId) ?? 0,
  }));

  res.json({
    studentCount,
    activeWindowDays,
    studentsUsedRecentlyCount: studentsUsedRecently.length,
    classActivity,
    today: {
      dayKey: todayLogin.dayKey,
      loggedIn: todayLogin.loggedIn,
      completed: todayLogin.completed,
      leftWithoutCompleting: todayLogin.leftWithoutCompleting,
    },
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
  const list = await cacheGetOrSet(CACHE_KEY.adminClasses, CACHE_TTL_MS.catalog, () =>
    prisma.schoolClass.findMany({
      include: { sections: true, subjects: { include: { subject: true } } },
    })
  );
  res.json(list);
});

router.get("/attendance/report", async (req, res) => {
  const parsed = attendanceReportQuerySchemaWithStudent.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const report = await attendanceReportForStudent(prisma, parsed.data.studentId, {
    range: parsed.data.range,
    anchorDate: parsed.data.date,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  if (!report) return res.status(404).json({ error: "Student not found" });
  if ("error" in report) return res.status(400).json({ error: report.error });
  res.json(report);
});

router.get("/attendance/summary", async (req, res) => {
  const parsed = attendanceSummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const summary = await attendanceSummaryForClassSection(
    prisma,
    parsed.data.classId,
    parsed.data.sectionId,
    {
      range: parsed.data.range,
      anchorDate: parsed.data.date,
      from: parsed.data.from,
      to: parsed.data.to,
    }
  );
  if (!summary) return res.status(404).json({ error: "Class or section not found" });
  if ("error" in summary) return res.status(400).json({ error: summary.error });
  res.json(summary);
});

router.get("/attendance/overview", async (req, res) => {
  const parsed = attendanceOverviewQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const overview = await attendanceOverviewForSchool(prisma, {
    range: parsed.data.range,
    anchorDate: parsed.data.date,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  if ("error" in overview) return res.status(400).json({ error: overview.error });
  res.json(overview);
});

function attendanceDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function staffDisplayName(user: {
  email: string | null;
  teacher: { fullName: string } | null;
  admin: { fullName: string } | null;
  office: { fullName: string } | null;
} | null): string | null {
  if (!user) return null;
  return (
    user.teacher?.fullName ??
    user.admin?.fullName ??
    user.office?.fullName ??
    user.email ??
    null
  );
}

/** Which class sections have attendance marked for a calendar day. */
router.get("/attendance/marking-status", async (req, res) => {
  const dateInput = typeof req.query.date === "string" ? req.query.date : "";
  const date = attendanceDateOnly(dateInput);
  if (!date) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const [classes, sessions, holidayName] = await Promise.all([
    prisma.schoolClass.findMany({
      include: { sections: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.attendanceSession.findMany({
      where: { date },
      include: {
        takenBy: {
          select: {
            email: true,
            teacher: { select: { fullName: true } },
            admin: { select: { fullName: true } },
            office: { select: { fullName: true } },
          },
        },
        _count: { select: { entries: true } },
      },
    }),
    holidayNameForDate(prisma, dateInput),
  ]);

  const sessionByKey = new Map(
    sessions.map((s) => [`${s.classId}:${s.sectionId}`, s] as const)
  );

  const rows: {
    classId: string;
    className: string;
    sectionId: string;
    sectionName: string;
    marked: boolean;
    markedBy: string | null;
    markedAt: string | null;
    entryCount: number;
  }[] = [];

  for (const c of classes) {
    for (const sec of c.sections) {
      const session = sessionByKey.get(`${c.id}:${sec.id}`);
      rows.push({
        classId: c.id,
        className: c.name,
        sectionId: sec.id,
        sectionName: sec.name,
        marked: !!session,
        markedBy: session ? staffDisplayName(session.takenBy) : null,
        markedAt: session?.updatedAt?.toISOString() ?? null,
        entryCount: session?._count.entries ?? 0,
      });
    }
  }

  const markedCount = rows.filter((r) => r.marked).length;
  res.json({
    date: dateInput,
    isHoliday: holidayName != null,
    holidayName,
    totalSections: rows.length,
    markedCount,
    unmarkedCount: rows.length - markedCount,
    rows,
  });
});

const holidaySettingsSchema = z.object({
  sundaysOff: z.boolean().optional(),
  saturdayRule: z.enum(["NONE", "SECOND", "ALL"]).optional(),
});

const holidayExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["EXTRA", "WORKING"]),
  name: z.string().trim().max(120).optional(),
});

router.get("/attendance/holiday-settings", async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  if (from && to) {
    if (!parseIsoDate(from) || !parseIsoDate(to) || from > to) {
      res.status(400).json({ error: "from and to must be YYYY-MM-DD with from ≤ to" });
      return;
    }
    const resolved = await resolveHolidays(prisma, from, to);
    res.json({ from, to, ...resolved });
    return;
  }
  const settings = await getHolidaySettings(prisma);
  res.json({ settings });
});

router.patch("/attendance/holiday-settings", async (req, res) => {
  const p = holidaySettingsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  if (p.data.sundaysOff == null && p.data.saturdayRule == null) {
    res.status(400).json({ error: "Provide sundaysOff and/or saturdayRule" });
    return;
  }
  const settings = await updateHolidaySettings(prisma, p.data);
  res.json({ settings });
});

router.post("/attendance/holidays", async (req, res) => {
  const p = holidayExceptionSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const row = await upsertHolidayException(prisma, p.data);
  if ("error" in row) return res.status(400).json({ error: row.error });
  res.json(row);
});

router.delete("/attendance/holidays/:id", async (req, res) => {
  const ok = await deleteHolidayException(prisma, req.params.id);
  if (!ok) return res.status(404).json({ error: "Holiday not found" });
  res.json({ ok: true });
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
  const cs = await prisma.classSubject.upsert({
    where: {
      classId_subjectId: {
        classId: req.params.classId,
        subjectId: p.data.subjectId,
      },
    },
    create: { classId: req.params.classId, subjectId: p.data.subjectId },
    update: {},
  });
  res.json(cs);
});

router.post("/classes/:classId/subjects/create", async (req, res) => {
  const classId = req.params.classId;
  const schema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    areaId: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const created = await prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: {
        name: p.data.name.trim(),
        code: p.data.code?.trim() || undefined,
        areaId: p.data.areaId || undefined,
      },
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
        areaId: sourceSubject.areaId,
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
    const uniqueTopicIds = new Set<string>();
    for (const lvl of sourceSubject.levels) {
      for (const part of lvl.levelTopicParticipations) uniqueTopicIds.add(part.topicId);
    }
    for (const oldTopicId of uniqueTopicIds) {
      const sourceTopic = sourceSubject.levels
        .flatMap((lvl) => lvl.levelTopicParticipations)
        .find((part) => part.topicId === oldTopicId)?.topic;
      if (!sourceTopic) continue;
      const topic = await tx.topic.upsert({
        where: { name: sourceTopic.name },
        update: {},
        create: { name: sourceTopic.name },
      });
      topicIdMap.set(oldTopicId, topic.id);
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

// --- Subject areas (Maths / English) â†’ branches (skill subjects) ---
router.get("/subject-areas", async (_req, res) => {
  const payload = await cacheGetOrSet(CACHE_KEY.adminAreas, CACHE_TTL_MS.catalog, async () => {
    const areas = await prisma.subjectArea.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        subjects: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true, testMode: true },
        },
        _count: { select: { subjects: true } },
      },
    });
    return areas.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      sortOrder: a.sortOrder,
      branchCount: a._count.subjects,
      branches: a.subjects,
    }));
  });
  res.json(payload);
});

router.post("/subject-areas", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    sortOrder: z.number().int().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const name = p.data.name.trim();
  const dup = await prisma.subjectArea.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (dup) return res.status(400).json({ error: "Subject already exists" });
  const agg = await prisma.subjectArea.aggregate({ _max: { sortOrder: true } });
  const area = await prisma.subjectArea.create({
    data: {
      name,
      code: p.data.code?.trim() || undefined,
      sortOrder: p.data.sortOrder ?? (agg._max.sortOrder ?? -1) + 1,
    },
  });
  res.json(area);
});

router.patch("/subject-areas/:areaId", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    code: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const existing = await prisma.subjectArea.findUnique({ where: { id: req.params.areaId } });
  if (!existing) return res.status(404).json({ error: "Subject not found" });
  if (p.data.name) {
    const next = p.data.name.trim();
    const dup = await prisma.subjectArea.findFirst({
      where: {
        name: { equals: next, mode: "insensitive" },
        id: { not: existing.id },
      },
    });
    if (dup) return res.status(400).json({ error: "Subject name already exists" });
  }
  const area = await prisma.subjectArea.update({
    where: { id: existing.id },
    data: {
      ...(p.data.name !== undefined ? { name: p.data.name.trim() } : {}),
      ...(p.data.code !== undefined ? { code: p.data.code?.trim() || null } : {}),
      ...(p.data.sortOrder !== undefined ? { sortOrder: p.data.sortOrder } : {}),
    },
  });
  res.json(area);
});

router.delete("/subject-areas/:areaId", async (req, res) => {
  const areaId = req.params.areaId;
  const count = await prisma.subject.count({ where: { areaId } });
  if (count > 0) {
    return res.status(400).json({
      error: "Move or delete all branches under this subject first",
    });
  }
  try {
    await prisma.subjectArea.delete({ where: { id: areaId } });
  } catch {
    return res.status(404).json({ error: "Subject not found" });
  }
  res.json({ ok: true });
});

router.post("/subject-areas/:areaId/branches", async (req, res) => {
  const areaId = req.params.areaId;
  const schema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    classId: z.string().optional(),
    testMode: subjectTestModeSchema.optional(),
    chapterTestQuestionCount: z.number().int().positive().optional(),
    chapterNegativeMarking: z.boolean().optional(),
    chapterWrongPenalty: z.number().finite().min(0).max(1).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const area = await prisma.subjectArea.findUnique({ where: { id: areaId } });
  if (!area) return res.status(404).json({ error: "Subject not found" });

  const created = await prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: {
        name: p.data.name.trim(),
        code: p.data.code?.trim() || undefined,
        areaId,
        testMode: p.data.testMode ?? "LEVEL",
        chapterTestQuestionCount: p.data.chapterTestQuestionCount ?? 10,
        chapterNegativeMarking: p.data.chapterNegativeMarking ?? false,
        chapterWrongPenalty: p.data.chapterWrongPenalty ?? 0.25,
      },
    });
    if (p.data.classId) {
      await tx.classSubject.create({
        data: { classId: p.data.classId, subjectId: subject.id },
      });
    }
    return subject;
  });
  res.json(created);
});

// --- Subjects / levels / topics ---
router.get("/subjects", async (_req, res) => {
  const payload = await cacheGetOrSet(CACHE_KEY.adminSubjects, CACHE_TTL_MS.catalog, async () => {
    const list = await prisma.subject.findMany({
      orderBy: { name: "asc" },
      include: {
        area: { select: { id: true, name: true, code: true } },
        classSubjects: {
          include: {
            schoolClass: {
              select: { id: true, name: true, grade: true },
            },
          },
        },
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
        chapters: {
          orderBy: { sortOrder: "asc" },
          include: {
            topic: { select: { id: true, name: true } },
            chapterTopics: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
    });
    return list.map((subject) => {
      const topicRows = subject.levels.flatMap((lvl) =>
        lvl.levelTopicParticipations.map((part) => ({
          id: part.topic.id,
          name: part.topic.name,
          levelId: lvl.id as string | null,
        }))
      );
      for (const ch of subject.chapters) {
        topicRows.push({
          id: ch.topic.id,
          name: ch.topic.name,
          levelId: null,
        });
      }
      const seen = new Set<string>();
      const topics = topicRows.filter((t) => {
        const key = `${t.id}:${t.levelId ?? "none"}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        ...subject,
        chapters: subject.chapters.map((ch) => ({
          id: ch.topic.id,
          name: ch.topic.name,
          sortOrder: ch.sortOrder,
          topics: ch.chapterTopics.map((t) => ({ id: t.id, name: t.name, sortOrder: t.sortOrder })),
        })),
        topics,
      };
    });
  });
  res.json(payload);
});

router.get("/topics", async (_req, res) => {
  const topics = await cacheGetOrSet(CACHE_KEY.adminTopics, CACHE_TTL_MS.catalog, () =>
    prisma.topic.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    })
  );
  res.json(topics);
});

/** Skill topics with mastery lesson status (for admin editor). */
router.get("/topic-lessons", async (_req, res) => {
  const topics = await prisma.topic.findMany({
    orderBy: { name: "asc" },
    include: {
      lesson: { select: { title: true, body: true, updatedAt: true } },
      levelTopicParticipations: {
        include: {
          level: { include: { subject: { select: { name: true } } } },
        },
      },
      _count: { select: { questions: true } },
    },
  });
  res.json(
    topics.map((t) => ({
      id: t.id,
      name: t.name,
      questionCount: t._count.questions,
      lesson: t.lesson,
      usedIn: t.levelTopicParticipations.map((p) => ({
        levelId: p.levelId,
        levelName: p.level.name,
        subjectName: p.level.subject.name,
      })),
    }))
  );
});

router.get("/topics/:topicId/lesson", async (req, res) => {
  const topicId = req.params.topicId;
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { lesson: true },
  });
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  res.json({
    topicId: topic.id,
    topicName: topic.name,
    lesson: topic.lesson,
  });
});

router.put("/topics/:topicId/lesson", async (req, res) => {
  const topicId = req.params.topicId;
  const schema = z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(20_000),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) return res.status(404).json({ error: "Topic not found" });

  const lesson = await prisma.topicLesson.upsert({
    where: { topicId },
    create: {
      topicId,
      title: p.data.title.trim(),
      body: p.data.body.trim(),
    },
    update: {
      title: p.data.title.trim(),
      body: p.data.body.trim(),
    },
  });
  res.json({
    topicId,
    topicName: topic.name,
    lesson,
  });
});

router.delete("/topics/:topicId/lesson", async (req, res) => {
  const topicId = req.params.topicId;
  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  await prisma.topicLesson.deleteMany({ where: { topicId } });
  res.json({ ok: true });
});

router.post("/subjects", async (req, res) => {
  const schema = z.object({
    name: z.string(),
    code: z.string().optional(),
    areaId: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  res.json(
    await prisma.subject.create({
      data: {
        name: p.data.name.trim(),
        code: p.data.code?.trim() || undefined,
        areaId: p.data.areaId || undefined,
      },
    })
  );
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
  if (!normalizedName) return res.status(400).json({ error: "Name required" });

  // Parallelize the level check and the duplicate-by-name lookup â€” both are
  // independent reads, and on remote DBs the round-trip cost dominates.
  const [lvl, duplicateByName] = await Promise.all([
    p.data.levelId
      ? prisma.level.findFirst({ where: { id: p.data.levelId, subjectId } })
      : Promise.resolve(null),
    prisma.topic.findFirst({
      where: { name: { equals: normalizedName, mode: "insensitive" } },
    }),
  ]);
  if (p.data.levelId && !lvl)
    return res.status(400).json({ error: "levelId must belong to this subject" });

  const t = duplicateByName
    ? duplicateByName
    : await prisma.topic.create({ data: { name: normalizedName } });
  if (p.data.levelId) {
    await prisma.levelTopicParticipation.upsert({
      where: { levelId_topicId: { levelId: p.data.levelId, topicId: t.id } },
      update: {},
      create: {
        levelId: p.data.levelId,
        topicId: t.id,
        quota: null,
        sortOrder: 999,
      },
    });
  } else {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { testMode: true, chapters: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 } },
    });
    if (subject?.testMode === "CHAPTER") {
      const nextOrder = (subject.chapters[0]?.sortOrder ?? -1) + 1;
      await prisma.subjectChapter.upsert({
        where: { subjectId_topicId: { subjectId, topicId: t.id } },
        update: {},
        create: { subjectId, topicId: t.id, sortOrder: nextOrder },
      });
    }
  }
  res.json(t);
});

router.post("/subjects/:subjectId/chapters/:topicId/topics", async (req, res) => {
  const { subjectId, topicId } = req.params;
  const schema = z.object({ name: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const name = p.data.name.trim();
  if (!name) return res.status(400).json({ error: "Name required" });

  const chapter = await prisma.subjectChapter.findUnique({
    where: { subjectId_topicId: { subjectId, topicId } },
    include: { chapterTopics: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 } },
  });
  if (!chapter) return res.status(404).json({ error: "Chapter not found on this branch" });

  const duplicate = await prisma.chapterTopic.findFirst({
    where: { subjectChapterId: chapter.id, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) return res.status(400).json({ error: "This chapter already has that topic" });

  const created = await prisma.chapterTopic.create({
    data: {
      subjectChapterId: chapter.id,
      name,
      sortOrder: (chapter.chapterTopics[0]?.sortOrder ?? -1) + 1,
    },
  });
  res.json(created);
});

router.patch("/chapter-topics/:id", async (req, res) => {
  const schema = z.object({ name: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const name = p.data.name.trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  const existing = await prisma.chapterTopic.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Topic not found" });
  const duplicate = await prisma.chapterTopic.findFirst({
    where: {
      subjectChapterId: existing.subjectChapterId,
      name: { equals: name, mode: "insensitive" },
      id: { not: existing.id },
    },
  });
  if (duplicate) return res.status(400).json({ error: "This chapter already has that topic" });
  const updated = await prisma.chapterTopic.update({ where: { id: existing.id }, data: { name } });
  res.json(updated);
});

router.delete("/chapter-topics/:id", async (req, res) => {
  const existing = await prisma.chapterTopic.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { questions: true } } },
  });
  if (!existing) return res.status(404).json({ error: "Topic not found" });
  if (existing._count.questions > 0) {
    return res.status(400).json({ error: "Delete the questions in this topic first" });
  }
  await prisma.chapterTopic.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

router.delete("/subjects/:subjectId/chapters/:topicId", async (req, res) => {
  const { subjectId, topicId } = req.params;
  try {
    await prisma.subjectChapter.delete({
      where: { subjectId_topicId: { subjectId, topicId } },
    });
  } catch {
    return res.status(404).json({ error: "Chapter not found on this branch" });
  }
  res.json({ ok: true });
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

router.patch("/subjects/:subjectId", async (req, res) => {
  const subjectId = req.params.subjectId;
  const schema = z.object({
    name: z.string().optional(),
    code: z.string().nullable().optional(),
    areaId: z.string().nullable().optional(),
    testMode: subjectTestModeSchema.optional(),
    chapterTestQuestionCount: z.number().int().positive().max(100).optional(),
    chapterWeightByBank: z.boolean().optional(),
    chapterNegativeMarking: z.boolean().optional(),
    chapterWrongPenalty: z.number().finite().min(0).max(1).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const existing = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!existing) return res.status(404).json({ error: "Subject not found" });

  const nextName = p.data.name?.trim();
  if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateSubject = await prisma.subject.findFirst({
      where: {
        name: { equals: nextName, mode: "insensitive" },
        id: { not: subjectId },
      },
    });
    if (duplicateSubject) return res.status(400).json({ error: "Subject name already exists" });
  }

  const nextCodeRaw = p.data.code;
  const nextCode =
    nextCodeRaw === undefined ? undefined : nextCodeRaw === null ? null : nextCodeRaw.trim() || null;
  const s = await prisma.subject.update({
    where: { id: subjectId },
    data: {
      ...(p.data.name !== undefined ? { name: nextName } : {}),
      ...(p.data.code !== undefined ? { code: nextCode } : {}),
      ...(p.data.areaId !== undefined ? { areaId: p.data.areaId } : {}),
      ...(p.data.testMode !== undefined ? { testMode: p.data.testMode } : {}),
      ...(p.data.chapterTestQuestionCount !== undefined
        ? { chapterTestQuestionCount: p.data.chapterTestQuestionCount }
        : {}),
      ...(p.data.chapterWeightByBank !== undefined ? { chapterWeightByBank: p.data.chapterWeightByBank } : {}),
      ...(p.data.chapterNegativeMarking !== undefined
        ? { chapterNegativeMarking: p.data.chapterNegativeMarking }
        : {}),
      ...(p.data.chapterWrongPenalty !== undefined ? { chapterWrongPenalty: p.data.chapterWrongPenalty } : {}),
    },
  });
  res.json(s);
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
  const nextName = p.data.name?.trim();
  if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateTopic = await prisma.topic.findFirst({
      where: {
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
router.post("/question-images", (req, res, next) => {
  imageUpload.single("file")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
      return;
    }
    next();
  });
}, (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  res.json({ url: `/uploads/questions/${req.file.filename}` });
});

function questionListWhere(query: { topicId?: string; levelId?: string; subjectId?: string; chapterTopicId?: string }) {
  const levelRaw = query.levelId;
  const noLevel = levelRaw === "none" || levelRaw === "null";
  const levelId = parseOptionalLevelId(levelRaw);
  const folder = query.chapterTopicId?.trim();
  const untagged = folder === "none" || folder === "null";
  return {
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(noLevel ? { levelId: null } : levelId ? { levelId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(untagged ? { chapterTopicId: null } : folder ? { chapterTopicId: folder } : {}),
  };
}

router.get("/questions/counts", async (req, res) => {
  const subjectId = req.query.subjectId as string | undefined;
  const levelRaw = typeof req.query.levelId === "string" ? req.query.levelId : undefined;
  if (!subjectId) return res.status(400).json({ error: "subjectId required" });
  const grouped = await prisma.question.groupBy({
    by: ["topicId", "chapterTopicId"],
    where: questionListWhere({ subjectId, levelId: levelRaw }),
    _count: { _all: true },
  });
  res.json(
    grouped.map((row) => ({
      topicId: row.topicId,
      chapterTopicId: row.chapterTopicId,
      count: row._count._all,
    }))
  );
});

router.get("/questions", async (req, res) => {
  const topicId = req.query.topicId as string | undefined;
  const levelRaw = typeof req.query.levelId === "string" ? req.query.levelId : undefined;
  const subjectId = req.query.subjectId as string | undefined;
  const chapterTopicId = typeof req.query.chapterTopicId === "string" ? req.query.chapterTopicId : undefined;
  const where = questionListWhere({ topicId, levelId: levelRaw, subjectId, chapterTopicId });
  const list = await prisma.question.findMany({
    where,
    take: 5000,
    orderBy: { createdAt: "asc" },
    include: { topic: true, level: true, subject: true },
  });
  res.json(list);
});

router.post("/questions", async (req, res) => {
  const schema = z.object({
    subjectId: z.string(),
    levelId: z.string().optional(),
    topicId: z.string(),
    chapterTopicId: z.string().nullable().optional(),
    stem: z.string(),
    type: z.enum(["MCQ", "MCQ2", "NUMERIC"]).optional(),
    optionA: z.string().optional(),
    optionB: z.string().optional(),
    optionC: z.string().optional(),
    optionD: z.string().optional(),
    correctOption: z.number().int().min(0).max(3).optional(),
    correctNumeric: z.number().finite().nullable().optional(),
    numericTolerance: z.number().finite().min(0).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    stemImageUrl: stemImageUrlSchema,
    optionImageA: stemImageUrlSchema,
    optionImageB: stemImageUrlSchema,
    optionImageC: stemImageUrlSchema,
    optionImageD: stemImageUrlSchema,
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const placement = await resolveQuestionPlacement(
    p.data.subjectId,
    p.data.topicId,
    parseOptionalLevelId(p.data.levelId),
    p.data.chapterTopicId
  );
  if (!placement.ok) return res.status(placement.status).json({ error: placement.error });
  const normalized = normalizeQuestionFields(p.data);
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });
  const hash = questionContentHash(p.data.topicId, normalized.fields.stem, questionAnswerKey(normalized.fields));
  const dup = await prisma.question.findUnique({ where: { contentHash: hash } });
  if (dup) {
    res.status(409).json({ error: "Duplicate question", id: dup.id });
    return;
  }
  const q = await prisma.question.create({
    data: {
      subjectId: placement.subjectId,
      levelId: placement.levelId,
      topicId: placement.topicId,
      chapterTopicId: placement.chapterTopicId,
      ...normalized.fields,
      stemImageUrl: p.data.stemImageUrl || null,
      optionImageA: p.data.optionImageA || null,
      optionImageB: p.data.optionImageB || null,
      optionImageC: p.data.optionImageC || null,
      optionImageD: p.data.optionImageD || null,
      contentHash: hash,
      createdById: req.user!.sub,
      difficulty: p.data.difficulty ?? "MEDIUM",
    },
  });
  res.json(q);
});

router.get("/question-reports", async (req, res) => {
  const statusRaw = typeof req.query.status === "string" ? req.query.status : "OPEN";
  const status = statusRaw === "RESOLVED" || statusRaw === "DISMISSED" ? statusRaw : "OPEN";
  const rows = await prisma.questionReport.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      student: { select: { fullName: true } },
      test: {
        select: {
          subject: { select: { name: true } },
          level: { select: { name: true } },
        },
      },
      question: {
        select: {
          id: true,
          type: true,
          stem: true,
          stemImageUrl: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          optionImageA: true,
          optionImageB: true,
          optionImageC: true,
          optionImageD: true,
          correctOption: true,
          correctNumeric: true,
          numericTolerance: true,
          difficulty: true,
          topic: { select: { name: true } },
        },
      },
    },
  });
  res.json(
    rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt,
      studentName: row.student.fullName,
      subjectName: row.test.subject.name,
      levelName: row.test.level?.name ?? null,
      question: {
        id: row.question.id,
        type: row.question.type,
        stem: row.question.stem,
        stemImageUrl: row.question.stemImageUrl,
        optionA: row.question.optionA,
        optionB: row.question.optionB,
        optionC: row.question.optionC,
        optionD: row.question.optionD,
        optionImageA: row.question.optionImageA,
        optionImageB: row.question.optionImageB,
        optionImageC: row.question.optionImageC,
        optionImageD: row.question.optionImageD,
        correctOption: row.question.correctOption,
        correctNumeric: row.question.correctNumeric,
        numericTolerance: row.question.numericTolerance,
        difficulty: row.question.difficulty,
        topicName: row.question.topic.name,
      },
    }))
  );
});

router.post("/question-reports/close", async (req, res) => {
  const parsed = z
    .object({
      questionId: z.string().min(1),
      status: z.enum(["RESOLVED", "DISMISSED"]),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid report update" });
  const result = await prisma.questionReport.updateMany({
    where: { questionId: parsed.data.questionId, status: "OPEN" },
    data: {
      status: parsed.data.status,
      resolvedAt: new Date(),
      resolvedById: req.user!.sub,
    },
  });
  res.json({ ok: true, updated: result.count });
});

router.delete("/questions/:id", async (req, res) => {
  await prisma.question.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.patch("/questions/:id", async (req, res) => {
  const schema = z.object({
    stem: z.string().optional(),
    type: z.enum(["MCQ", "MCQ2", "NUMERIC"]).optional(),
    optionA: z.string().optional(),
    optionB: z.string().optional(),
    optionC: z.string().optional(),
    optionD: z.string().optional(),
    correctOption: z.number().int().min(0).max(3).optional(),
    correctNumeric: z.number().finite().nullable().optional(),
    numericTolerance: z.number().finite().min(0).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    stemImageUrl: stemImageUrlSchema,
    optionImageA: stemImageUrlSchema,
    optionImageB: stemImageUrlSchema,
    optionImageC: stemImageUrlSchema,
    optionImageD: stemImageUrlSchema,
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Question not found" });

  const normalized = normalizeQuestionFields({
    type: p.data.type ?? existing.type,
    stem: p.data.stem ?? existing.stem,
    optionA: p.data.optionA ?? existing.optionA,
    optionB: p.data.optionB ?? existing.optionB,
    optionC: p.data.optionC ?? existing.optionC,
    optionD: p.data.optionD ?? existing.optionD,
    correctOption: p.data.correctOption ?? existing.correctOption,
    correctNumeric: p.data.correctNumeric !== undefined ? p.data.correctNumeric : existing.correctNumeric,
    numericTolerance: p.data.numericTolerance ?? existing.numericTolerance,
  });
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });

  const nextHash = questionContentHash(existing.topicId, normalized.fields.stem, questionAnswerKey(normalized.fields));
  const dup = await prisma.question.findUnique({ where: { contentHash: nextHash } });
  if (dup && dup.id !== existing.id) return res.status(409).json({ error: "Duplicate question", id: dup.id });

  const q = await prisma.question.update({
    where: { id: existing.id },
    data: {
      ...normalized.fields,
      ...(p.data.difficulty !== undefined ? { difficulty: p.data.difficulty } : {}),
      ...(p.data.stemImageUrl !== undefined ? { stemImageUrl: p.data.stemImageUrl || null } : {}),
      ...(p.data.optionImageA !== undefined ? { optionImageA: p.data.optionImageA || null } : {}),
      ...(p.data.optionImageB !== undefined ? { optionImageB: p.data.optionImageB || null } : {}),
      ...(p.data.optionImageC !== undefined ? { optionImageC: p.data.optionImageC || null } : {}),
      ...(p.data.optionImageD !== undefined ? { optionImageD: p.data.optionImageD || null } : {}),
      contentHash: nextHash,
    },
  });
  res.json(q);
});

// --- Word import ---
router.post("/questions/import", withSingleUpload("file"), async (req, res) => {
  const schema = z.object({
    subjectId: z.string(),
    levelId: z.string().optional(),
    topicId: z.string(),
    chapterTopicId: z.string().optional(),
    difficulty: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: p.success ? "file required" : p.error.flatten() });
    return;
  }

  const placement = await resolveQuestionPlacement(
    p.data.subjectId,
    p.data.topicId,
    parseOptionalLevelId(p.data.levelId),
    p.data.chapterTopicId
  );
  if (!placement.ok) {
    fs.unlink(req.file.path, () => {});
    return res.status(placement.status).json({ error: placement.error });
  }

  const originalname = req.file.originalname;
  if (/\.doc$/i.test(originalname) && !/\.docx$/i.test(originalname)) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: "Upload a .docx file (the older .doc format is not supported)." });
    return;
  }
  const buf = fs.readFileSync(req.file.path);
  fs.unlink(req.file.path, () => {});

  let text: string;
  try {
    text = await extractTextFromDocx(buf);
  } catch (e) {
    res.status(400).json({ error: "Could not read document" });
    return;
  }

  const parsedDoc = parseQuestionDocument(text);
  if (!parsedDoc.questions.length) {
    res.status(400).json({
      error:
        parsedDoc.warnings[0] ??
        "No questions found in the Word file. Use stems like 1. or Q1., options A–D or (1)–(4), and Answer: B or an Answer Key at the end.",
      warnings: parsedDoc.warnings,
    });
    return;
  }
  const modeRaw = String(req.body.mode ?? "insert").toLowerCase();
  const mode = modeRaw === "sync" || modeRaw === "replace" ? modeRaw : "insert";
  const result = await persistParsedQuestions(prisma, {
    parsed: parsedDoc.questions,
    subjectId: placement.subjectId,
    levelId: placement.levelId,
    topicId: placement.topicId,
    chapterTopicId: placement.chapterTopicId,
    mode,
    defaultDifficulty: parseDifficulty(p.data.difficulty),
    createdById: req.user!.sub,
    filename: originalname,
    recordBatch: true,
  });
  res.json({
    ...result,
    warnings: parsedDoc.warnings,
    errors: [...parsedDoc.warnings, ...(result.errors ?? [])],
  });
});

// --- Paste-text import ---
router.post("/questions/import-text", async (req, res) => {
  const schema = z.object({
    subjectId: z.string(),
    levelId: z.string().optional(),
    topicId: z.string(),
    chapterTopicId: z.string().optional(),
    text: z.string(),
    mode: z.enum(["insert", "sync", "replace"]).optional(),
    difficulty: z.string().optional(),
    dryRun: z.boolean().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const parsedDoc = parseQuestionDocument(p.data.text);
  const parsed = parsedDoc.questions;
  if (p.data.dryRun) {
    res.json({
      dryRun: true,
      parseCount: parsed.length,
      questions: parsed,
      warnings: parsedDoc.warnings,
    });
    return;
  }

  const placement = await resolveQuestionPlacement(
    p.data.subjectId,
    p.data.topicId,
    parseOptionalLevelId(p.data.levelId),
    p.data.chapterTopicId
  );
  if (!placement.ok) return res.status(placement.status).json({ error: placement.error });

  const result = await persistParsedQuestions(prisma, {
    parsed,
    subjectId: placement.subjectId,
    levelId: placement.levelId,
    topicId: placement.topicId,
    chapterTopicId: placement.chapterTopicId,
    mode: p.data.mode ?? "insert",
    defaultDifficulty: parseDifficulty(p.data.difficulty),
    createdById: req.user!.sub,
    filename: "paste-import",
    recordBatch: true,
  });
  res.json(result);
});

// --- Excel/CSV import ---
router.post("/questions/import-sheet", withSheetUpload("file"), async (req, res) => {
  req.setTimeout(10 * 60 * 1000);
  res.setTimeout(10 * 60 * 1000);
  const schema = z.object({
    subjectId: z.string(),
    levelId: z.string().optional(),
    topicId: z.string(),
    chapterTopicId: z.string().optional(),
    mode: z.enum(["insert", "sync", "replace"]).optional(),
    difficulty: z.string().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: p.success ? "file required" : p.error.flatten() });
    return;
  }
  const placement = await resolveQuestionPlacement(
    p.data.subjectId,
    p.data.topicId,
    parseOptionalLevelId(p.data.levelId),
    p.data.chapterTopicId
  );
  if (!placement.ok) {
    fs.unlink(req.file.path, () => {});
    return res.status(placement.status).json({ error: placement.error });
  }
  const buf = fs.readFileSync(req.file.path);
  fs.unlink(req.file.path, () => {});
  let parsed: ParsedQuestion[];
  let imagesAttached = 0;
  try {
    const sheet = await parseQuestionSheetWithImages(buf, questionsUploadDir);
    parsed = sheet.questions;
    imagesAttached = sheet.imagesAttached;
  } catch (e) {
    res.status(400).json({ error: String(e) });
    return;
  }

  const result = await persistParsedQuestions(prisma, {
    parsed,
    subjectId: placement.subjectId,
    levelId: placement.levelId,
    topicId: placement.topicId,
    chapterTopicId: placement.chapterTopicId,
    mode: p.data.mode ?? "insert",
    defaultDifficulty: parseDifficulty(p.data.difficulty),
    createdById: req.user!.sub,
  });
  res.json({ ...result, imagesAttached });
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
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const wantAll = req.query.all === "1" || req.query.page === undefined;
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "50"), 10) || 50));

  const where = {
    ...(classId ? { classId } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { user: { studentLoginId: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const take = wantAll ? 5000 : pageSize;
  const skip = wantAll ? 0 : (page - 1) * pageSize;

  const [total, list] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: {
        schoolClass: true,
        section: true,
        user: { select: { studentLoginId: true, passwordPlain: true } },
      },
      orderBy: [{ schoolClass: { name: "asc" } }, { section: { name: "asc" } }, { fullName: "asc" }],
      skip,
      take,
    }),
  ]);

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
      password: s.user.passwordPlain ?? "",
    })),
    total,
    page: wantAll ? 1 : page,
    pageSize: wantAll ? list.length : pageSize,
  });
});

const resetPasswordSchema = z.object({
  password: z.string().min(4).max(32),
});

router.patch("/students/:studentId", async (req, res) => {
  const p = updateStudentNameSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const studentId = req.params.studentId;
  const existing = await prisma.student.findUnique({ where: { id: studentId } });
  if (!existing) return res.status(404).json({ error: "Student not found" });

  const student = await prisma.student.update({
    where: { id: studentId },
    data: { fullName: p.data.fullName },
    include: {
      schoolClass: true,
      section: true,
      user: { select: { studentLoginId: true } },
    },
  });

  res.json({
    id: student.id,
    fullName: student.fullName,
    classId: student.classId,
    sectionId: student.sectionId,
    className: student.schoolClass.name,
    classLabel: classLabelForDisplay(student.schoolClass),
    sectionName: student.section.name,
    username: student.user.studentLoginId ?? "",
  });
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
    data: { passwordHash, passwordPlain: p.data.password },
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
      passwordPlain: p.data.password,
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

router.get("/teachers", async (_req, res) => {
  const teachers = await prisma.teacher.findMany({
    include: {
      user: { select: { email: true } },
    },
    orderBy: { fullName: "asc" },
  });
  res.json({
    teachers: teachers.map((t) => ({
      id: t.id,
      userId: t.userId,
      fullName: t.fullName,
      email: t.user.email ?? "",
    })),
  });
});

router.patch("/teachers/:teacherId/reset-password", async (req, res) => {
  const p = resetPasswordSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const teacherId = req.params.teacherId;
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: true },
  });
  if (!teacher) return res.status(404).json({ error: "Teacher not found" });
  const passwordHash = await bcrypt.hash(p.data.password, 10);
  await prisma.user.update({
    where: { id: teacher.userId },
    data: { passwordHash },
  });
  res.json({
    password: p.data.password,
    teacher: {
      id: teacher.id,
      fullName: teacher.fullName,
      email: teacher.user.email,
    },
  });
});

router.delete("/teachers/:teacherId", async (req, res) => {
  const teacherId = req.params.teacherId;
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) return res.status(404).json({ error: "Teacher not found" });
  await prisma.user.delete({ where: { id: teacher.userId } });
  res.json({ ok: true });
});

// --- Office staff (ADMIN only; not in OFFICE allowlist) ---

router.post("/office-users", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(1),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const email = p.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });
  try {
    const passwordHash = await bcrypt.hash(p.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "OFFICE",
        office: { create: { fullName: p.data.fullName.trim() } },
      },
      include: { office: true },
    });
    res.json({ id: user.office!.id });
  } catch (err) {
    console.error("create office user failed", err);
    res.status(500).json({
      error: "Could not create office user. Ensure the Office DB migration has been applied.",
    });
  }
});

router.get("/office-users", async (_req, res) => {
  try {
    const rows = await prisma.office.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { fullName: "asc" },
    });
    res.json({
      officeUsers: rows.map((o) => ({
        id: o.id,
        userId: o.userId,
        fullName: o.fullName,
        email: o.user.email ?? "",
      })),
    });
  } catch (err) {
    console.error("list office users failed", err);
    res.status(500).json({
      error: "Could not load office users. Ensure the Office DB migration has been applied.",
    });
  }
});

router.patch("/office-users/:officeId/reset-password", async (req, res) => {
  const p = resetPasswordSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const officeId = req.params.officeId;
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    include: { user: true },
  });
  if (!office) return res.status(404).json({ error: "Office user not found" });
  const passwordHash = await bcrypt.hash(p.data.password, 10);
  await prisma.user.update({
    where: { id: office.userId },
    data: { passwordHash },
  });
  res.json({
    password: p.data.password,
    officeUser: {
      id: office.id,
      fullName: office.fullName,
      email: office.user.email,
    },
  });
});

router.delete("/office-users/:officeId", async (req, res) => {
  const officeId = req.params.officeId;
  const office = await prisma.office.findUnique({ where: { id: officeId } });
  if (!office) return res.status(404).json({ error: "Office user not found" });
  await prisma.user.delete({ where: { id: office.userId } });
  res.json({ ok: true });
});

function deleteUploadedFileIfLocal(url: string | null | undefined) {
  if (!url || !url.startsWith("/uploads/")) return;
  const rel = url.replace(/^\/uploads\/?/, "");
  const full = path.join(uploadDir, rel);
  if (!full.startsWith(path.resolve(uploadDir))) return;
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

const schoolBrandingNameSchema = z.object({
  schoolName: z.string().trim().min(1, "School name is required").max(200),
});

router.get("/school-branding", async (_req, res) => {
  try {
    const branding = await getSchoolBranding(prisma);
    res.json(branding);
  } catch (e) {
    sendBrandingError(res, e);
  }
});

router.patch("/school-branding", async (req, res) => {
  const p = schoolBrandingNameSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  try {
    const branding = await updateSchoolName(prisma, p.data.schoolName);
    res.json(branding);
  } catch (e) {
    sendBrandingError(res, e);
  }
});

router.post("/school-logo", (req, res, next) => {
  schoolLogoUpload.single("file")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
      return;
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  try {
    const current = await getSchoolBranding(prisma);
    deleteUploadedFileIfLocal(current.logoUrl);

    const logoUrl = `/uploads/school/${req.file.filename}`;
    const branding = await updateSchoolLogo(prisma, logoUrl);
    res.json(branding);
  } catch (e) {
    sendBrandingError(res, e);
  }
});

router.delete("/school-logo", async (_req, res) => {
  try {
    const current = await getSchoolBranding(prisma);
    deleteUploadedFileIfLocal(current.logoUrl);
    const branding = await updateSchoolLogo(prisma, null);
    res.json(branding);
  } catch (e) {
    sendBrandingError(res, e);
  }
});

export default router;
