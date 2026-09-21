import { z } from "zod";

export const academicYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Academic year must look like 2026-27");

export const monthPeriodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Month must look like 2026-09");

export const rupeeAmountSchema = z.number().int().min(0).max(10_000_000);

export const saveFeeStructuresSchema = z.object({
  academicYear: academicYearSchema,
  structures: z
    .array(
      z.object({
        classId: z.string().min(1),
        tuitionAmount: rupeeAmountSchema,
        transportAmount: rupeeAmountSchema,
        annualAmount: rupeeAmountSchema.optional().default(0),
        admissionAmount: rupeeAmountSchema.optional().default(0),
        examAmount: rupeeAmountSchema.optional().default(0),
      })
    )
    .min(1)
    .max(80),
});

export const generateMonthSchema = z.object({
  academicYear: academicYearSchema.optional(),
  periodKey: monthPeriodSchema,
  classId: z.string().min(1).optional(),
});

export const collectFeeSchema = z.object({
  amount: z.number().int().min(1).max(10_000_000),
  mode: z.enum(["CASH", "UPI", "BANK"]),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).optional(),
});

export const linkSiblingSchema = z.object({
  siblingStudentId: z.string().min(1),
});

export const transportSchema = z.object({
  usesTransport: z.boolean(),
});

export const feeContactSchema = z.object({
  parentName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
});

export const manualChargeSchema = z.object({
  kind: z.enum(["ANNUAL", "ADMISSION", "EXAM", "OTHER", "OPENING"]),
  amount: z.number().int().min(1).max(10_000_000),
  note: z.string().trim().max(300).optional(),
});
