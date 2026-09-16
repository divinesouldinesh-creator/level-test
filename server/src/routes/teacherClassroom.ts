import { Router } from "express";
import { ClassroomAssessmentKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const ORAL_SCOPE_KEY = "oral";

export function dateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function scopeKeyFor(kind: ClassroomAssessmentKind, testedLevelId?: string | null): string {
  if (kind === "ORAL") return ORAL_SCOPE_KEY;
  return testedLevelId ?? "";
}

export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type LastMarks = {
  date: string;
  score: number;
  maxScore: number;
  percentage: number;
  levelId: string | null;
  levelName: string | null;
};

type LastOral = {
  date: string;
  levelId: string;
  levelName: string;
  levelOrder: number;
};

export async function lastClassroomByStudent(params: {
  studentIds: string[];
  subjectId: string;
  kind: ClassroomAssessmentKind;
  beforeDate: Date;
}): Promise<{ marks: Map<string, LastMarks>; oral: Map<string, LastOral> }> {
  const marks = new Map<string, LastMarks>();
  const oral = new Map<string, LastOral>();
  if (params.studentIds.length === 0) return { marks, oral };

  try {
    const entries = await prisma.classroomAssessmentEntry.findMany({
      where: {
        absent: false,
        studentId: { in: params.studentIds },
        session: {
          subjectId: params.subjectId,
          kind: params.kind,
          date: { lt: params.beforeDate },
        },
      },
      include: {
        session: { select: { date: true, testedLevelId: true, testedLevel: { select: { name: true } } } },
        judgedLevel: { select: { id: true, name: true, order: true } },
      },
    });
    entries.sort((a, b) => b.session.date.getTime() - a.session.date.getTime());

    for (const e of entries) {
      if (params.kind === "MARKS") {
        if (marks.has(e.studentId)) continue;
        if (e.score == null || e.maxScore == null || e.percentage == null) continue;
        marks.set(e.studentId, {
          date: ymd(e.session.date),
          score: e.score,
          maxScore: e.maxScore,
          percentage: e.percentage,
          levelId: e.session.testedLevelId,
          levelName: e.session.testedLevel?.name ?? null,
        });
      } else {
        if (oral.has(e.studentId)) continue;
        if (!e.judgedLevel) continue;
        oral.set(e.studentId, {
          date: ymd(e.session.date),
          levelId: e.judgedLevel.id,
          levelName: e.judgedLevel.name,
          levelOrder: e.judgedLevel.order,
        });
      }
    }
  } catch {
    return { marks, oral };
  }

  return { marks, oral };
}

export async function classroomHistoryForStudent(studentId: string, subjectId?: string) {
  const entries = await prisma.classroomAssessmentEntry.findMany({
    where: {
      studentId,
      ...(subjectId ? { session: { subjectId } } : {}),
    },
    include: {
      judgedLevel: { select: { id: true, name: true, order: true } },
      session: {
        select: {
          id: true,
          kind: true,
          date: true,
          subject: { select: { id: true, name: true, code: true } },
          testedLevel: { select: { id: true, name: true, order: true } },
        },
      },
    },
    orderBy: { session: { date: "desc" } },
    take: 24,
  });

  return entries.map((e) => ({
    entryId: e.id,
    sessionId: e.session.id,
    kind: e.session.kind,
    date: ymd(e.session.date),
    subjectId: e.session.subject.id,
    subjectName: e.session.subject.name,
    subjectCode: e.session.subject.code,
    absent: e.absent,
    score: e.score,
    maxScore: e.maxScore,
    percentage: e.percentage,
    testedLevelId: e.session.testedLevel?.id ?? null,
    testedLevelName: e.session.testedLevel?.name ?? null,
    judgedLevelId: e.judgedLevel?.id ?? null,
    judgedLevelName: e.judgedLevel?.name ?? null,
    judgedLevelOrder: e.judgedLevel?.order ?? null,
    remark: e.remark,
  }));
}

function kindForSubject(subject: { name: string; code: string | null }): ClassroomAssessmentKind {
  const code = (subject.code ?? "").toUpperCase();
  if (code === "SPEAK" || subject.name.trim().toLowerCase() === "speaking") return "ORAL";
  return "MARKS";
}

const router = Router();

const kindSchema = z.nativeEnum(ClassroomAssessmentKind);

function parseKind(value: unknown): ClassroomAssessmentKind | null {
  const p = kindSchema.safeParse(value);
  return p.success ? p.data : null;
}

router.get("/classroom-assessments", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : "";
  const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : "";
  const dateInput = typeof req.query.date === "string" ? req.query.date : "";
  const kind = parseKind(req.query.kind);
  const testedLevelId = typeof req.query.testedLevelId === "string" ? req.query.testedLevelId : "";

  if (!classId || !sectionId || !subjectId || !dateInput || !kind) {
    res.status(400).json({ error: "classId, sectionId, subjectId, kind and date are required" });
    return;
  }
  const date = dateOnly(dateInput);
  if (!date) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  if (kind === "MARKS" && !testedLevelId) {
    res.status(400).json({ error: "testedLevelId is required for marks tests" });
    return;
  }

  const [section, subject] = await Promise.all([
    prisma.section.findFirst({ where: { id: sectionId, classId } }),
    prisma.subject.findUnique({
      where: { id: subjectId },
      include: { levels: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true } } },
    }),
  ]);
  if (!section) {
    res.status(400).json({ error: "Invalid class and section" });
    return;
  }
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }
  if (kind === "MARKS" && !subject.levels.some((l) => l.id === testedLevelId)) {
    res.status(400).json({ error: "testedLevelId must belong to this subject" });
    return;
  }

  const scopeKey = scopeKeyFor(kind, testedLevelId || null);
  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    include: { user: { select: { studentLoginId: true } } },
    orderBy: { fullName: "asc" },
  });

  const session = await prisma.classroomAssessmentSession.findUnique({
    where: {
      classId_sectionId_subjectId_kind_date_scopeKey: {
        classId,
        sectionId,
        subjectId,
        kind,
        date,
        scopeKey,
      },
    },
    include: { entries: true },
  });

  const entryByStudent = new Map(session?.entries.map((e) => [e.studentId, e]) ?? []);
  const { marks: lastMarks, oral: lastOral } = await lastClassroomByStudent({
    studentIds: students.map((s) => s.id),
    subjectId,
    kind,
    beforeDate: date,
  });

  const roster = students.map((s) => {
    const e = entryByStudent.get(s.id);
    return {
      studentId: s.id,
      fullName: s.fullName,
      studentLoginId: s.user?.studentLoginId ?? null,
      absent: e?.absent ?? false,
      score: e?.score ?? null,
      maxScore: e?.maxScore ?? null,
      percentage: e?.percentage ?? null,
      judgedLevelId: e?.judgedLevelId ?? null,
      remark: e?.remark ?? "",
      lastMarks: lastMarks.get(s.id) ?? null,
      lastOral: lastOral.get(s.id) ?? null,
    };
  });

  const byLevel = subject.levels.map((l) => ({
    levelId: l.id,
    levelName: l.name,
    order: l.order,
    count: roster.filter((r) => !r.absent && r.judgedLevelId === l.id).length,
  }));

  res.json({
    classId,
    sectionId,
    subjectId,
    subjectName: subject.name,
    kind,
    date: dateInput,
    testedLevelId: kind === "MARKS" ? testedLevelId : null,
    notes: session?.notes ?? "",
    saved: Boolean(session),
    levels: subject.levels,
    students: roster,
    snapshot: {
      total: roster.length,
      savedCount: roster.filter((r) => {
        if (kind === "ORAL") return r.absent || Boolean(r.judgedLevelId);
        return r.absent || (r.score != null && r.maxScore != null);
      }).length,
      absent: roster.filter((r) => r.absent).length,
      byLevel,
    },
  });
});

router.get("/classroom-assessments/snapshot", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : "";
  const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : "";
  if (!classId || !sectionId || !subjectId) {
    res.status(400).json({ error: "classId, sectionId and subjectId are required" });
    return;
  }

  const [section, subject] = await Promise.all([
    prisma.section.findFirst({ where: { id: sectionId, classId } }),
    prisma.subject.findUnique({
      where: { id: subjectId },
      include: { levels: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true } } },
    }),
  ]);
  if (!section) {
    res.status(400).json({ error: "Invalid class and section" });
    return;
  }
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const kind = kindForSubject(subject);
  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    select: { id: true, fullName: true, user: { select: { studentLoginId: true } } },
    orderBy: { fullName: "asc" },
  });
  const emptyByLevel = subject.levels.map((l) => ({
    levelId: l.id,
    order: l.order,
    name: l.name,
    count: 0,
    students: [] as { studentId: string; fullName: string; studentLoginId: string | null; date: string }[],
  }));
  if (students.length === 0) {
    res.json({ kind, total: 0, assessed: 0, notAssessed: 0, byLevel: emptyByLevel });
    return;
  }

  const studentById = new Map(students.map((s) => [s.id, s]));
  const entries = await prisma.classroomAssessmentEntry.findMany({
    where: {
      absent: false,
      studentId: { in: students.map((s) => s.id) },
      session: { classId, sectionId, subjectId, kind },
    },
    include: {
      judgedLevel: { select: { id: true, name: true, order: true } },
      session: {
        select: {
          date: true,
          testedLevel: { select: { id: true, name: true, order: true } },
        },
      },
    },
    orderBy: { session: { date: "desc" } },
  });

  type Current = {
    studentId: string;
    fullName: string;
    studentLoginId: string | null;
    levelId: string;
    levelName: string;
    levelOrder: number;
    date: string;
  };
  const currentByStudent = new Map<string, Current>();
  for (const e of entries) {
    if (currentByStudent.has(e.studentId)) continue;
    const level = kind === "ORAL" ? e.judgedLevel : e.session.testedLevel;
    if (!level) continue;
    const student = studentById.get(e.studentId);
    if (!student) continue;
    currentByStudent.set(e.studentId, {
      studentId: student.id,
      fullName: student.fullName,
      studentLoginId: student.user.studentLoginId,
      levelId: level.id,
      levelName: level.name,
      levelOrder: level.order,
      date: ymd(e.session.date),
    });
  }

  const byLevel = subject.levels.map((l) => {
    const atLevel = [...currentByStudent.values()].filter((c) => c.levelId === l.id);
    return {
      levelId: l.id,
      order: l.order,
      name: l.name,
      count: atLevel.length,
      students: atLevel.map((c) => ({
        studentId: c.studentId,
        fullName: c.fullName,
        studentLoginId: c.studentLoginId,
        date: c.date,
      })),
    };
  });
  const assessed = currentByStudent.size;

  res.json({
    kind,
    total: students.length,
    assessed,
    notAssessed: students.length - assessed,
    byLevel,
  });
});

router.get("/classroom-assessments/dates", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : "";
  const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : "";
  if (!classId || !sectionId || !subjectId) {
    res.status(400).json({ error: "classId, sectionId and subjectId are required" });
    return;
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { name: true, code: true },
  });
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const kind = kindForSubject(subject);
  const sessions = await prisma.classroomAssessmentSession.findMany({
    where: { classId, sectionId, subjectId, kind },
    select: { date: true },
    orderBy: { date: "desc" },
  });
  const dates = [...new Set(sessions.map((s) => ymd(s.date)))];
  res.json({ dates, latest: dates[0] ?? null });
});

router.get("/classroom-assessments/records", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : "";
  const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : "";
  const dateInput = typeof req.query.date === "string" ? req.query.date : "";
  if (!classId || !sectionId || !subjectId || !dateInput) {
    res.status(400).json({ error: "classId, sectionId, subjectId and date are required" });
    return;
  }
  const date = dateOnly(dateInput);
  if (!date) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const [section, subject] = await Promise.all([
    prisma.section.findFirst({ where: { id: sectionId, classId } }),
    prisma.subject.findUnique({
      where: { id: subjectId },
      include: { levels: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true } } },
    }),
  ]);
  if (!section) {
    res.status(400).json({ error: "Invalid class and section" });
    return;
  }
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const kind = kindForSubject(subject);
  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    include: { user: { select: { studentLoginId: true } } },
    orderBy: { fullName: "asc" },
  });
  const sessions = await prisma.classroomAssessmentSession.findMany({
    where: { classId, sectionId, subjectId, kind, date },
    include: { entries: true },
    orderBy: { updatedAt: "desc" },
  });
  const session = sessions[0] ?? null;
  const entryByStudent = new Map(session?.entries.map((e) => [e.studentId, e]) ?? []);
  const { marks: lastMarks, oral: lastOral } = await lastClassroomByStudent({
    studentIds: students.map((s) => s.id),
    subjectId,
    kind,
    beforeDate: date,
  });

  const rows = students.map((s) => {
    const e = entryByStudent.get(s.id);
    const judged = e?.judgedLevelId
      ? subject.levels.find((l) => l.id === e.judgedLevelId)
      : undefined;
    const lastM = lastMarks.get(s.id) ?? null;
    const lastO = lastOral.get(s.id) ?? null;
    let movement: "Up" | "Down" | "Same" | null = null;
    if (e && !e.absent) {
      if (kind === "ORAL" && judged && lastO) {
        if (judged.order > lastO.levelOrder) movement = "Up";
        else if (judged.order < lastO.levelOrder) movement = "Down";
        else movement = "Same";
      }
      if (kind === "MARKS" && e.percentage != null && lastM) {
        if (e.percentage > lastM.percentage) movement = "Up";
        else if (e.percentage < lastM.percentage) movement = "Down";
        else movement = "Same";
      }
    }
    return {
      studentId: s.id,
      fullName: s.fullName,
      studentLoginId: s.user.studentLoginId,
      absent: e?.absent ?? false,
      recorded: Boolean(e),
      score: e?.score ?? null,
      maxScore: e?.maxScore ?? null,
      percentage: e?.percentage ?? null,
      judgedLevelId: judged?.id ?? null,
      judgedLevelName: judged?.name ?? null,
      judgedLevelOrder: judged?.order ?? null,
      lastMarks: lastM,
      lastOral: lastO,
      movement,
    };
  });

  const assessed = rows.filter((r) => r.recorded && !r.absent);
  const scored = assessed.filter((r) => r.percentage != null);
  const avg =
    scored.length > 0 ? scored.reduce((sum, r) => sum + (r.percentage as number), 0) / scored.length : null;
  const up = rows.filter((r) => r.movement === "Up").length;
  const down = rows.filter((r) => r.movement === "Down").length;
  const same = rows.filter((r) => r.movement === "Same").length;
  const byLevel = subject.levels.map((l) => ({
    order: l.order,
    name: l.name,
    count: assessed.filter((r) => r.judgedLevelId === l.id).length,
  }));

  res.json({
    kind,
    date: dateInput,
    saved: Boolean(session),
    subjectName: subject.name,
    students: rows,
    summary: {
      total: rows.length,
      absent: rows.filter((r) => r.recorded && r.absent).length,
      assessed: assessed.length,
      avg,
      up,
      down,
      same,
      byLevel,
    },
  });
});

router.get("/classroom-assessments/history", async (req, res) => {
  const studentId = typeof req.query.studentId === "string" ? req.query.studentId : "";
  const subjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : "";
  if (!studentId || !subjectId) {
    res.status(400).json({ error: "studentId and subjectId are required" });
    return;
  }
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, user: { select: { studentLoginId: true } } },
  });
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const items = await classroomHistoryForStudent(studentId, subjectId);
  res.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      studentLoginId: student.user.studentLoginId,
    },
    items,
  });
});

const saveSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  subjectId: z.string().min(1),
  kind: kindSchema,
  date: z.string().min(1),
  testedLevelId: z.string().optional(),
  notes: z.string().optional(),
  entries: z.array(
    z.object({
      studentId: z.string().min(1),
      absent: z.boolean().optional(),
      score: z.number().int().nonnegative().nullable().optional(),
      maxScore: z.number().int().positive().nullable().optional(),
      judgedLevelId: z.string().nullable().optional(),
      remark: z.string().optional(),
    })
  ),
});

router.put("/classroom-assessments", async (req, res) => {
  const p = saveSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const date = dateOnly(p.data.date);
  if (!date) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const { classId, sectionId, subjectId, kind } = p.data;
  const testedLevelId = p.data.testedLevelId?.trim() || null;

  if (kind === "MARKS" && !testedLevelId) {
    return res.status(400).json({ error: "testedLevelId is required for marks tests" });
  }
  if (kind === "ORAL" && testedLevelId) {
    return res.status(400).json({ error: "Oral assessments do not use a class-wide tested level" });
  }

  const [section, subject] = await Promise.all([
    prisma.section.findFirst({ where: { id: sectionId, classId } }),
    prisma.subject.findUnique({
      where: { id: subjectId },
      include: { levels: { select: { id: true } } },
    }),
  ]);
  if (!section) return res.status(400).json({ error: "Invalid class and section" });
  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const levelIds = new Set(subject.levels.map((l) => l.id));
  if (kind === "MARKS" && testedLevelId && !levelIds.has(testedLevelId)) {
    return res.status(400).json({ error: "testedLevelId must belong to this subject" });
  }

  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    select: { id: true },
  });
  const allowedIds = new Set(students.map((s) => s.id));
  const invalidId = p.data.entries.find((e) => !allowedIds.has(e.studentId));
  if (invalidId) {
    return res.status(400).json({ error: "All entries must belong to the selected class and section" });
  }

  const prepared = [];
  for (const e of p.data.entries) {
    const absent = Boolean(e.absent);
    const remark = e.remark?.trim() || null;
    if (absent) {
      prepared.push({
        studentId: e.studentId,
        absent: true,
        score: null as number | null,
        maxScore: null as number | null,
        percentage: null as number | null,
        judgedLevelId: null as string | null,
        remark,
      });
      continue;
    }
    if (kind === "MARKS") {
      const score = e.score;
      const maxScore = e.maxScore;
      if (score == null || maxScore == null) {
        return res.status(400).json({ error: "Each present student needs a score and max score" });
      }
      if (score > maxScore) {
        return res.status(400).json({ error: "Score cannot be greater than max score" });
      }
      prepared.push({
        studentId: e.studentId,
        absent: false,
        score,
        maxScore,
        percentage: maxScore ? (100 * score) / maxScore : 0,
        judgedLevelId: null,
        remark,
      });
    } else {
      const judgedLevelId = e.judgedLevelId?.trim() || null;
      if (!judgedLevelId) {
        return res.status(400).json({ error: "Tick a level for each present student" });
      }
      if (!levelIds.has(judgedLevelId)) {
        return res.status(400).json({ error: "Judged level must belong to this subject" });
      }
      prepared.push({
        studentId: e.studentId,
        absent: false,
        score: null,
        maxScore: null,
        percentage: null,
        judgedLevelId,
        remark,
      });
    }
  }

  const scopeKey = scopeKeyFor(kind, testedLevelId);
  const session = await prisma.classroomAssessmentSession.upsert({
    where: {
      classId_sectionId_subjectId_kind_date_scopeKey: {
        classId,
        sectionId,
        subjectId,
        kind,
        date,
        scopeKey,
      },
    },
    update: {
      notes: p.data.notes?.trim() || null,
      recordedById: req.user?.sub,
      testedLevelId: kind === "MARKS" ? testedLevelId : null,
    },
    create: {
      classId,
      sectionId,
      subjectId,
      kind,
      date,
      scopeKey,
      testedLevelId: kind === "MARKS" ? testedLevelId : null,
      notes: p.data.notes?.trim() || null,
      recordedById: req.user?.sub,
    },
  });

  await prisma.$transaction([
    prisma.classroomAssessmentEntry.deleteMany({ where: { sessionId: session.id } }),
    prisma.classroomAssessmentEntry.createMany({
      data: prepared.map((e) => ({
        sessionId: session.id,
        studentId: e.studentId,
        absent: e.absent,
        score: e.score,
        maxScore: e.maxScore,
        percentage: e.percentage,
        judgedLevelId: e.judgedLevelId,
        remark: e.remark,
      })),
    }),
  ]);

  res.json({ ok: true, sessionId: session.id, savedCount: prepared.length });
});

export default router;
