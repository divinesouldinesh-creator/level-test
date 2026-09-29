import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { istDayKey } from "../services/engagementCalendar.js";
import {
  academicYearKey,
  addManualCharge,
  collectFeePayment,
  deleteOptionalCharge,
  feeAccountSnapshot,
  deleteFeePayment,
  updateFamilyOneTimeCharge,
  updateFeePayment,
  generateMonthForStudent,
  generateMonthlyFees,
  linkFeeSiblings,
  listFeeCollections,
  listFeeStructures,
  monthPeriodKey,
  saveFamilyAccount,
  setLastYearBalance,
  saveFamilyBilling,
  saveFeeStructures,
  schoolFeeTotals,
  schoolAccountsReport,
  setFeeAccountContact,
  setStudentTransport,
  unlinkFeeSibling,
} from "../services/fees.js";
import {
  collectFeeSchema,
  createAccountSchema,
  familyBillingSchema,
  feeContactSchema,
  generateMonthSchema,
  lastYearBalanceSchema,
  linkSiblingSchema,
  manualChargeSchema,
  saveFeeStructuresSchema,
  transportSchema,
  updateFeePaymentSchema,
  updateOneTimeSchema,
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
    const data = await saveFeeStructures(
      prisma,
      parsed.data.academicYear,
      parsed.data.structures,
      parsed.data.transportRatePerKm
    );
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
      discount: parsed.data.discount,
      createdById: req.user?.sub,
    });
    if ("error" in result) return res.status(400).json({ error: result.error });
    res.json(result);
  })
);

router.put(
  "/fees/students/:studentId/last-year",
  asyncHandler(async (req, res) => {
    const parsed = lastYearBalanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const result = await setLastYearBalance(prisma, req.params.studentId, parsed.data.amount, req.user?.sub);
    if ("error" in result) return res.status(404).json({ error: result.error });
    res.json(result.snapshot);
  })
);

router.patch(
  "/fees/students/:studentId/one-time",
  asyncHandler(async (req, res) => {
    const parsed = updateOneTimeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const result = await updateFamilyOneTimeCharge(prisma, req.params.studentId, parsed.data, req.user?.sub);
    if ("error" in result) return res.status(400).json({ error: result.error });
    res.json(result.snapshot);
  })
);

router.patch(
  "/fees/students/:studentId/payments/:paymentId",
  asyncHandler(async (req, res) => {
    const parsed = updateFeePaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const result = await updateFeePayment(prisma, req.params.studentId, req.params.paymentId, parsed.data);
    if ("error" in result) return res.status(404).json({ error: result.error });
    res.json(result.snapshot);
  })
);

router.delete(
  "/fees/students/:studentId/payments/:paymentId",
  asyncHandler(async (req, res) => {
    const result = await deleteFeePayment(prisma, req.params.studentId, req.params.paymentId);
    if ("error" in result) return res.status(404).json({ error: result.error });
    res.json(result.snapshot);
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
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId, { skipPost: true });
    res.json(snapshot);
  })
);

router.delete(
  "/fees/students/:studentId/charges/:chargeId",
  asyncHandler(async (req, res) => {
    const result = await deleteOptionalCharge(prisma, req.params.studentId, req.params.chargeId);
    if ("error" in result) return res.status(400).json({ error: result.error });
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId, { skipPost: true });
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
    await setStudentTransport(prisma, req.params.studentId, parsed.data.transportKm);
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId);
    res.json(snapshot);
  })
);

router.put(
  "/fees/students/:studentId/account",
  asyncHandler(async (req, res) => {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const result = await saveFamilyAccount(prisma, req.params.studentId, parsed.data, req.user?.sub);
    if ("error" in result) return res.status(400).json({ error: result.error });
    const snapshot = await feeAccountSnapshot(prisma, req.params.studentId, { skipPost: true });
    res.json(snapshot);
  })
);

router.put(
  "/fees/students/:studentId/billing",
  asyncHandler(async (req, res) => {
    const parsed = familyBillingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const student = await prisma.student.findUnique({
      where: { id: req.params.studentId },
      select: { id: true },
    });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const result = await saveFamilyBilling(prisma, req.params.studentId, parsed.data, req.user?.sub);
    if ("error" in result) return res.status(404).json({ error: result.error });
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
  "/fees/school-report",
  asyncHandler(async (_req, res) => {
    const data = await schoolAccountsReport(prisma);
    res.json(data);
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
