import { z } from "zod";

const attendanceReportQueryBase = z.object({
  studentId: z.string().min(1).optional(),
  range: z.enum(["daily", "weekly", "monthly", "academic_year", "custom"]).default("daily"),
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

function refineCustomRange<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data, ctx) => {
    if (data.range !== "custom") return;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!data.from || !dateRe.test(data.from)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from is required (YYYY-MM-DD)", path: ["from"] });
    }
    if (!data.to || !dateRe.test(data.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "to is required (YYYY-MM-DD)", path: ["to"] });
    }
    if (data.from && data.to && dateRe.test(data.from) && dateRe.test(data.to) && data.from > data.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be on or before to", path: ["from"] });
    }
  });
}

export const attendanceReportQuerySchema = refineCustomRange(attendanceReportQueryBase);

export const attendanceReportQuerySchemaWithStudent = refineCustomRange(
  attendanceReportQueryBase.extend({
    studentId: z.string().min(1),
  })
);

export const attendanceSummaryQuerySchema = refineCustomRange(
  z.object({
    classId: z.string().min(1),
    sectionId: z.string().min(1),
    range: z.enum(["daily", "weekly", "monthly", "academic_year", "custom"]).default("academic_year"),
    date: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
);
