export type AttendanceRange =
  | "daily"
  | "yesterday"
  | "weekly"
  | "last_7_days"
  | "monthly"
  | "last_month"
  | "academic_year"
  | "custom";

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

/** Calendar day before today (UTC, matches todayIso). */
export function yesterdayIso(): string {
  const d = new Date(`${todayIso()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type SaturdayHolidayRule = "NONE" | "SECOND" | "ALL";

export type HolidaySettings = {
  sundaysOff: boolean;
  saturdayRule: SaturdayHolidayRule;
};

export const DEFAULT_HOLIDAY_SETTINGS: HolidaySettings = {
  sundaysOff: true,
  saturdayRule: "SECOND",
};

function utcDayOfWeekIso(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

function isSecondSaturdayIso(iso: string): boolean {
  if (utcDayOfWeekIso(iso) !== 6) return false;
  const day = Number(iso.slice(8, 10));
  return day >= 8 && day <= 14;
}

export function defaultHolidayName(
  iso: string,
  settings: HolidaySettings = DEFAULT_HOLIDAY_SETTINGS
): string | null {
  if (settings.sundaysOff && utcDayOfWeekIso(iso) === 0) return "Sunday";
  if (settings.saturdayRule === "ALL" && utcDayOfWeekIso(iso) === 6) return "Saturday";
  if (settings.saturdayRule === "SECOND" && isSecondSaturdayIso(iso)) return "2nd Saturday";
  return null;
}

/** Sundays + 2nd Saturday (or current rules) so the calendar can paint before the API returns. */
export function defaultHolidaysInRange(
  fromIso: string,
  toIso: string,
  settings: HolidaySettings = DEFAULT_HOLIDAY_SETTINGS
): Map<string, string> {
  const map = new Map<string, string>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso) || fromIso > toIso) {
    return map;
  }
  const cur = new Date(`${fromIso}T00:00:00.000Z`);
  const end = new Date(`${toIso}T00:00:00.000Z`);
  while (cur.getTime() <= end.getTime()) {
    const iso = cur.toISOString().slice(0, 10);
    const name = defaultHolidayName(iso, settings);
    if (name) map.set(iso, name);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return map;
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
  } else if (params.range !== "yesterday" && params.date) {
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
  } else if (params.range !== "yesterday" && params.date) {
    q.set("date", params.date);
  }
  return q.toString();
}

export function buildAttendanceOverviewQuery(params: {
  range: AttendanceRange;
  date?: string;
  from?: string;
  to?: string;
}): string {
  const q = new URLSearchParams();
  q.set("range", params.range);
  if (params.range === "custom") {
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
  } else if (params.range !== "yesterday" && params.date) {
    q.set("date", params.date);
  }
  return q.toString();
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

export type SchoolSectionPctFilter = "all" | "below_75" | "no_records";

export function filterSchoolOverviewRows(
  sections: SchoolAttendanceSectionRow[],
  preset: SchoolSectionPctFilter
): SchoolAttendanceSectionRow[] {
  if (preset === "below_75") {
    return sections.filter((s) => s.attendancePct != null && s.attendancePct < 75);
  }
  if (preset === "no_records") {
    return sections.filter((s) => s.totalDays === 0);
  }
  return sections;
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
