/** Admin-only. The office role is rejected by the guard in admin.ts. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  SupportError,
  closePrincipalAction,
  getSupportSettings,
  listPrincipalActionHistory,
  loadSupportBoard,
  recordPrincipalAction,
  updateSupportSettings,
} from "../services/principalSupport.js";
import { ACTION_KINDS, SUPPORT_AREAS } from "../services/principalSupportRules.js";

const router = Router();

const viewSchema = z.enum(["needs_support", "no_action", "recheck_due", "improved"]);
const areaSchema = z.enum(SUPPORT_AREAS);
const kindSchema = z.enum(ACTION_KINDS);

const boardQuerySchema = z.object({
  classId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  area: areaSchema.optional(),
  view: viewSchema.default("needs_support"),
});

const settingsSchema = z.object({
  speakingMaxLevelOrder: z.number().int().min(0).max(20),
  mathsBelowPct: z.number().min(1).max(100),
  attendanceBelowPct: z.number().min(1).max(100),
  recheckDays: z.number().int().min(1).max(90),
});

const recordSchema = z.object({
  studentId: z.string().min(1),
  area: areaSchema,
  actionKind: kindSchema,
  note: z.string().max(2000).optional().nullable(),
  recheckOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const outcomeSchema = z.object({
  outcome: z.enum(["IMPROVED", "STILL_NEEDS_SUPPORT"]),
  note: z.string().max(2000).optional().nullable(),
});

function sendSupportError(res: import("express").Response, err: unknown) {
  if (err instanceof SupportError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  throw err;
}

router.get("/principal-actions/settings", async (_req, res) => {
  const settings = await getSupportSettings(prisma);
  res.json(settings);
});

router.put("/principal-actions/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const settings = await updateSupportSettings(prisma, parsed.data);
  res.json(settings);
});

router.get("/principal-actions", async (req, res) => {
  const parsed = boardQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (parsed.data.sectionId && !parsed.data.classId) {
    return res.status(400).json({ error: "classId is required when sectionId is set" });
  }
  const board = await loadSupportBoard(prisma, parsed.data);
  res.json(board);
});

router.get("/principal-actions/history", async (req, res) => {
  const studentId = typeof req.query.studentId === "string" ? req.query.studentId : "";
  const area = areaSchema.safeParse(req.query.area);
  if (!studentId || !area.success) {
    return res.status(400).json({ error: "studentId and area are required" });
  }
  const history = await listPrincipalActionHistory(prisma, studentId, area.data);
  res.json(history);
});

router.post("/principal-actions", async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const created = await recordPrincipalAction(prisma, {
      ...parsed.data,
      recordedById: req.user!.sub,
    });
    res.status(201).json(created);
  } catch (err) {
    sendSupportError(res, err);
  }
});

router.post("/principal-actions/:id/outcome", async (req, res) => {
  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const updated = await closePrincipalAction(prisma, {
      actionId: req.params.id,
      outcome: parsed.data.outcome,
      note: parsed.data.note,
    });
    res.json(updated);
  } catch (err) {
    sendSupportError(res, err);
  }
});

export default router;
