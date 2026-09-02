export type AttendanceRange = "daily" | "weekly" | "monthly" | "academic_year" | "custom";

export type AttendanceReportSummary = {
  totalDays: number;
  present: number;
  absent: number;
  attendancePct: number | null;
};

export type AttendanceStreak = {
  currentStreak: number;
  bestStreak: number;
  asOfDate: string | null;
};

/** Motivational copy for the student streak card. */
export function attendanceStreakMessage(streak: AttendanceStreak): string {
  const { currentStreak, bestStreak } = streak;
  if (currentStreak === 0) {
    return "Start your streak — be present on the next school day!";
  }
  if (currentStreak >= bestStreak && currentStreak >= 5) {
    return `New personal best! Keep your ${currentStreak}-day streak going.`;
  }
  if (currentStreak >= 10) {
    return "Amazing consistency — you're on fire!";
  }
  if (currentStreak >= 5) {
    return "Great job — keep showing up!";
  }
  return "Nice start — build your streak day by day!";
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM from an ISO date string. */
export function yearMonthFromIso(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** e.g. "September 2026" from "2026-09" or "2026-09-15". */
export function formatMonthLabel(yearMonthOrDate: string): string {
  const ym = yearMonthOrDate.length >= 7 ? yearMonthOrDate.slice(0, 7) : yearMonthOrDate;
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Academic session starts 1 April (matches server logic). */
export function academicYearStartIso(asOf: string): string {
  const d = new Date(`${asOf}T00:00:00.000Z`);
  const year = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-04-01`;
}

export function buildAttendanceReportQuery(params: {
  range: AttendanceRange;
  date?: string;
  from?: string;
  to?: string;
  studentId?: string;
}): string {
  const q = new URLSearchParams();
  if (params.studentId) q.set("studentId", params.studentId);
  q.set("range", params.range);
  if (params.range === "custom") {
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
  } else if (params.date) {
    q.set("date", params.date);
  }
  return q.toString();
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

export type ClassAttendanceSummary = {
  from: string;
  to: string;
  className: string;
  sectionName: string;
  students: ClassAttendanceSummaryRow[];
};

export type AttendancePctFilterPreset =
  | "all"
  | "below_75"
  | "gte_75"
  | "perfect"
  | "no_records"
  | "custom";

export type CustomPctCompare = "below" | "gte";

export function buildAttendanceSummaryQuery(params: {
  classId: string;
  sectionId: string;
  range: AttendanceRange;
  date?: string;
  from?: string;
  to?: string;
}): string {
  const q = new URLSearchParams();
  q.set("classId", params.classId);
  q.set("sectionId", params.sectionId);
  q.set("range", params.range);
  if (params.range === "custom") {
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
  } else if (params.date) {
    q.set("date", params.date);
  }
  return q.toString();
}

export function filterAttendanceSummaryRows(
  students: ClassAttendanceSummaryRow[],
  preset: AttendancePctFilterPreset,
  customPct: number,
  customCompare: CustomPctCompare
): ClassAttendanceSummaryRow[] {
  if (preset === "all") return students;
  if (preset === "no_records") return students.filter((s) => s.totalDays === 0);
  if (preset === "below_75") {
    return students.filter((s) => s.attendancePct != null && s.attendancePct < 75);
  }
  if (preset === "gte_75") {
    return students.filter((s) => s.attendancePct != null && s.attendancePct >= 75);
  }
  if (preset === "perfect") {
    return students.filter((s) => s.attendancePct === 100);
  }
  const threshold = Math.min(100, Math.max(0, customPct));
  return students.filter((s) => {
    if (s.attendancePct == null) return false;
    return customCompare === "below" ? s.attendancePct < threshold : s.attendancePct >= threshold;
  });
}
