import { Router } from "express";
import { CareCallYesNo } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  answerMapForCall,
  callHasAnswer,
  careCallAnswerInclude,
  createCareCall,
  monthKey,
  questionsForMonth,
} from "../services/careCallPlan.js";

const router = Router();

const yesNoZ = z.enum(["YES", "NO"]);

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
  const month = monthKey();
  const questions = await questionsForMonth(month);
  const calls =
    students.length === 0
      ? []
      : await prisma.careCall.findMany({
          where: { studentId: { in: students.map((s) => s.id) } },
          orderBy: { calledAt: "desc" },
          include: careCallAnswerInclude,
        });
  const latest = new Map<string, (typeof calls)[number]>();
  for (const call of calls) {
    if (monthKey(call.calledAt) !== month) continue;
    if (latest.has(call.studentId)) continue;
    if (!callHasAnswer(answerMapForCall(questions, call))) continue;
    latest.set(call.studentId, call);
  }

  res.json({
    month,
    questions,
    students: students.map((student) => ({
      id: student.id,
      fullName: student.fullName,
      studentLoginId: student.user.studentLoginId,
      answers: answerMapForCall(questions, latest.get(student.id) ?? null),
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
  const months = [...new Set(calls.map((call) => monthKey(call.calledAt)))];
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
  const questions = await questionsForMonth(month);
  if (students.length === 0) {
    res.json({ month, questions, students: [] });
    return;
  }

  const calls = await prisma.careCall.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
    orderBy: { calledAt: "desc" },
    include: careCallAnswerInclude,
  });
  const latest = new Map<string, (typeof calls)[number]>();
  for (const call of calls) {
    if (monthKey(call.calledAt) !== month) continue;
    if (latest.has(call.studentId)) continue;
    if (!callHasAnswer(answerMapForCall(questions, call))) continue;
    latest.set(call.studentId, call);
  }

  res.json({
    month,
    questions,
    students: students.map((student) => {
      const call = latest.get(student.id) ?? null;
      return {
        id: student.id,
        fullName: student.fullName,
        studentLoginId: student.user.studentLoginId,
        recorded: Boolean(call),
        answers: answerMapForCall(questions, call),
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
        answers: z.array(z.object({ questionId: z.string().min(1), value: yesNoZ })),
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
  const allowed = new Set(students.map((student) => student.id));
  for (const entry of p.data.entries) {
    if (!allowed.has(entry.studentId)) {
      res.status(400).json({ error: "All students must belong to this class and section" });
      return;
    }
  }

  const questions = await questionsForMonth(monthKey());
  const filled = p.data.entries.filter((entry) => entry.answers.length > 0);
  if (filled.length === 0) {
    res.status(400).json({ error: "Mark at least one student" });
    return;
  }

  for (const entry of filled) {
    await createCareCall({
      studentId: entry.studentId,
      recordedById: req.user?.sub ?? null,
      questions,
      answers: entry.answers.map((answer) => ({
        questionId: answer.questionId,
        value: answer.value as CareCallYesNo,
      })),
    });
  }

  res.json({ saved: filled.length });
});

export default router;
