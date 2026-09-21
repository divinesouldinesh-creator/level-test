import { randomUUID } from "crypto";
import type { FeeChargeKind, FeePaymentMode, Prisma, PrismaClient } from "@prisma/client";
import { classLabelForDisplay } from "./studentAccounts.js";
import { istDayKey } from "./engagementCalendar.js";

const memberInclude = {
  student: {
    include: {
      schoolClass: true,
      section: true,
      user: { select: { studentLoginId: true } },
    },
  },
} as const;

export function academicYearKey(dayKey = istDayKey()): string {
  const [y, m] = dayKey.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function monthPeriodKey(dayKey = istDayKey()): string {
  return dayKey.slice(0, 7);
}

export function monthLabel(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  if (!y || !m) return periodKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function chargeKindLabel(kind: FeeChargeKind): string {
  switch (kind) {
    case "MONTHLY":
      return "Monthly fee";
    case "ANNUAL":
      return "Annual charges";
    case "ADMISSION":
      return "Admission";
    case "EXAM":
      return "Exam fee";
    case "OPENING":
      return "Opening / previous due";
    default:
      return "Other";
  }
}

type StructureRow = {
  classId: string;
  tuitionAmount: number;
  transportAmount: number;
  annualAmount: number;
  admissionAmount: number;
  examAmount: number;
};

function monthlyForStudent(structure: StructureRow | undefined, usesTransport: boolean): number {
  if (!structure) return 0;
  return structure.tuitionAmount + (usesTransport ? structure.transportAmount : 0);
}

async function structuresByClass(
  db: PrismaClient | Prisma.TransactionClient,
  academicYear: string,
  classIds: string[]
): Promise<Map<string, StructureRow>> {
  if (!classIds.length) return new Map();
  const rows = await db.feeStructure.findMany({
    where: { academicYear, classId: { in: [...new Set(classIds)] } },
  });
  return new Map(rows.map((r) => [r.classId, r]));
}

export async function ensureStudentFeeAccount(
  db: PrismaClient | Prisma.TransactionClient,
  studentId: string
): Promise<string> {
  const existing = await db.feeAccountMember.findUnique({
    where: { studentId },
    select: { feeAccountId: true },
  });
  if (existing) return existing.feeAccountId;
  const account = await db.feeAccount.create({
    data: {
      members: { create: { studentId } },
    },
    select: { id: true },
  });
  return account.id;
}

export async function ensureAccountsForAllStudents(db: PrismaClient): Promise<number> {
  const [students, members] = await Promise.all([
    db.student.findMany({ select: { id: true } }),
    db.feeAccountMember.findMany({ select: { studentId: true } }),
  ]);
  const have = new Set(members.map((m) => m.studentId));
  const missing = students.filter((s) => !have.has(s.id));
  for (const s of missing) {
    await ensureStudentFeeAccount(db, s.id);
  }
  return missing.length;
}

type MemberWithStudent = Prisma.FeeAccountMemberGetPayload<{ include: typeof memberInclude }>;

function memberView(member: MemberWithStudent, structure: StructureRow | undefined) {
  const s = member.student;
  const classTuition = structure?.tuitionAmount ?? 0;
  const classTransport = structure?.transportAmount ?? 0;
  return {
    studentId: s.id,
    fullName: s.fullName,
    studentLoginId: s.user.studentLoginId,
    classId: s.classId,
    className: s.schoolClass.name,
    classLabel: classLabelForDisplay(s.schoolClass),
    sectionName: s.section.name,
    usesTransport: member.usesTransport,
    classTuition,
    classTransport,
    monthlyFee: monthlyForStudent(structure, member.usesTransport),
  };
}

export async function feeAccountSnapshot(
  db: PrismaClient,
  studentId: string,
  opts?: { academicYear?: string; monthPeriod?: string }
) {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true },
  });
  if (!student) return null;

  const accountId = await ensureStudentFeeAccount(db, studentId);
  const academicYear = opts?.academicYear ?? academicYearKey();
  const monthPeriod = opts?.monthPeriod ?? monthPeriodKey();

  const account = await db.feeAccount.findUnique({
    where: { id: accountId },
    include: {
      members: { include: memberInclude, orderBy: { createdAt: "asc" } },
      charges: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      payments: { orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!account) return null;

  const classIds = account.members.map((m) => m.student.classId);
  const structureMap = await structuresByClass(db, academicYear, classIds);
  const members = account.members.map((m) => memberView(m, structureMap.get(m.student.classId)));
  const familyMonthlyFee = members.reduce((sum, m) => sum + m.monthlyFee, 0);
  const charged = account.charges.reduce((sum, c) => sum + c.amount, 0);
  const paid = account.payments.reduce((sum, p) => sum + p.amount, 0);
  const missingStructure = members.some((m) => m.classTuition === 0 && m.classTransport === 0 && !structureMap.has(m.classId));

  type LedgerItem = {
    id: string;
    type: "charge" | "payment";
    date: string;
    sortAt: number;
    particular: string;
    debit: number;
    credit: number;
  };

  const items: LedgerItem[] = [];
  for (const c of account.charges) {
    const date =
      c.kind === "MONTHLY" && /^\d{4}-\d{2}$/.test(c.periodKey) ? `${c.periodKey}-01` : c.createdAt.toISOString().slice(0, 10);
    items.push({
      id: c.id,
      type: "charge",
      date,
      sortAt: c.createdAt.getTime(),
      particular: c.note?.trim() || `${chargeKindLabel(c.kind)}${c.kind === "MONTHLY" ? ` — ${monthLabel(c.periodKey)}` : ""}`,
      debit: c.amount,
      credit: 0,
    });
  }
  for (const p of account.payments) {
    items.push({
      id: p.id,
      type: "payment",
      date: p.paidOn,
      sortAt: p.createdAt.getTime(),
      particular: `Payment ${p.receiptNo} (${p.mode})`,
      debit: 0,
      credit: p.amount,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.sortAt - b.sortAt);

  let running = 0;
  const ledger = items.map((row) => {
    running += row.debit - row.credit;
    return {
      id: row.id,
      type: row.type,
      date: row.date,
      particular: row.particular,
      debit: row.debit,
      credit: row.credit,
      balance: running,
    };
  });

  return {
    studentId,
    accountId: account.id,
    parentName: account.parentName,
    phone: account.phone,
    academicYear,
    monthPeriod,
    monthLabel: monthLabel(monthPeriod),
    members,
    familyMonthlyFee,
    missingStructure,
    monthCharged: account.charges.some((c) => c.kind === "MONTHLY" && c.periodKey === monthPeriod),
    charged,
    paid,
    balance: charged - paid,
    charges: account.charges.map((c) => ({
      id: c.id,
      kind: c.kind,
      periodKey: c.periodKey,
      amount: c.amount,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
    })),
    payments: account.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      mode: p.mode,
      receiptNo: p.receiptNo,
      paidOn: p.paidOn,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
    })),
    ledger,
  };
}

export async function listFeeStructures(db: PrismaClient, academicYear: string) {
  const classes = await db.schoolClass.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, grade: true },
  });
  const rows = await db.feeStructure.findMany({ where: { academicYear } });
  const byClass = new Map(rows.map((r) => [r.classId, r]));
  return {
    academicYear,
    structures: classes.map((c) => {
      const row = byClass.get(c.id);
      return {
        classId: c.id,
        className: c.name,
        classLabel: classLabelForDisplay(c),
        tuitionAmount: row?.tuitionAmount ?? 0,
        transportAmount: row?.transportAmount ?? 0,
        annualAmount: row?.annualAmount ?? 0,
        admissionAmount: row?.admissionAmount ?? 0,
        examAmount: row?.examAmount ?? 0,
      };
    }),
  };
}

export async function saveFeeStructures(
  db: PrismaClient,
  academicYear: string,
  items: Array<{
    classId: string;
    tuitionAmount: number;
    transportAmount: number;
    annualAmount: number;
    admissionAmount: number;
    examAmount: number;
  }>
) {
  const classIds = items.map((i) => i.classId);
  const existing = await db.schoolClass.findMany({
    where: { id: { in: classIds } },
    select: { id: true },
  });
  const ok = new Set(existing.map((c) => c.id));
  await db.$transaction(
    items
      .filter((i) => ok.has(i.classId))
      .map((i) =>
        db.feeStructure.upsert({
          where: { academicYear_classId: { academicYear, classId: i.classId } },
          create: {
            academicYear,
            classId: i.classId,
            tuitionAmount: i.tuitionAmount,
            transportAmount: i.transportAmount,
            annualAmount: i.annualAmount,
            admissionAmount: i.admissionAmount,
            examAmount: i.examAmount,
          },
          update: {
            tuitionAmount: i.tuitionAmount,
            transportAmount: i.transportAmount,
            annualAmount: i.annualAmount,
            admissionAmount: i.admissionAmount,
            examAmount: i.examAmount,
          },
        })
      )
  );
  return listFeeStructures(db, academicYear);
}

function familyMonthlyNote(
  members: ReturnType<typeof memberView>[],
  periodKey: string
): { note: string; detailJson: string; amount: number } {
  const amount = members.reduce((sum, m) => sum + m.monthlyFee, 0);
  const parts = members.map((m) => `${m.fullName} (${m.classLabel} ${m.sectionName}) ₹${m.monthlyFee}`);
  const note =
    members.length > 1
      ? `${monthLabel(periodKey)} family fee ₹${amount} — ${parts.join(" + ")}`
      : `${monthLabel(periodKey)} fee — ${parts[0] ?? "₹0"}`;
  return {
    amount,
    note,
    detailJson: JSON.stringify(
      members.map((m) => ({
        studentId: m.studentId,
        monthlyFee: m.monthlyFee,
        tuition: m.classTuition,
        transport: m.usesTransport ? m.classTransport : 0,
      }))
    ),
  };
}

export async function upsertMonthlyCharge(
  db: PrismaClient | Prisma.TransactionClient,
  feeAccountId: string,
  academicYear: string,
  periodKey: string,
  createdById?: string
) {
  const account = await db.feeAccount.findUnique({
    where: { id: feeAccountId },
    include: { members: { include: memberInclude } },
  });
  if (!account || account.members.length === 0) return { skipped: true as const, amount: 0 };
  const structureMap = await structuresByClass(
    db,
    academicYear,
    account.members.map((m) => m.student.classId)
  );
  const members = account.members.map((m) => memberView(m, structureMap.get(m.student.classId)));
  const { amount, note, detailJson } = familyMonthlyNote(members, periodKey);
  await db.feeCharge.upsert({
    where: {
      feeAccountId_kind_periodKey: { feeAccountId, kind: "MONTHLY", periodKey },
    },
    create: {
      feeAccountId,
      kind: "MONTHLY",
      periodKey,
      amount,
      note,
      detailJson,
      createdById,
    },
    update: { amount, note, detailJson },
  });
  return { skipped: false as const, amount };
}

export async function generateMonthForStudent(
  db: PrismaClient,
  studentId: string,
  params: { academicYear: string; periodKey: string; createdById?: string }
) {
  const student = await db.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) return { error: "Student not found" as const };
  const accountId = await ensureStudentFeeAccount(db, studentId);
  await upsertMonthlyCharge(db, accountId, params.academicYear, params.periodKey, params.createdById);
  return { ok: true as const };
}

export async function generateMonthlyFees(
  db: PrismaClient,
  params: { academicYear: string; periodKey: string; classId?: string; createdById?: string }
) {
  await ensureAccountsForAllStudents(db);
  const members = await db.feeAccountMember.findMany({
    where: params.classId ? { student: { classId: params.classId } } : {},
    select: { feeAccountId: true },
  });
  const accountIds = [...new Set(members.map((m) => m.feeAccountId))];
  let updated = 0;
  let totalAmount = 0;
  for (const feeAccountId of accountIds) {
    const result = await upsertMonthlyCharge(
      db,
      feeAccountId,
      params.academicYear,
      params.periodKey,
      params.createdById
    );
    if (!result.skipped) {
      updated += 1;
      totalAmount += result.amount;
    }
  }
  return { accounts: updated, totalAmount, periodKey: params.periodKey, academicYear: params.academicYear };
}

export async function addManualCharge(
  db: PrismaClient,
  params: {
    studentId: string;
    kind: Exclude<FeeChargeKind, "MONTHLY">;
    amount: number;
    note?: string;
    createdById?: string;
  }
) {
  const accountId = await ensureStudentFeeAccount(db, params.studentId);
  const academicYear = academicYearKey();
  const periodKey =
    params.kind === "OTHER" || params.kind === "OPENING"
      ? `${istDayKey()}:${randomUUID().slice(0, 8)}`
      : academicYear;
  const charge = await db.feeCharge.create({
    data: {
      feeAccountId: accountId,
      kind: params.kind,
      periodKey,
      amount: params.amount,
      note: params.note?.trim() || chargeKindLabel(params.kind),
      createdById: params.createdById,
    },
  }).catch((err: { code?: string }) => {
    if (err?.code === "P2002") return null;
    throw err;
  });
  if (!charge) return { error: "This charge is already on the family account for this year." as const };
  return charge;
}

async function nextReceiptNo(db: Prisma.TransactionClient, academicYear: string): Promise<string> {
  const row = await db.feeReceiptSeq.upsert({
    where: { academicYear },
    create: { academicYear, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `FEE-${academicYear}-${String(row.lastNumber).padStart(6, "0")}`;
}

export async function collectFeePayment(
  db: PrismaClient,
  params: {
    studentId: string;
    amount: number;
    mode: FeePaymentMode;
    paidOn: string;
    note?: string;
    createdById?: string;
  }
) {
  const student = await db.student.findUnique({ where: { id: params.studentId }, select: { id: true } });
  if (!student) return { error: "Student not found" as const };
  const accountId = await ensureStudentFeeAccount(db, params.studentId);
  const academicYear = academicYearKey(params.paidOn);
  const payment = await db.$transaction(async (tx) => {
    const receiptNo = await nextReceiptNo(tx, academicYear);
    return tx.feePayment.create({
      data: {
        feeAccountId: accountId,
        amount: params.amount,
        mode: params.mode,
        receiptNo,
        paidOn: params.paidOn,
        note: params.note?.trim() || null,
        recordedAgainstStudentId: params.studentId,
        createdById: params.createdById,
      },
    });
  });
  const snapshot = await feeAccountSnapshot(db, params.studentId);
  return { payment, snapshot };
}

export async function linkFeeSiblings(db: PrismaClient, studentId: string, siblingStudentId: string) {
  if (studentId === siblingStudentId) return { error: "Choose a different student" as const };
  const [a, b] = await Promise.all([
    db.student.findUnique({ where: { id: studentId }, select: { id: true } }),
    db.student.findUnique({ where: { id: siblingStudentId }, select: { id: true } }),
  ]);
  if (!a || !b) return { error: "Student not found" as const };

  const keepId = await ensureStudentFeeAccount(db, studentId);
  const mergeId = await ensureStudentFeeAccount(db, siblingStudentId);
  if (keepId === mergeId) return { error: "Already linked" as const };

  await db.$transaction(async (tx) => {
    await tx.feeAccountMember.updateMany({
      where: { feeAccountId: mergeId },
      data: { feeAccountId: keepId },
    });
    const incomingPayments = await tx.feePayment.findMany({ where: { feeAccountId: mergeId } });
    if (incomingPayments.length) {
      await tx.feePayment.updateMany({
        where: { feeAccountId: mergeId },
        data: { feeAccountId: keepId },
      });
    }
    const incomingCharges = await tx.feeCharge.findMany({ where: { feeAccountId: mergeId } });
    for (const charge of incomingCharges) {
      const existing = await tx.feeCharge.findUnique({
        where: {
          feeAccountId_kind_periodKey: {
            feeAccountId: keepId,
            kind: charge.kind,
            periodKey: charge.periodKey,
          },
        },
      });
      if (existing) {
        await tx.feeCharge.update({
          where: { id: existing.id },
          data: { amount: existing.amount + charge.amount },
        });
        await tx.feeCharge.delete({ where: { id: charge.id } });
      } else {
        await tx.feeCharge.update({
          where: { id: charge.id },
          data: { feeAccountId: keepId },
        });
      }
    }
    const leftover = await tx.feeAccount.findUnique({
      where: { id: mergeId },
      include: { members: true, charges: true, payments: true },
    });
    if (leftover && leftover.members.length === 0 && leftover.charges.length === 0 && leftover.payments.length === 0) {
      await tx.feeAccount.delete({ where: { id: mergeId } });
    }
  });

  const year = academicYearKey();
  const month = monthPeriodKey();
  await upsertMonthlyCharge(db, keepId, year, month);
  return { ok: true as const };
}

export async function unlinkFeeSibling(db: PrismaClient, studentId: string) {
  const member = await db.feeAccountMember.findUnique({
    where: { studentId },
    include: { feeAccount: { include: { members: true } } },
  });
  if (!member) return { error: "Fee account not found" as const };
  if (member.feeAccount.members.length < 2) return { error: "This student is not in a sibling group" as const };

  await db.$transaction(async (tx) => {
    const account = await tx.feeAccount.create({ data: {} });
    await tx.feeAccountMember.update({
      where: { studentId },
      data: { feeAccountId: account.id },
    });
  });
  return { ok: true as const };
}

export async function setStudentTransport(db: PrismaClient, studentId: string, usesTransport: boolean) {
  await ensureStudentFeeAccount(db, studentId);
  await db.feeAccountMember.update({
    where: { studentId },
    data: { usesTransport },
  });
  const accountId = (await db.feeAccountMember.findUnique({
    where: { studentId },
    select: { feeAccountId: true },
  }))!.feeAccountId;
  await upsertMonthlyCharge(db, accountId, academicYearKey(), monthPeriodKey());
}

export async function setFeeAccountContact(
  db: PrismaClient,
  studentId: string,
  data: { parentName?: string | null; phone?: string | null }
) {
  const accountId = await ensureStudentFeeAccount(db, studentId);
  await db.feeAccount.update({
    where: { id: accountId },
    data: {
      ...(data.parentName !== undefined ? { parentName: data.parentName?.trim() || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
    },
  });
}

export async function schoolFeeTotals(db: PrismaClient, opts?: { paidOn?: string }) {
  await ensureAccountsForAllStudents(db);
  const today = opts?.paidOn ?? istDayKey();
  const accounts = await db.feeAccount.findMany({
    where: { members: { some: {} } },
    include: {
      members: { include: memberInclude, orderBy: { createdAt: "asc" } },
      charges: { select: { amount: true } },
      payments: { select: { amount: true, paidOn: true } },
    },
  });

  let charged = 0;
  let paid = 0;
  let todayPaid = 0;
  let todayReceipts = 0;
  let siblingFamilyCount = 0;
  const pending: Array<{
    accountId: string;
    balance: number;
    charged: number;
    paid: number;
    members: { studentId: string; fullName: string; classLabel: string; sectionName: string }[];
  }> = [];

  for (const account of accounts) {
    if (account.members.length > 1) siblingFamilyCount += 1;
    const accountCharged = account.charges.reduce((sum, c) => sum + c.amount, 0);
    const accountPaid = account.payments.reduce((sum, p) => sum + p.amount, 0);
    charged += accountCharged;
    paid += accountPaid;
    for (const p of account.payments) {
      if (p.paidOn === today) {
        todayPaid += p.amount;
        todayReceipts += 1;
      }
    }
    const balance = accountCharged - accountPaid;
    if (balance !== 0) {
      pending.push({
        accountId: account.id,
        balance,
        charged: accountCharged,
        paid: accountPaid,
        members: account.members.map((m) => ({
          studentId: m.student.id,
          fullName: m.student.fullName,
          classLabel: classLabelForDisplay(m.student.schoolClass),
          sectionName: m.student.section.name,
        })),
      });
    }
  }

  pending.sort((a, b) => b.balance - a.balance);

  return {
    academicYear: academicYearKey(),
    today,
    accountCount: accounts.length,
    studentCount: accounts.reduce((sum, a) => sum + a.members.length, 0),
    siblingFamilyCount,
    charged,
    paid,
    balance: charged - paid,
    todayPaid,
    todayReceipts,
    pending,
  };
}

export async function listFeeCollections(db: PrismaClient, paidOn: string) {
  const payments = await db.feePayment.findMany({
    where: { paidOn },
    include: {
      feeAccount: {
        include: { members: { include: memberInclude } },
      },
      recordedAgainstStudent: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  return {
    paidOn,
    total,
    count: payments.length,
    payments: payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      amount: p.amount,
      mode: p.mode,
      paidOn: p.paidOn,
      recordedAgainst: p.recordedAgainstStudent?.fullName ?? null,
      members: p.feeAccount.members.map((m) => m.student.fullName),
    })),
  };
}
