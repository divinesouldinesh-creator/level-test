export const SUPPORT_AREAS = ["SPEAKING", "MATHS", "ATTENDANCE"] as const;
export type SupportArea = (typeof SUPPORT_AREAS)[number];

export const ACTION_KINDS = [
  "SPOKE_TO_TEACHER",
  "CALLED_PARENT",
  "PARENT_MEETING",
  "EXTRA_PRACTICE",
  "ATTENDANCE_WARNING",
  "RECHECK_SCHEDULED",
] as const;
export type PrincipalActionKind = (typeof ACTION_KINDS)[number];

export type PrincipalActionOutcome = "OPEN" | "IMPROVED" | "STILL_NEEDS_SUPPORT";

export type RowStatus = "no_action" | "action_recorded" | "recheck_due" | "still_needs_support" | "improved";

export type SupportView = "needs_support" | "no_action" | "recheck_due" | "improved";

export type SupportSettingsValues = {
  speakingMaxLevelOrder: number;
  mathsBelowPct: number;
  attendanceBelowPct: number;
  recheckDays: number;
};

/** Skip attendance until there are enough marked days to judge it. */
export const MIN_ATTENDANCE_MARKS = 5;

export const DEFAULT_SUPPORT_SETTINGS: SupportSettingsValues = {
  speakingMaxLevelOrder: 0,
  mathsBelowPct: 40,
  attendanceBelowPct: 75,
  recheckDays: 14,
};

export type StudentRef = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
};

export type SpeakingFact = {
  studentId: string;
  levelOrder: number | null;
  levelName: string | null;
  date: string;
  subjectName: string;
};

export type MathsFact = {
  studentId: string;
  subjectId: string;
  subjectName: string;
  percentage: number;
  date: string;
};

export type AttendanceFact = {
  studentId: string;
  present: number;
  absent: number;
};

export type ActionSnap = {
  id: string;
  studentId: string;
  area: SupportArea;
  actionKind: PrincipalActionKind;
  note: string | null;
  snapshotLabel: string;
  snapshotValue: number | null;
  recheckOn: string;
  outcome: PrincipalActionOutcome;
  outcomeNote: string | null;
  outcomeLabel: string | null;
  createdAt: string;
  recordedByName: string | null;
};

export type SupportRow = {
  studentId: string;
  fullName: string;
  studentLoginId: string | null;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  area: SupportArea;
  weak: boolean;
  status: RowStatus;
  metricLabel: string;
  metricValue: number | null;
  metricDate: string | null;
  latestAction: ActionSnap | null;
};

const AREA_ORDER: Record<SupportArea, number> = { SPEAKING: 0, MATHS: 1, ATTENDANCE: 2 };
const STATUS_ORDER: Record<RowStatus, number> = {
  no_action: 0,
  recheck_due: 1,
  still_needs_support: 2,
  action_recorded: 3,
  improved: 4,
};

export function isSpeakingSubject(subject: { name: string; code: string | null }): boolean {
  const code = (subject.code ?? "").toUpperCase();
  return code === "SPEAK" || subject.name.trim().toLowerCase() === "speaking";
}

export function isMathsSubject(subject: { name: string; code: string | null }): boolean {
  const code = (subject.code ?? "").toUpperCase();
  if (code === "MATH" || code === "MATHS") return true;
  return /math/i.test(subject.name);
}

export function attendancePercent(present: number, absent: number): number | null {
  const total = present + absent;
  if (total <= 0) return null;
  return Math.round((present * 1000) / total) / 10;
}

export function formatPct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function utcDateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function actionKey(studentId: string, area: SupportArea): string {
  return `${studentId}:${area}`;
}

export function pickLatestByStudent<T extends { studentId: string }>(rowsNewestFirst: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rowsNewestFirst) {
    if (!map.has(row.studentId)) map.set(row.studentId, row);
  }
  return map;
}

export function pickLatestMathsPerSubject(rowsNewestFirst: MathsFact[]): MathsFact[] {
  const seen = new Set<string>();
  const out: MathsFact[] = [];
  for (const row of rowsNewestFirst) {
    const key = `${row.studentId}:${row.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Lowest latest maths score per student. */
export function pickWeakestMaths(latestPerSubject: MathsFact[]): Map<string, MathsFact> {
  const map = new Map<string, MathsFact>();
  for (const row of latestPerSubject) {
    const cur = map.get(row.studentId);
    if (!cur || row.percentage < cur.percentage) map.set(row.studentId, row);
  }
  return map;
}

export function pickLatestAction(actionsNewestFirst: ActionSnap[]): Map<string, ActionSnap> {
  const map = new Map<string, ActionSnap>();
  for (const action of actionsNewestFirst) {
    const key = actionKey(action.studentId, action.area);
    if (!map.has(key)) map.set(key, action);
  }
  return map;
}

export function describeSpeaking(
  fact: SpeakingFact,
  maxLevelOrder: number
): { weak: boolean; label: string; value: number | null; date: string } {
  const weak = fact.levelOrder == null || fact.levelOrder <= maxLevelOrder;
  const label =
    fact.levelOrder == null
      ? `No speaking level on ${fact.date}`
      : fact.levelName
        ? `${fact.levelName} on ${fact.date}`
        : `Speaking level ${fact.levelOrder} on ${fact.date}`;
  return { weak, label, value: fact.levelOrder, date: fact.date };
}

export function describeMaths(
  fact: MathsFact,
  belowPct: number
): { weak: boolean; label: string; value: number; date: string } {
  const weak = fact.percentage < belowPct;
  return {
    weak,
    label: `Maths ${formatPct(fact.percentage)}% in ${fact.subjectName} on ${fact.date}`,
    value: fact.percentage,
    date: fact.date,
  };
}

export function describeAttendance(
  fact: AttendanceFact,
  belowPct: number,
  range: { from: string; to: string }
): { weak: boolean; label: string; value: number; date: string } | null {
  const total = fact.present + fact.absent;
  if (total < MIN_ATTENDANCE_MARKS) return null;
  const pct = attendancePercent(fact.present, fact.absent);
  if (pct == null) return null;
  const weak = pct < belowPct;
  return {
    weak,
    label: `Attendance ${formatPct(pct)}% (${fact.present} present, ${fact.absent} absent, ${range.from} to ${range.to})`,
    value: pct,
    date: range.to,
  };
}

export function statusFor(weak: boolean, latest: ActionSnap | null, today: string): RowStatus | null {
  if (!weak) {
    if (!latest) return null;
    return "improved";
  }
  if (!latest) return "no_action";
  if (latest.outcome === "OPEN") {
    return latest.recheckOn <= today ? "recheck_due" : "action_recorded";
  }
  return "still_needs_support";
}

export function matchesView(view: SupportView, status: RowStatus): boolean {
  if (view === "needs_support") return status !== "improved";
  if (view === "no_action") return status === "no_action";
  if (view === "recheck_due") return status === "recheck_due";
  return status === "improved";
}

export function countByView(rows: SupportRow[]): {
  needsSupport: number;
  noAction: number;
  recheckDue: number;
  improved: number;
} {
  let needsSupport = 0;
  let noAction = 0;
  let recheckDue = 0;
  let improved = 0;
  for (const row of rows) {
    if (row.status === "improved") improved += 1;
    else needsSupport += 1;
    if (row.status === "no_action") noAction += 1;
    if (row.status === "recheck_due") recheckDue += 1;
  }
  return { needsSupport, noAction, recheckDue, improved };
}

export function assembleSupportRows(input: {
  students: StudentRef[];
  speakingByStudent: Map<string, SpeakingFact>;
  mathsByStudent: Map<string, MathsFact>;
  attendanceByStudent: Map<string, AttendanceFact>;
  latestAction: Map<string, ActionSnap>;
  settings: SupportSettingsValues;
  today: string;
  attendanceRange: { from: string; to: string };
  area?: SupportArea;
}): SupportRow[] {
  const rows: SupportRow[] = [];
  for (const student of input.students) {
    const candidates: Array<{
      area: SupportArea;
      described: { weak: boolean; label: string; value: number | null; date: string };
    }> = [];

    const speaking = input.speakingByStudent.get(student.id);
    if (speaking) {
      candidates.push({
        area: "SPEAKING",
        described: describeSpeaking(speaking, input.settings.speakingMaxLevelOrder),
      });
    }
    const maths = input.mathsByStudent.get(student.id);
    if (maths) {
      candidates.push({ area: "MATHS", described: describeMaths(maths, input.settings.mathsBelowPct) });
    }
    const attendance = input.attendanceByStudent.get(student.id);
    if (attendance) {
      const described = describeAttendance(attendance, input.settings.attendanceBelowPct, input.attendanceRange);
      if (described) candidates.push({ area: "ATTENDANCE", described });
    }

    for (const item of candidates) {
      if (input.area && item.area !== input.area) continue;
      const latest = input.latestAction.get(actionKey(student.id, item.area)) ?? null;
      const status = statusFor(item.described.weak, latest, input.today);
      if (!status) continue;
      rows.push({
        studentId: student.id,
        fullName: student.fullName,
        studentLoginId: student.studentLoginId,
        classId: student.classId,
        className: student.className,
        sectionId: student.sectionId,
        sectionName: student.sectionName,
        area: item.area,
        weak: item.described.weak,
        status,
        metricLabel: item.described.label,
        metricValue: item.described.value,
        metricDate: item.described.date,
        latestAction: latest,
      });
    }
  }

  rows.sort((a, b) => {
    const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (status !== 0) return status;
    const klass = a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName);
    if (klass !== 0) return klass;
    const name = a.fullName.localeCompare(b.fullName);
    if (name !== 0) return name;
    return AREA_ORDER[a.area] - AREA_ORDER[b.area];
  });
  return rows;
}

export function subjectGapWarnings(subjects: { name: string; code: string | null }[]): string[] {
  const warnings: string[] = [];
  if (!subjects.some(isSpeakingSubject)) {
    warnings.push("No Speaking subject found, so speaking level 0 cannot be listed.");
  }
  if (!subjects.some(isMathsSubject)) {
    warnings.push("No Maths subject found, so low maths scores cannot be listed.");
  }
  return warnings;
}
