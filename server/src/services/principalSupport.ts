import type { PrismaClient } from "@prisma/client";
import { resolveReportBounds } from "./attendanceReport.js";
import {
  type ActionSnap,
  type AttendanceFact,
  type MathsFact,
  type PrincipalActionKind,
  type PrincipalActionOutcome,
  type SpeakingFact,
  type StudentRef,
  type SupportArea,
  type SupportSettingsValues,
  type SupportView,
  DEFAULT_SUPPORT_SETTINGS,
  addIsoDays,
  assembleSupportRows,
  countByView,
  isMathsSubject,
  isSpeakingSubject,
  matchesView,
  pickLatestAction,
  pickLatestByStudent,
  pickLatestMathsPerSubject,
  pickWeakestMaths,
  subjectGapWarnings,
  utcDateIso,
} from "./principalSupportRules.js";

export type { SupportRow, SupportSettingsValues, SupportView } from "./principalSupportRules.js";

function isoDate(d: Date): string {
  return utcDateIso(d);
}

function recorderName(user: {
  email: string | null;
  admin: { fullName: string } | null;
  principal: { fullName: string } | null;
} | null): string | null {
  return user?.principal?.fullName ?? user?.admin?.fullName ?? user?.email ?? null;
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class SupportError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getSupportSettings(prisma: PrismaClient): Promise<SupportSettingsValues> {
  const row = await prisma.supportSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", ...DEFAULT_SUPPORT_SETTINGS },
  });
  return {
    speakingMaxLevelOrder: row.speakingMaxLevelOrder,
    mathsBelowPct: row.mathsBelowPct,
    attendanceBelowPct: row.attendanceBelowPct,
    recheckDays: row.recheckDays,
  };
}

export async function updateSupportSettings(
  prisma: PrismaClient,
  values: SupportSettingsValues
): Promise<SupportSettingsValues> {
  const row = await prisma.supportSettings.upsert({
    where: { id: "default" },
    update: values,
    create: { id: "default", ...values },
  });
  return {
    speakingMaxLevelOrder: row.speakingMaxLevelOrder,
    mathsBelowPct: row.mathsBelowPct,
    attendanceBelowPct: row.attendanceBelowPct,
    recheckDays: row.recheckDays,
  };
}

function monthRange(today: string): { from: Date; toExclusive: Date; fromIso: string; toIso: string } {
  const bounds = resolveReportBounds({ range: "monthly", anchorDate: today });
  if ("error" in bounds) {
    throw new SupportError(500, bounds.error);
  }
  const endInclusive = new Date(bounds.toExclusive);
  endInclusive.setUTCDate(endInclusive.getUTCDate() - 1);
  const endIso = isoDate(endInclusive);
  return {
    from: bounds.from,
    toExclusive: bounds.toExclusive,
    fromIso: isoDate(bounds.from),
    toIso: endIso < today ? endIso : today,
  };
}

async function loadFacts(
  prisma: PrismaClient,
  students: StudentRef[],
  today: string
): Promise<{
  speakingByStudent: Map<string, SpeakingFact>;
  mathsByStudent: Map<string, MathsFact>;
  attendanceByStudent: Map<string, AttendanceFact>;
  latestAction: Map<string, ActionSnap>;
  attendanceRange: { from: string; to: string };
  warnings: string[];
}> {
  const ids = students.map((s) => s.id);
  const range = monthRange(today);
  if (ids.length === 0) {
    return {
      speakingByStudent: new Map(),
      mathsByStudent: new Map(),
      attendanceByStudent: new Map(),
      latestAction: new Map(),
      attendanceRange: { from: range.fromIso, to: range.toIso },
      warnings: [],
    };
  }

  const subjects = await prisma.subject.findMany({ select: { id: true, name: true, code: true } });
  const speakingIds = subjects.filter(isSpeakingSubject).map((s) => s.id);
  const mathsIds = subjects.filter(isMathsSubject).map((s) => s.id);

  const [oral, marks, attendanceEntries, actions] = await Promise.all([
    speakingIds.length
      ? prisma.classroomAssessmentEntry.findMany({
          where: {
            absent: false,
            studentId: { in: ids },
            session: { kind: "ORAL", subjectId: { in: speakingIds } },
          },
          orderBy: [{ session: { date: "desc" } }, { createdAt: "desc" }],
          select: {
            studentId: true,
            judgedLevel: { select: { order: true, name: true } },
            session: { select: { date: true, subject: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    mathsIds.length
      ? prisma.classroomAssessmentEntry.findMany({
          where: {
            absent: false,
            percentage: { not: null },
            studentId: { in: ids },
            session: { kind: "MARKS", subjectId: { in: mathsIds } },
          },
          orderBy: [{ session: { date: "desc" } }, { createdAt: "desc" }],
          select: {
            studentId: true,
            percentage: true,
            session: {
              select: {
                date: true,
                subjectId: true,
                subject: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.attendanceEntry.findMany({
      where: {
        studentId: { in: ids },
        session: { date: { gte: range.from, lt: range.toExclusive } },
      },
      select: { studentId: true, status: true },
    }),
    prisma.principalAction.findMany({
      where: { studentId: { in: ids } },
      orderBy: { createdAt: "desc" },
      include: {
        recordedBy: { select: { email: true, admin: { select: { fullName: true } }, principal: { select: { fullName: true } } } },
      },
    }),
  ]);

  const speakingByStudent = pickLatestByStudent(
    oral.map((e) => ({
      studentId: e.studentId,
      levelOrder: e.judgedLevel?.order ?? null,
      levelName: e.judgedLevel?.name ?? null,
      date: isoDate(e.session.date),
      subjectName: e.session.subject.name,
    }))
  );

  const mathsRows: MathsFact[] = marks
    .filter((e) => e.percentage != null)
    .map((e) => ({
      studentId: e.studentId,
      subjectId: e.session.subjectId,
      subjectName: e.session.subject.name,
      percentage: e.percentage as number,
      date: isoDate(e.session.date),
    }));
  const mathsByStudent = pickWeakestMaths(pickLatestMathsPerSubject(mathsRows));

  const attendanceByStudent = new Map<string, AttendanceFact>();
  for (const entry of attendanceEntries) {
    const cur = attendanceByStudent.get(entry.studentId) ?? { studentId: entry.studentId, present: 0, absent: 0 };
    if (entry.status === "PRESENT") cur.present += 1;
    else if (entry.status === "ABSENT") cur.absent += 1;
    attendanceByStudent.set(entry.studentId, cur);
  }

  const latestAction = pickLatestAction(
    actions.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      area: a.area,
      actionKind: a.actionKind,
      note: a.note,
      snapshotLabel: a.snapshotLabel,
      snapshotValue: a.snapshotValue,
      recheckOn: isoDate(a.recheckOn),
      outcome: a.outcome,
      outcomeNote: a.outcomeNote,
      outcomeLabel: a.outcomeLabel,
      createdAt: a.createdAt.toISOString(),
      recordedByName: recorderName(a.recordedBy),
    }))
  );

  return {
    speakingByStudent,
    mathsByStudent,
    attendanceByStudent,
    latestAction,
    attendanceRange: { from: range.fromIso, to: range.toIso },
    warnings: subjectGapWarnings(subjects),
  };
}

async function studentsInScope(
  prisma: PrismaClient,
  classId?: string,
  sectionId?: string
): Promise<StudentRef[]> {
  const students = await prisma.student.findMany({
    where: {
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
    },
    select: {
      id: true,
      fullName: true,
      classId: true,
      sectionId: true,
      user: { select: { studentLoginId: true } },
      schoolClass: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: { fullName: "asc" },
  });
  return students.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    studentLoginId: s.user.studentLoginId,
    classId: s.classId,
    className: s.schoolClass.name,
    sectionId: s.sectionId,
    sectionName: s.section.name,
  }));
}

export async function loadSupportBoard(
  prisma: PrismaClient,
  input: { classId?: string; sectionId?: string; area?: SupportArea; view: SupportView; today?: string }
) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const settings = await getSupportSettings(prisma);
  const students = await studentsInScope(prisma, input.classId, input.sectionId);
  const facts = await loadFacts(prisma, students, today);
  const allRows = assembleSupportRows({
    students,
    speakingByStudent: facts.speakingByStudent,
    mathsByStudent: facts.mathsByStudent,
    attendanceByStudent: facts.attendanceByStudent,
    latestAction: facts.latestAction,
    settings,
    today,
    attendanceRange: facts.attendanceRange,
    area: input.area,
  });
  return {
    today,
    attendanceFrom: facts.attendanceRange.from,
    attendanceTo: facts.attendanceRange.to,
    settings,
    warnings: facts.warnings,
    counts: countByView(allRows),
    rows: allRows.filter((row) => matchesView(input.view, row.status)),
  };
}

async function signalFor(
  prisma: PrismaClient,
  studentId: string,
  area: SupportArea,
  today: string
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      fullName: true,
      classId: true,
      sectionId: true,
      user: { select: { studentLoginId: true } },
      schoolClass: { select: { name: true } },
      section: { select: { name: true } },
    },
  });
  if (!student) throw new SupportError(404, "Student not found");
  const settings = await getSupportSettings(prisma);
  const ref: StudentRef = {
    id: student.id,
    fullName: student.fullName,
    studentLoginId: student.user.studentLoginId,
    classId: student.classId,
    className: student.schoolClass.name,
    sectionId: student.sectionId,
    sectionName: student.section.name,
  };
  const facts = await loadFacts(prisma, [ref], today);
  const rows = assembleSupportRows({
    students: [ref],
    speakingByStudent: facts.speakingByStudent,
    mathsByStudent: facts.mathsByStudent,
    attendanceByStudent: facts.attendanceByStudent,
    latestAction: facts.latestAction,
    settings,
    today,
    attendanceRange: facts.attendanceRange,
    area,
  });
  return { settings, row: rows[0] ?? null };
}

export async function recordPrincipalAction(
  prisma: PrismaClient,
  input: {
    studentId: string;
    area: SupportArea;
    actionKind: PrincipalActionKind;
    note?: string | null;
    recheckOn?: string;
    recordedById: string;
    today?: string;
  }
) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const { settings, row } = await signalFor(prisma, input.studentId, input.area, today);
  if (!row) throw new SupportError(400, "No current result for this area.");
  if (!row.weak) throw new SupportError(400, "This student is above the cut-off in this area.");
  const recheckIso = input.recheckOn ?? addIsoDays(today, settings.recheckDays);
  const recheck = parseIsoDate(recheckIso);
  if (!recheck) throw new SupportError(400, "Recheck date must be YYYY-MM-DD.");
  if (recheckIso < today) throw new SupportError(400, "Recheck date cannot be before today.");
  const snapshotDate = row.metricDate ? parseIsoDate(row.metricDate) : null;
  const created = await prisma.principalAction.create({
    data: {
      studentId: input.studentId,
      area: input.area,
      actionKind: input.actionKind,
      note: input.note?.trim() ? input.note.trim() : null,
      snapshotLabel: row.metricLabel,
      snapshotValue: row.metricValue,
      snapshotDate,
      recheckOn: recheck,
      recordedById: input.recordedById,
    },
  });
  return { id: created.id };
}

export async function closePrincipalAction(
  prisma: PrismaClient,
  input: {
    actionId: string;
    outcome: Exclude<PrincipalActionOutcome, "OPEN">;
    note?: string | null;
    today?: string;
  }
) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const action = await prisma.principalAction.findUnique({ where: { id: input.actionId } });
  if (!action) throw new SupportError(404, "Action not found");
  if (action.outcome !== "OPEN") throw new SupportError(400, "This action already has an outcome.");
  const { row } = await signalFor(prisma, action.studentId, action.area, today);
  const updated = await prisma.principalAction.update({
    where: { id: action.id },
    data: {
      outcome: input.outcome,
      outcomeNote: input.note?.trim() ? input.note.trim() : null,
      outcomeValue: row?.metricValue ?? null,
      outcomeLabel: row?.metricLabel ?? "No current result",
      outcomeRecordedAt: new Date(),
    },
  });
  return { id: updated.id, outcome: updated.outcome };
}

export async function listPrincipalActionHistory(prisma: PrismaClient, studentId: string, area: SupportArea) {
  const actions = await prisma.principalAction.findMany({
    where: { studentId, area },
    orderBy: { createdAt: "desc" },
    include: {
      recordedBy: { select: { email: true, admin: { select: { fullName: true } }, principal: { select: { fullName: true } } } },
    },
  });
  return actions.map((a) => ({
    id: a.id,
    actionKind: a.actionKind,
    note: a.note,
    snapshotLabel: a.snapshotLabel,
    recheckOn: isoDate(a.recheckOn),
    outcome: a.outcome,
    outcomeNote: a.outcomeNote,
    outcomeLabel: a.outcomeLabel,
    createdAt: a.createdAt.toISOString(),
    outcomeRecordedAt: a.outcomeRecordedAt?.toISOString() ?? null,
    recordedByName: recorderName(a.recordedBy),
  }));
}
