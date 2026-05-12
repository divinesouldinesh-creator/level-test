import { AttendanceStatus, PrismaClient } from "@prisma/client";

export type AttendanceRange = "daily" | "weekly" | "monthly";

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

function rangeBounds(anchor: Date, range: AttendanceRange): { from: Date; toExclusive: Date } {
  if (range === "daily") {
    const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
    return { from, toExclusive: addDaysUtc(from, 1) };
  }
  if (range === "weekly") {
    const from = startOfWeekUtc(anchor);
    return { from, toExclusive: addDaysUtc(from, 7) };
  }
  const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const toExclusive = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  return { from, toExclusive };
}

export async function attendanceReportForStudent(
  prisma: PrismaClient,
  studentId: string,
  range: AttendanceRange,
  anchorDate?: string
) {
  const anchor = parseAnchorDate(anchorDate);
  const { from, toExclusive } = rangeBounds(anchor, range);

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
  let late = 0;
  let leave = 0;
  for (const e of entries) {
    if (e.status === AttendanceStatus.PRESENT) present += 1;
    else if (e.status === AttendanceStatus.ABSENT) absent += 1;
    else if (e.status === AttendanceStatus.LATE) late += 1;
    else if (e.status === AttendanceStatus.LEAVE) leave += 1;
  }
  const total = entries.length;
  const attendancePct = total > 0 ? Math.round(((present + late) * 1000) / total) / 10 : null;

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
    range,
    from: from.toISOString().slice(0, 10),
    to: addDaysUtc(toExclusive, -1).toISOString().slice(0, 10),
    summary: {
      totalDays: total,
      present,
      absent,
      late,
      leave,
      attendancePct,
    },
    records: entries.map((e) => ({
      date: e.session.date.toISOString().slice(0, 10),
      status: e.status,
      remark: e.remark ?? "",
      notes: e.session.notes ?? "",
    })),
  };
}
