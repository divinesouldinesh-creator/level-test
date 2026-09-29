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
        transportAmount: rupeeAmountSchema.optional(),
        annualAmount: rupeeAmountSchema.optional().default(0),
        admissionAmount: rupeeAmountSchema.optional().default(0),
        registrationAmount: rupeeAmountSchema.optional().default(0),
        examAmount: rupeeAmountSchema.optional().default(0),
      })
    )
    .min(1)
    .max(80),
  transportRatePerKm: rupeeAmountSchema.optional().default(0),
});

export const generateMonthSchema = z.object({
  academicYear: academicYearSchema.optional(),
  periodKey: monthPeriodSchema,
});

export const collectFeeSchema = z
  .object({
    amount: z.number().int().min(0).max(10_000_000),
    discount: rupeeAmountSchema.optional().default(0),
    mode: z.enum(["CASH", "UPI", "BANK"]),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(300).optional(),
  })
  .refine((data) => data.amount >= 1 || data.discount >= 1, {
    message: "Enter an amount received or a discount.",
  });

export const updateOneTimeSchema = z.object({
  kind: z.enum(["ANNUAL", "REGISTRATION", "ADMISSION", "EXAM"]),
  amount: rupeeAmountSchema,
});

export const updateFeePaymentSchema = z.object({
  amount: z.number().int().min(1).max(10_000_000),
  mode: z.enum(["CASH", "UPI", "BANK"]),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).nullable().optional(),
});

export const linkSiblingSchema = z.object({
  siblingStudentId: z.string().min(1),
});

export const transportSchema = z.object({
  transportKm: z.number().int().min(0).max(500),
});

export const feeContactSchema = z.object({
  parentName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
});

export const createAccountSchema = z.object({
  billingMode: z.enum(["MONTHLY", "YEARLY"]),
  monthlyDiscount: rupeeAmountSchema,
  effectiveFrom: monthPeriodSchema,
  transport: z
    .array(
      z.object({
        studentId: z.string().min(1),
        amount: rupeeAmountSchema,
      })
    )
    .max(20),
  annualDiscount: rupeeAmountSchema.optional().default(0),
  registrationDiscount: rupeeAmountSchema.optional().default(0),
  admissionDiscount: rupeeAmountSchema.optional().default(0),
  examDiscount: rupeeAmountSchema.optional().default(0),
  waiveAnnual: z.boolean().optional().default(false),
  waiveRegistration: z.boolean().optional().default(false),
  waiveAdmission: z.boolean().optional().default(false),
  waiveExam: z.boolean().optional().default(false),
  oneTimeAmounts: z
    .object({
      annual: rupeeAmountSchema.optional(),
      registration: rupeeAmountSchema.optional(),
      admission: rupeeAmountSchema.optional(),
      exam: rupeeAmountSchema.optional(),
    })
    .optional(),
  lastYearBalance: rupeeAmountSchema.optional(),
  yearlyFee: rupeeAmountSchema.optional(),
});

export const familyBillingSchema = z.object({
  billingMode: z.enum(["MONTHLY", "YEARLY"]),
  monthlyDiscount: rupeeAmountSchema,
  annualDiscount: rupeeAmountSchema,
  registrationDiscount: rupeeAmountSchema,
  admissionDiscount: rupeeAmountSchema,
  examDiscount: rupeeAmountSchema,
  waiveAnnual: z.boolean(),
  waiveRegistration: z.boolean(),
  waiveAdmission: z.boolean(),
  waiveExam: z.boolean(),
});

export const lastYearBalanceSchema = z.object({
  amount: rupeeAmountSchema,
});

export const manualChargeSchema = z.object({
  kind: z.enum(["ANNUAL", "ADMISSION", "EXAM", "OTHER", "OPENING"]),
  amount: z.number().int().min(1).max(10_000_000),
  note: z.string().trim().max(300).optional(),
});
