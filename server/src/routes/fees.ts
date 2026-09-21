import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { istDayKey } from "../services/engagementCalendar.js";
import {
  academicYearKey,
  addManualCharge,
  collectFeePayment,
  feeAccountSnapshot,
  generateMonthForStudent,
  generateMonthlyFees,
  linkFeeSiblings,
  listFeeCollections,
  listFeeStructures,
  monthPeriodKey,
  saveFeeStructures,
  schoolFeeTotals,
  setFeeAccountContact,
  setStudentTransport,
  unlinkFeeSibling,
} from "../services/fees.js";
import {
  collectFeeSchema,
  feeContactSchema,
  generateMonthSchema,
  linkSiblingSchema,
  manualChargeSchema,
  saveFeeStructuresSchema,
  transportSchema,
} from "../schemas/fees.js";

const router = Router();

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req, res)).catch((err: unknown) => {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "P2021" || /does not exist/i.test(String(err))) {
        res.status(503).json({
          error: "Fee tables are missing. From the server folder run: npx prisma migrate deploy",
        });
        return;
      }
      next(err);
    });
  };
}

router.get("/fees/meta", (_req, res) => {
  const today = istDayKey();
  res.json({
    today,
    academicYear: academicYearKey(today),
    monthPeriod: monthPeriodKey(today),
  });
});

router.get(
  "/fees/structures",
  asyncHandler(async (req, res) => {
    const academicYear =
      typeof req.query.academicYear === "string" && req.query.academicYear.trim()
        ? req.query.academicYear.trim()
        : academicYearKey();
    const data = await listFeeStructures(prisma, academicYear);
    res.json(data);
  })
);

router.put(
  "/fees/structures",
  asyncHandler(async (req, res) => {
    const parsed = saveFeeStructuresSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const data = await saveFeeStructures(prisma, parsed.data.academicYear, parsed.data.structures);
    res.json(data);
  })
);

router.get(
  "/fees/students/:studentId",
  asyncHandler(async (req, res) => {
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    if (!snapshot) return res.status(404).json({ error: "Student not found" });
    res.json(snapshot);
  })
);

router.post(
  "/fees/students/:studentId/pay",
  asyncHandler(async (req, res) => {
    const parsed = collectFeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const result = await collectFeePayment(prisma, {
      studentId: req.params.studentId,
      amount: parsed.data.amount,
      mode: parsed.data.mode,
      paidOn: parsed.data.paidOn,
      note: parsed.data.note,
      createdById: req.user?.sub,
    });
    if ("error" in result) return res.status(404).json({ error: result.error });
    res.json(result);
  })
);

router.post(
  "/fees/students/:studentId/charge",
  asyncHandler(async (req, res) => {
    const parsed = manualChargeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const created = await addManualCharge(prisma, {
      studentId: req.params.studentId,
      kind: parsed.data.kind,
      amount: parsed.data.amount,
      note: parsed.data.note,
      createdById: req.user?.sub,
    });
    if (created && "error" in created) return res.status(400).json({ error: created.error });
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    res.json(snapshot);
  })
);

router.post(
  "/fees/students/:studentId/link-sibling",
  asyncHandler(async (req, res) => {
    const parsed = linkSiblingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const result = await linkFeeSiblings(prisma, req.params.studentId, parsed.data.siblingStudentId);
    if (result && "error" in result) return res.status(400).json({ error: result.error });
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    res.json(snapshot);
  })
);

router.post(
  "/fees/students/:studentId/unlink",
  asyncHandler(async (req, res) => {
    const result = await unlinkFeeSibling(prisma, req.params.studentId);
    if (result && "error" in result) return res.status(400).json({ error: result.error });
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    res.json(snapshot);
  })
);

router.patch(
  "/fees/students/:studentId/transport",
  asyncHandler(async (req, res) => {
    const parsed = transportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });
    await setStudentTransport(prisma, req.params.studentId, parsed.data.usesTransport);
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    res.json(snapshot);
  })
);

router.patch(
  "/fees/students/:studentId/contact",
  asyncHandler(async (req, res) => {
    const parsed = feeContactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });
    await setFeeAccountContact(prisma, req.params.studentId, parsed.data);
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    res.json(snapshot);
  })
);

router.post(
  "/fees/generate-month",
  asyncHandler(async (req, res) => {
    const parsed = generateMonthSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const academicYear = parsed.data.academicYear ?? academicYearKey();
    const result = await generateMonthlyFees(prisma, {
      academicYear,
      periodKey: parsed.data.periodKey,
      classId: parsed.data.classId,
      createdById: req.user?.sub,
    });
    res.json(result);
  })
);

router.post(
  "/fees/students/:studentId/generate-month",
  asyncHandler(async (req, res) => {
    const parsed = generateMonthSchema.pick({ periodKey: true, academicYear: true }).safeParse({
      periodKey: req.body?.periodKey,
      academicYear: req.body?.academicYear,
    });
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const result = await generateMonthForStudent(prisma, req.params.studentId, {
      academicYear: parsed.data.academicYear ?? academicYearKey(),
      periodKey: parsed.data.periodKey,
      createdById: req.user?.sub,
    });
    if ("error" in result) return res.status(404).json({ error: result.error });
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    res.json(snapshot);
  })
);

router.get(
  "/fees/school",
  asyncHandler(async (req, res) => {
    const paidOn = typeof req.query.paidOn === "string" ? req.query.paidOn : undefined;
    const data = await schoolFeeTotals(prisma, paidOn ? { paidOn } : undefined);
    res.json(data);
  })
);

router.get(
  "/fees/collections",
  asyncHandler(async (req, res) => {
    const paidOn = typeof req.query.paidOn === "string" && req.query.paidOn ? req.query.paidOn : istDayKey();
    const data = await listFeeCollections(prisma, paidOn);
    res.json(data);
  })
);

export default router;
