import { AttendanceStatus, PrismaClient } from "@prisma/client";

export type AttendanceRange = "daily" | "weekly" | "monthly" | "academic_year" | "custom";

export type AttendanceReportBoundsInput = {
  range: AttendanceRange;
  anchorDate?: string;
  from?: string;
  to?: string;
};

export function parseAnchorDate(value?: string): Date {
  const v = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  return d;
}

function startOfWeekUtc(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay(); // 0 Sun..6 Sat
  const daysFromMonday = (day + 6) % 7;
  out.setUTCDate(out.getUTCDate() - daysFromMonday);
  return out;
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Academic session starts 1 April. If anchor is before April, use previous year's April 1. */
export function academicYearStartUtc(anchor: Date): Date {
  const year = anchor.getUTCFullYear();
  const startYear = anchor.getUTCMonth() >= 3 ? year : year - 1;
  return new Date(Date.UTC(startYear, 3, 1));
}

export function resolveReportBounds(
  input: AttendanceReportBoundsInput
): { from: Date; toExclusive: Date } | { error: string } {
  const anchor = parseAnchorDate(input.anchorDate);

  if (input.range === "custom") {
    if (!input.from || !input.to || !/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
      return { error: "Custom range requires from and to (YYYY-MM-DD)" };
    }
    const from = parseAnchorDate(input.from);
    const to = parseAnchorDate(input.to);
    if (from > to) return { error: "from must be on or before to" };
    return { from, toExclusive: addDaysUtc(to, 1) };
  }

  if (input.range === "academic_year") {
    const from = academicYearStartUtc(anchor);
    const toExclusive = addDaysUtc(startOfDayUtc(anchor), 1);
    return { from, toExclusive };
  }

  if (input.range === "daily") {
    const from = startOfDayUtc(anchor);
    return { from, toExclusive: addDaysUtc(from, 1) };
  }
  if (input.range === "weekly") {
    const from = startOfWeekUtc(anchor);
    return { from, toExclusive: addDaysUtc(from, 7) };
  }
  const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const toExclusive = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  return { from, toExclusive };
}

export type AttendanceStreak = {
  currentStreak: number;
  bestStreak: number;
  /** Most recent school day with an attendance record. */
  asOfDate: string | null;
};

type StreakRecord = { date: string; status: AttendanceStatus };

/** Consecutive present school days (marked dates only), newest first for current. */
export function computeAttendanceStreak(records: StreakRecord[]): AttendanceStreak {
  const byDate = new Map<string, AttendanceStatus>();
  for (const r of records) {
    byDate.set(r.date, r.status);
  }
  const datesAsc = [...byDate.keys()].sort();
  if (datesAsc.length === 0) {
    return { currentStreak: 0, bestStreak: 0, asOfDate: null };
  }

  let bestStreak = 0;
  let run = 0;
  for (const date of datesAsc) {
    if (byDate.get(date) === AttendanceStatus.PRESENT) {
      run += 1;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
  }

  let currentStreak = 0;
  for (const date of [...datesAsc].reverse()) {
    if (byDate.get(date) === AttendanceStatus.PRESENT) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    bestStreak,
    asOfDate: datesAsc[datesAsc.length - 1] ?? null,
  };
}

export async function attendanceStreakForStudent(
  prisma: PrismaClient,
  studentId: string,
  anchorDate?: string
): Promise<AttendanceStreak> {
  const anchor = parseAnchorDate(anchorDate);
  const from = academicYearStartUtc(anchor);
  const toExclusive = addDaysUtc(startOfDayUtc(anchor), 1);

  const entries = await prisma.attendanceEntry.findMany({
    where: {
      studentId,
      session: { date: { gte: from, lt: toExclusive } },
    },
    select: {
      status: true,
      session: { select: { date: true } },
    },
    orderBy: { session: { date: "asc" } },
  });

  const records: StreakRecord[] = entries.map((e) => ({
    date: e.session.date.toISOString().slice(0, 10),
    status: e.status,
  }));

  return computeAttendanceStreak(records);
}

export async function attendanceReportForStudent(
  prisma: PrismaClient,
  studentId: string,
  input: AttendanceReportBoundsInput
) {
  const bounds = resolveReportBounds(input);
  if ("error" in bounds) return { error: bounds.error as string };

  const { from, toExclusive } = bounds;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      schoolClass: { select: { id: true, name: true, grade: true } },
      section: { select: { id: true, name: true } },
      user: { select: { studentLoginId: true } },
    },
  });
  if (!student) return null;

  const entries = await prisma.attendanceEntry.findMany({
    where: {
      studentId,
      session: {
        date: { gte: from, lt: toExclusive },
      },
    },
    include: {
      session: {
        select: {
          date: true,
          notes: true,
          classId: true,
          sectionId: true,
        },
      },
    },
    orderBy: { session: { date: "desc" } },
  });

  let present = 0;
  let absent = 0;
  for (const e of entries) {
    if (e.status === AttendanceStatus.PRESENT) present += 1;
    else if (e.status === AttendanceStatus.ABSENT) absent += 1;
  }
  const total = entries.length;
  const attendancePct = total > 0 ? Math.round((present * 1000) / total) / 10 : null;

  const streak = await attendanceStreakForStudent(prisma, studentId, input.anchorDate);

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      studentLoginId: student.user.studentLoginId,
      classId: student.schoolClass.id,
      className: student.schoolClass.name,
      sectionId: student.section.id,
      sectionName: student.section.name,
    },
    range: input.range,
    from: from.toISOString().slice(0, 10),
    to: addDaysUtc(toExclusive, -1).toISOString().slice(0, 10),
    summary: {
      totalDays: total,
      present,
      absent,
      attendancePct,
    },
    streak,
    records: entries.map((e) => ({
      date: e.session.date.toISOString().slice(0, 10),
      status: e.status,
      remark: e.remark ?? "",
      notes: e.session.notes ?? "",
    })),
  };
}

export type ClassAttendanceSummaryRow = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  present: number;
  absent: number;
  totalDays: number;
  attendancePct: number | null;
};

export async function attendanceSummaryForClassSection(
  prisma: PrismaClient,
  classId: string,
  sectionId: string,
  input: AttendanceReportBoundsInput
) {
  const bounds = resolveReportBounds(input);
  if ("error" in bounds) return { error: bounds.error as string };

  const { from, toExclusive } = bounds;

  const section = await prisma.section.findFirst({
    where: { id: sectionId, classId },
    include: { schoolClass: true },
  });
  if (!section) return null;

  const students = await prisma.student.findMany({
    where: { classId, sectionId },
    include: { user: { select: { studentLoginId: true } } },
    orderBy: { fullName: "asc" },
  });

  const entries = await prisma.attendanceEntry.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      session: {
        classId,
        sectionId,
        date: { gte: from, lt: toExclusive },
      },
    },
    select: { studentId: true, status: true },
  });

  const counts = new Map<string, { present: number; absent: number }>();
  for (const e of entries) {
    const cur = counts.get(e.studentId) ?? { present: 0, absent: 0 };
    if (e.status === AttendanceStatus.PRESENT) cur.present += 1;
    else if (e.status === AttendanceStatus.ABSENT) cur.absent += 1;
    counts.set(e.studentId, cur);
  }

  const rows: ClassAttendanceSummaryRow[] = students.map((s) => {
    const c = counts.get(s.id) ?? { present: 0, absent: 0 };
    const totalDays = c.present + c.absent;
    const attendancePct =
      totalDays > 0 ? Math.round((c.present * 1000) / totalDays) / 10 : null;
    return {
      id: s.id,
      fullName: s.fullName,
      studentLoginId: s.user.studentLoginId,
      present: c.present,
      absent: c.absent,
      totalDays,
      attendancePct,
    };
  });

  rows.sort((a, b) => {
    if (a.attendancePct == null && b.attendancePct == null) {
      return a.fullName.localeCompare(b.fullName);
    }
    if (a.attendancePct == null) return 1;
    if (b.attendancePct == null) return -1;
    if (a.attendancePct !== b.attendancePct) return a.attendancePct - b.attendancePct;
    return a.fullName.localeCompare(b.fullName);
  });

  return {
    range: input.range,
    classId,
    sectionId,
    className: section.schoolClass.name,
    sectionName: section.name,
    from: from.toISOString().slice(0, 10),
    to: addDaysUtc(toExclusive, -1).toISOString().slice(0, 10),
    students: rows,
  };
}
