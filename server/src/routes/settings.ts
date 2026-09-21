import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { getSchoolBranding } from "../services/schoolBranding.js";
import { parseIsoDate, resolveHolidays } from "../services/schoolHolidays.js";
import { sendBrandingError } from "../utils/brandingErrors.js";

const router = Router();

router.get("/school", authMiddleware, requireRole("ADMIN", "TEACHER", "OFFICE"), async (_req, res) => {
  try {
    const branding = await getSchoolBranding(prisma);
    res.json(branding);
  } catch (e) {
    sendBrandingError(res, e);
  }
});

router.get("/holidays", authMiddleware, requireRole("ADMIN", "TEACHER", "OFFICE"), async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  if (!parseIsoDate(from) || !parseIsoDate(to)) {
    res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    return;
  }
  if (from > to) {
    res.status(400).json({ error: "from must be on or before to" });
    return;
  }
  try {
    const { holidays } = await resolveHolidays(prisma, from, to);
    res.json({ from, to, holidays });
  } catch (e) {
    console.error("holidays lookup failed", e);
    res.status(500).json({ error: "Could not load holidays" });
  }
});

export default router;
