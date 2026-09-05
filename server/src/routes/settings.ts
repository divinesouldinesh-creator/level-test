import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { getSchoolBranding } from "../services/schoolBranding.js";
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

export default router;
