import { Router } from "express";
import { CareCallYesNo } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { istDayKey } from "../services/engagementCalendar.js";

const router = Router();

const yesNoZ = z.enum(["YES", "NO"]);

function serializeCall(c: {
  id: string;
  calledAt: Date;
  englishMirrorPractice: CareCallYesNo | null;
  heavyPhoneTv: CareCallYesNo | null;
}) {
  return {
    id: c.id,
    calledAt: c.calledAt.toISOString(),
    englishMirrorPractice: c.englishMirrorPractice,
    heavyPhoneTv: c.heavyPhoneTv,
  };
}

function monthKey(date: Date): string {
  return istDayKey(date).slice(0, 7);
}

router.get("/care-calls", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : "";
  if (!classId || !sectionId) {
    res.status(400).json({ error: "classId and sectionId are required" });
    return;
  }

  const section = await prisma.section.findFirst({ where: { id: sectionId, classId } });
  if (!section) {
    res.status(400).json({ error: "Invalid class and section" });
    return;
  }

  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    select: { id: true, fullName: true, user: { select: { studentLoginId: true } } },
    orderBy: { fullName: "asc" },
  });

  res.json({
    students: students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      studentLoginId: s.user.studentLoginId,
      englishMirrorPractice: null as CareCallYesNo | null,
      heavyPhoneTv: null as CareCallYesNo | null,
    })),
  });
});

router.get("/care-calls/months", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : "";
  if (!classId || !sectionId) {
    res.status(400).json({ error: "classId and sectionId are required" });
    return;
  }

  const section = await prisma.section.findFirst({ where: { id: sectionId, classId } });
  if (!section) {
    res.status(400).json({ error: "Invalid class and section" });
    return;
  }

  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    select: { id: true },
  });
  if (students.length === 0) {
    res.json({ months: [] });
    return;
  }

  const calls = await prisma.careCall.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
    select: { calledAt: true },
    orderBy: { calledAt: "desc" },
  });
  const months = [...new Set(calls.map((c) => monthKey(c.calledAt)))];
  res.json({ months });
});

router.get("/care-calls/records", async (req, res) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  const sectionId = typeof req.query.sectionId === "string" ? req.query.sectionId : "";
  const month = typeof req.query.month === "string" ? req.query.month : "";
  if (!classId || !sectionId || !month) {
    res.status(400).json({ error: "classId, sectionId and month are required" });
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month must be YYYY-MM" });
    return;
  }

  const section = await prisma.section.findFirst({ where: { id: sectionId, classId } });
  if (!section) {
    res.status(400).json({ error: "Invalid class and section" });
    return;
  }

  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    select: { id: true, fullName: true, user: { select: { studentLoginId: true } } },
    orderBy: { fullName: "asc" },
  });
  if (students.length === 0) {
    res.json({ month, students: [] });
    return;
  }

  const calls = await prisma.careCall.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
    orderBy: { calledAt: "desc" },
  });
  const latestInMonth = new Map<string, (typeof calls)[number]>();
  for (const c of calls) {
    if (monthKey(c.calledAt) !== month) continue;
    if (!latestInMonth.has(c.studentId)) latestInMonth.set(c.studentId, c);
  }

  res.json({
    month,
    students: students.map((s) => {
      const call = latestInMonth.get(s.id) ?? null;
      return {
        id: s.id,
        fullName: s.fullName,
        studentLoginId: s.user.studentLoginId,
        recorded: Boolean(call),
        englishMirrorPractice: call?.englishMirrorPractice ?? null,
        heavyPhoneTv: call?.heavyPhoneTv ?? null,
        calledAt: call ? call.calledAt.toISOString() : null,
      };
    }),
  });
});

const saveSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        englishMirrorPractice: yesNoZ.nullable(),
        heavyPhoneTv: yesNoZ.nullable(),
      })
    )
    .min(1),
});

router.put("/care-calls", async (req, res) => {
  const p = saveSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json(p.error.flatten());
    return;
  }

  const section = await prisma.section.findFirst({
    where: { id: p.data.sectionId, classId: p.data.classId },
  });
  if (!section) {
    res.status(400).json({ error: "Invalid class and section" });
    return;
  }

  const students = await prisma.student.findMany({
    where: { classId: p.data.classId, sectionId: p.data.sectionId },
    select: { id: true },
  });
  const allowed = new Set(students.map((s) => s.id));
  for (const e of p.data.entries) {
    if (!allowed.has(e.studentId)) {
      res.status(400).json({ error: "All students must belong to this class and section" });
      return;
    }
  }

  const now = new Date();
  await prisma.careCall.createMany({
    data: p.data.entries.map((e) => ({
      studentId: e.studentId,
      calledAt: now,
      englishMirrorPractice: e.englishMirrorPractice,
      heavyPhoneTv: e.heavyPhoneTv,
      recordedById: req.user?.sub ?? null,
    })),
  });

  res.json({ saved: p.data.entries.length });
});

export default router;
