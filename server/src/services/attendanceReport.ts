import { AttendanceStatus, PrismaClient } from "@prisma/client";

export type AttendanceRange =
  | "daily"
  | "yesterday"
  | "weekly"
  | "last_7_days"
  | "monthly"
  | "last_month"
  | "academic_year"
  | "custom";

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
  if (input.range === "yesterday") {
    const from = addDaysUtc(startOfDayUtc(anchor), -1);
    return { from, toExclusive: addDaysUtc(from, 1) };
  }
  if (input.range === "weekly") {
    const from = startOfWeekUtc(anchor);
    return { from, toExclusive: addDaysUtc(from, 7) };
  }
  if (input.range === "last_7_days") {
    const toExclusive = addDaysUtc(startOfDayUtc(anchor), 1);
    const from = addDaysUtc(startOfDayUtc(anchor), -6);
    return { from, toExclusive };
  }
  if (input.range === "last_month") {
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth();
    const from = new Date(Date.UTC(y, m - 1, 1));
    const toExclusive = new Date(Date.UTC(y, m, 1));
    return { from, toExclusive };
  }
  // monthly — calendar month of the reference date
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

function attendancePct(present: number, absent: number): number | null {
  const total = present + absent;
  if (total <= 0) return null;
  return Math.round((present * 1000) / total) / 10;
}

export type SchoolAttendanceSectionRow = {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  studentCount: number;
  present: number;
  absent: number;
  totalDays: number;
  attendancePct: number | null;
  studentsBelow75: number;
  studentsNoRecords: number;
};

export type SchoolAttendanceOverview = {
  range: AttendanceRange;
  from: string;
  to: string;
  school: {
    studentCount: number;
    present: number;
    absent: number;
    totalDays: number;
    attendancePct: number | null;
    studentsBelow75: number;
    sectionsBelow75: number;
    sectionsWithNoRecords: number;
  };
  sections: SchoolAttendanceSectionRow[];
};

/** School-wide attendance by class section. % is present marks ÷ all marked student-days. */
export async function attendanceOverviewForSchool(
  prisma: PrismaClient,
  input: AttendanceReportBoundsInput
): Promise<SchoolAttendanceOverview | { error: string }> {
  const bounds = resolveReportBounds(input);
  if ("error" in bounds) return { error: bounds.error as string };

  const { from, toExclusive } = bounds;

  const [classes, students, entries] = await Promise.all([
    prisma.schoolClass.findMany({
      include: { sections: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.student.findMany({
      select: { id: true, classId: true, sectionId: true },
    }),
    prisma.attendanceEntry.findMany({
      where: {
        session: { date: { gte: from, lt: toExclusive } },
      },
      select: {
        studentId: true,
        status: true,
        session: { select: { classId: true, sectionId: true } },
      },
    }),
  ]);

  const sectionKey = (classId: string, sectionId: string) => `${classId}:${sectionId}`;

  const studentIdsBySection = new Map<string, string[]>();
  const studentSection = new Map<string, string>();
  for (const s of students) {
    const key = sectionKey(s.classId, s.sectionId);
    const list = studentIdsBySection.get(key);
    if (list) list.push(s.id);
    else studentIdsBySection.set(key, [s.id]);
    studentSection.set(s.id, key);
  }

  const studentMarks = new Map<string, { present: number; absent: number }>();
  const sectionMarks = new Map<string, { present: number; absent: number }>();
  for (const e of entries) {
    const key = sectionKey(e.session.classId, e.session.sectionId);
    if (studentSection.get(e.studentId) !== key) continue;
    const sm = studentMarks.get(e.studentId) ?? { present: 0, absent: 0 };
    const sec = sectionMarks.get(key) ?? { present: 0, absent: 0 };
    if (e.status === AttendanceStatus.PRESENT) {
      sm.present += 1;
      sec.present += 1;
    } else if (e.status === AttendanceStatus.ABSENT) {
      sm.absent += 1;
      sec.absent += 1;
    }
    studentMarks.set(e.studentId, sm);
    sectionMarks.set(key, sec);
  }

  const sections: SchoolAttendanceSectionRow[] = [];
  for (const cls of classes) {
    for (const section of cls.sections) {
      const key = sectionKey(cls.id, section.id);
      const ids = studentIdsBySection.get(key) ?? [];
      const marks = sectionMarks.get(key) ?? { present: 0, absent: 0 };
      let studentsBelow75 = 0;
      let studentsNoRecords = 0;
      for (const id of ids) {
        const m = studentMarks.get(id);
        if (!m || m.present + m.absent === 0) {
          studentsNoRecords += 1;
          continue;
        }
        const pct = attendancePct(m.present, m.absent);
        if (pct != null && pct < 75) studentsBelow75 += 1;
      }
      const totalDays = marks.present + marks.absent;
      sections.push({
        classId: cls.id,
        className: cls.name,
        sectionId: section.id,
        sectionName: section.name,
        studentCount: ids.length,
        present: marks.present,
        absent: marks.absent,
        totalDays,
        attendancePct: attendancePct(marks.present, marks.absent),
        studentsBelow75,
        studentsNoRecords,
      });
    }
  }

  sections.sort((a, b) => {
    if (a.attendancePct == null && b.attendancePct == null) {
      return a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName);
    }
    if (a.attendancePct == null) return 1;
    if (b.attendancePct == null) return -1;
    if (a.attendancePct !== b.attendancePct) return a.attendancePct - b.attendancePct;
    return a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName);
  });

  const schoolPresent = sections.reduce((n, s) => n + s.present, 0);
  const schoolAbsent = sections.reduce((n, s) => n + s.absent, 0);
  const schoolBelow75 = sections.reduce((n, s) => n + s.studentsBelow75, 0);

  return {
    range: input.range,
    from: from.toISOString().slice(0, 10),
    to: addDaysUtc(toExclusive, -1).toISOString().slice(0, 10),
    school: {
      studentCount: students.length,
      present: schoolPresent,
      absent: schoolAbsent,
      totalDays: schoolPresent + schoolAbsent,
      attendancePct: attendancePct(schoolPresent, schoolAbsent),
      studentsBelow75: schoolBelow75,
      sectionsBelow75: sections.filter((s) => s.attendancePct != null && s.attendancePct < 75).length,
      sectionsWithNoRecords: sections.filter((s) => s.totalDays === 0).length,
    },
    sections,
  };
}
