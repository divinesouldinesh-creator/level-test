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

/** April through March for an academic year key such as 2026-27. */
export function sessionMonthKeys(academicYear: string): string[] {
  const start = Number(academicYear.slice(0, 4));
  if (!start) return [];
  const keys: string[] = [];
  for (let month = 4; month <= 12; month++) keys.push(`${start}-${String(month).padStart(2, "0")}`);
  for (let month = 1; month <= 3; month++) keys.push(`${start + 1}-${String(month).padStart(2, "0")}`);
  return keys;
}

function netAfterDiscount(gross: number, discount: number, waived = false): number {
  if (waived) return 0;
  return Math.max(0, gross - Math.max(0, discount));
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
    case "YEARLY":
      return "Yearly fee";
    case "ANNUAL":
      return "Annual charges";
    case "ADMISSION":
      return "Activity";
    case "EXAM":
      return "Exam fee";
    case "REGISTRATION":
      return "Registration";
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
  registrationAmount: number;
  examAmount: number;
};

function transportCharge(transportKm: number, ratePerKm: number): number {
  return Math.max(0, transportKm) * Math.max(0, ratePerKm);
}

function monthlyTransportAmount(transportRupees: number, transportKm: number, ratePerKm: number): number {
  if (transportKm > 0 && transportRupees === 0) return transportCharge(transportKm, ratePerKm);
  return Math.max(0, transportRupees);
}

function monthlyForStudent(structure: StructureRow | undefined, transportRupees: number, transportKm: number, ratePerKm: number): number {
  return (structure?.tuitionAmount ?? 0) + monthlyTransportAmount(transportRupees, transportKm, ratePerKm);
}

function classSeniority(schoolClass: { name: string; grade: string | null }): number {
  const label = classLabelForDisplay(schoolClass).trim().toLowerCase();
  const named: Record<string, number> = { nursery: -3, nur: -3, lkg: -2, ukg: -1, kg: -1 };
  if (named[label] != null) return named[label];
  const asNumber = Number(label);
  if (Number.isFinite(asNumber) && label !== "") return asNumber;
  const fromName = schoolClass.name.match(/(\d+)/);
  if (fromName) return Number(fromName[1]);
  return 0;
}

/** 1 child: full. 2: senior full, junior half. 3 or more: every child except the lowest class pays full; the lowest pays nothing. */
function siblingTuitionFactor(placeFromSenior: number, count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return placeFromSenior === 0 ? 1 : 0.5;
  return placeFromSenior === count - 1 ? 0 : 1;
}

async function transportRateForYear(
  db: PrismaClient | Prisma.TransactionClient,
  academicYear: string
): Promise<number> {
  const row = await db.feeYearSetting.findUnique({
    where: { academicYear },
    select: { transportRatePerKm: true },
  });
  return row?.transportRatePerKm ?? 0;
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

type MemberWithStudent = Prisma.FeeAccountMemberGetPayload<{ include: typeof memberInclude }>;

function memberView(member: MemberWithStudent, structure: StructureRow | undefined, ratePerKm: number) {
  const s = member.student;
  const classTuition = structure?.tuitionAmount ?? 0;
  const transportKm = member.transportKm;
  const transportAmount = monthlyTransportAmount(member.transportRupees, transportKm, ratePerKm);
  return {
    studentId: s.id,
    fullName: s.fullName,
    studentLoginId: s.user.studentLoginId,
    classId: s.classId,
    className: s.schoolClass.name,
    classLabel: classLabelForDisplay(s.schoolClass),
    sectionName: s.section.name,
    usesTransport: transportAmount > 0,
    transportKm,
    transportAmount,
    classTuition,
    monthlyFee: monthlyForStudent(structure, member.transportRupees, transportKm, ratePerKm),
  };
}

function familyMemberViews(
  rows: MemberWithStudent[],
  structureMap: Map<string, StructureRow>,
  ratePerKm: number
) {
  const ranked = [...rows].sort((a, b) => {
    const byClass = classSeniority(b.student.schoolClass) - classSeniority(a.student.schoolClass);
    if (byClass !== 0) return byClass;
    return a.studentId.localeCompare(b.studentId);
  });
  const factorByStudent = new Map(
    ranked.map((row, index) => [row.studentId, siblingTuitionFactor(index, ranked.length)])
  );
  return rows.map((row) => {
    const view = memberView(row, structureMap.get(row.student.classId), ratePerKm);
    const tuition = Math.round(view.classTuition * (factorByStudent.get(row.studentId) ?? 1));
    return { ...view, classTuition: tuition, monthlyFee: tuition + view.transportAmount };
  });
}

export async function feeAccountSnapshot(
  db: PrismaClient,
  studentId: string,
  opts?: { academicYear?: string; monthPeriod?: string; skipPost?: boolean }
) {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true },
  });
  if (!student) return null;

  const accountId = await ensureStudentFeeAccount(db, studentId);
  const academicYear = opts?.academicYear ?? academicYearKey();
  const monthPeriod = opts?.monthPeriod ?? monthPeriodKey();
  if (!opts?.skipPost) {
    await postDueMonthlyCharges(db, accountId, academicYear, monthPeriod);
    await postStandardOneTimeCharges(db, accountId, academicYear);
  }

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
  const [structureMap, transportRatePerKm] = await Promise.all([
    structuresByClass(db, academicYear, classIds),
    transportRateForYear(db, academicYear),
  ]);
  const members = familyMemberViews(account.members, structureMap, transportRatePerKm);
  const charged = account.charges.reduce((sum, c) => {
    if (c.kind === "MONTHLY" && c.periodKey > monthPeriod) return sum;
    return sum + c.amount;
  }, 0);
  const paid = account.payments.reduce((sum, p) => sum + p.amount, 0);
  const missingStructure = members.some((m) => !structureMap.has(m.classId));

  type LedgerItem = {
    id: string;
    type: "charge" | "payment";
    date: string;
    sortAt: number;
    particular: string;
    debit: number;
    credit: number;
  };

  const grossMonthly = members.reduce((sum, m) => sum + m.monthlyFee, 0);
  const monthlyDiscount = account.monthlyDiscount;
  const netMonthly = netAfterDiscount(grossMonthly, monthlyDiscount);
  const oneTimeGross = { annual: 0, registration: 0, admission: 0, exam: 0 };
  for (const member of account.members) {
    const structure = structureMap.get(member.student.classId);
    oneTimeGross.annual += structure?.annualAmount ?? 0;
    oneTimeGross.registration += structure?.registrationAmount ?? 0;
    oneTimeGross.admission += structure?.admissionAmount ?? 0;
    oneTimeGross.exam += structure?.examAmount ?? 0;
  }
  const postedOneTime = (kind: "ANNUAL" | "REGISTRATION" | "ADMISSION" | "EXAM") =>
    account.charges.find((c) => c.kind === kind && c.periodKey === academicYear)?.amount;
  const oneTimeNet = (gross: number, discount: number, waived: boolean, posted: number | undefined) => {
    if (waived) return 0;
    if (posted != null) return posted;
    return netAfterDiscount(gross, discount);
  };
  const concessions = {
    annual: {
      gross: oneTimeGross.annual,
      discount: account.annualDiscount,
      waived: account.waiveAnnual,
      net: oneTimeNet(oneTimeGross.annual, account.annualDiscount, account.waiveAnnual, postedOneTime("ANNUAL")),
    },
    registration: {
      gross: oneTimeGross.registration,
      discount: account.registrationDiscount,
      waived: account.waiveRegistration,
      net: oneTimeNet(oneTimeGross.registration, account.registrationDiscount, account.waiveRegistration, postedOneTime("REGISTRATION")),
    },
    admission: {
      gross: oneTimeGross.admission,
      discount: account.admissionDiscount,
      waived: account.waiveAdmission,
      net: oneTimeNet(oneTimeGross.admission, account.admissionDiscount, account.waiveAdmission, postedOneTime("ADMISSION")),
    },
    exam: {
      gross: oneTimeGross.exam,
      discount: account.examDiscount,
      waived: account.waiveExam,
      net: oneTimeNet(oneTimeGross.exam, account.examDiscount, account.waiveExam, postedOneTime("EXAM")),
    },
  };
  const sessionMonths = sessionMonthKeys(academicYear);
  const sessionReady =
    account.billingMode === "YEARLY"
      ? account.charges.some((c) => c.kind === "YEARLY" && c.periodKey === academicYear)
      : sessionMonths.every((key) => account.charges.some((c) => c.kind === "MONTHLY" && c.periodKey === key));

  const items: LedgerItem[] = [];
  for (const c of account.charges) {
    const sessionStart = /^\d{4}-\d{2}$/.test(c.periodKey) ? `${c.periodKey.slice(0, 4)}-04-01` : "";
    const date =
      c.kind === "MONTHLY" && /^\d{4}-\d{2}$/.test(c.periodKey)
        ? `${c.periodKey}-01`
        : c.kind === "YEARLY" || c.kind === "ANNUAL" || c.kind === "REGISTRATION" || c.kind === "ADMISSION" || c.kind === "EXAM"
          ? sessionStart || c.createdAt.toISOString().slice(0, 10)
          : c.createdAt.toISOString().slice(0, 10);
    items.push({
      id: c.id,
      type: "charge",
      date,
      sortAt: c.createdAt.getTime(),
      particular: c.note?.trim() || `${chargeKindLabel(c.kind)}${c.kind === "MONTHLY" ? ` — ${monthLabel(c.periodKey)}` : ""}`,
      debit: c.amount > 0 ? c.amount : 0,
      credit: c.amount < 0 ? -c.amount : 0,
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
    familyMonthlyFee: netMonthly,
    grossMonthly,
    monthlyDiscount,
    netMonthly,
    yearlyPayable: netMonthly * 12,
    billingMode: account.billingMode,
    discountEffectiveFrom: account.discountEffectiveFrom,
    concessions,
    sessionReady,
    transportRatePerKm,
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
  const [rows, transportRatePerKm] = await Promise.all([
    db.feeStructure.findMany({ where: { academicYear } }),
    transportRateForYear(db, academicYear),
  ]);
  const byClass = new Map(rows.map((r) => [r.classId, r]));
  return {
    academicYear,
    transportRatePerKm,
    structures: classes.map((c) => {
      const row = byClass.get(c.id);
      return {
        classId: c.id,
        className: c.name,
        classLabel: classLabelForDisplay(c),
        tuitionAmount: row?.tuitionAmount ?? 0,
        annualAmount: row?.annualAmount ?? 0,
        admissionAmount: row?.admissionAmount ?? 0,
        registrationAmount: row?.registrationAmount ?? 0,
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
    transportAmount?: number;
    annualAmount: number;
    admissionAmount: number;
    registrationAmount: number;
    examAmount: number;
  }>,
  transportRatePerKm = 0
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
            transportAmount: i.transportAmount ?? 0,
            annualAmount: i.annualAmount,
            admissionAmount: i.admissionAmount,
            registrationAmount: i.registrationAmount,
            examAmount: i.examAmount,
          },
          update: {
            tuitionAmount: i.tuitionAmount,
            ...(i.transportAmount != null ? { transportAmount: i.transportAmount } : {}),
            annualAmount: i.annualAmount,
            admissionAmount: i.admissionAmount,
            registrationAmount: i.registrationAmount,
            examAmount: i.examAmount,
          },
        })
      )
  );
  await db.feeYearSetting.upsert({
    where: { academicYear },
    create: { academicYear, transportRatePerKm },
    update: { transportRatePerKm },
  });
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
        transportKm: m.transportKm,
        transport: m.transportAmount,
      }))
    ),
  };
}

async function putSessionCharge(
  db: PrismaClient | Prisma.TransactionClient,
  data: {
    feeAccountId: string;
    kind: FeeChargeKind;
    periodKey: string;
    amount: number;
    note: string;
    detailJson?: string;
    createdById?: string;
  }
) {
  if (data.amount <= 0) {
    await db.feeCharge.deleteMany({
      where: { feeAccountId: data.feeAccountId, kind: data.kind, periodKey: data.periodKey },
    });
    return;
  }
  await db.feeCharge.upsert({
    where: {
      feeAccountId_kind_periodKey: {
        feeAccountId: data.feeAccountId,
        kind: data.kind,
        periodKey: data.periodKey,
      },
    },
    create: {
      feeAccountId: data.feeAccountId,
      kind: data.kind,
      periodKey: data.periodKey,
      amount: data.amount,
      note: data.note,
      detailJson: data.detailJson,
      createdById: data.createdById,
    },
    update: { amount: data.amount, note: data.note, detailJson: data.detailJson },
  });
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
  if (account.billingMode === "YEARLY") return { skipped: true as const, amount: 0 };
  if (account.discountEffectiveFrom && periodKey < account.discountEffectiveFrom) {
    return { skipped: true as const, amount: 0 };
  }
  const classIds = account.members.map((m) => m.student.classId);
  const [structureMap, ratePerKm] = await Promise.all([
    structuresByClass(db, academicYear, classIds),
    transportRateForYear(db, academicYear),
  ]);
  const members = familyMemberViews(account.members, structureMap, ratePerKm);
  const priced = familyMonthlyNote(members, periodKey);
  const amount = netAfterDiscount(priced.amount, account.monthlyDiscount);
  const note =
    account.monthlyDiscount > 0
      ? `${priced.note} — discount ₹${account.monthlyDiscount}, payable ₹${amount}`
      : priced.note;
  await putSessionCharge(db, {
    feeAccountId,
    kind: "MONTHLY",
    periodKey,
    amount,
    note,
    detailJson: priced.detailJson,
    createdById,
  });
  return { skipped: false as const, amount };
}

export async function updateFamilyOneTimeCharge(
  db: PrismaClient,
  studentId: string,
  input: { kind: "ANNUAL" | "REGISTRATION" | "ADMISSION" | "EXAM"; amount: number },
  createdById?: string
) {
  const item = oneTimeFields.find((field) => field.kind === input.kind);
  if (!item) return { error: "Unknown charge" as const };
  const accountId = await ensureStudentFeeAccount(db, studentId);
  const academicYear = academicYearKey();
  const account = await db.feeAccount.findUnique({
    where: { id: accountId },
    include: { members: { include: memberInclude } },
  });
  if (!account || account.members.length === 0) return { error: "Fee account not found" as const };
  const classIds = account.members.map((m) => m.student.classId);
  const structureMap = await structuresByClass(db, academicYear, classIds);
  const oneGross = account.members.reduce((sum, m) => sum + (structureMap.get(m.student.classId)?.[item.field] ?? 0), 0);
  const payable = input.amount;
  const waive = payable === 0;
  const discount = payable >= oneGross ? 0 : oneGross - payable;
  await db.feeAccount.update({
    where: { id: accountId },
    data: { [item.discount]: discount, [item.waive]: waive },
  });
  const note = waive
    ? `${item.label} nil for ${academicYear}`
    : payable === oneGross
      ? `${item.label} ₹${payable}`
      : `${item.label} ₹${payable} — class amount ₹${oneGross}`;
  await putSessionCharge(db, {
    feeAccountId: accountId,
    kind: item.kind,
    periodKey: academicYear,
    amount: payable,
    note,
    createdById,
  });
  const snapshot = await feeAccountSnapshot(db, studentId);
  return { snapshot };
}

const oneTimeFields = [
  { kind: "ANNUAL" as const, field: "annualAmount" as const, discount: "annualDiscount" as const, waive: "waiveAnnual" as const, label: "Annual charges" },
  { kind: "REGISTRATION" as const, field: "registrationAmount" as const, discount: "registrationDiscount" as const, waive: "waiveRegistration" as const, label: "Registration" },
  { kind: "ADMISSION" as const, field: "admissionAmount" as const, discount: "admissionDiscount" as const, waive: "waiveAdmission" as const, label: "Activity" },
  { kind: "EXAM" as const, field: "examAmount" as const, discount: "examDiscount" as const, waive: "waiveExam" as const, label: "Exam fee" },
];

export async function syncFamilySession(
  db: PrismaClient,
  feeAccountId: string,
  academicYear: string,
  createdById?: string
) {
  const account = await db.feeAccount.findUnique({
    where: { id: feeAccountId },
    include: { members: { include: memberInclude } },
  });
  if (!account || account.members.length === 0) return { error: "Fee account not found" as const };
  const classIds = account.members.map((m) => m.student.classId);
  const [structureMap, ratePerKm] = await Promise.all([
    structuresByClass(db, academicYear, classIds),
    transportRateForYear(db, academicYear),
  ]);
  const members = familyMemberViews(account.members, structureMap, ratePerKm);
  const gross = members.reduce((sum, m) => sum + m.monthlyFee, 0);
  const net = netAfterDiscount(gross, account.monthlyDiscount);
  const months = sessionMonthKeys(academicYear);

  if (account.billingMode === "YEARLY") {
    await db.feeCharge.deleteMany({
      where: { feeAccountId, kind: "MONTHLY", periodKey: { in: months } },
    });
    const note =
      account.monthlyDiscount > 0
        ? `${academicYear} yearly fee ₹${net * 12} — ₹${net} × 12 months after ₹${account.monthlyDiscount} discount`
        : `${academicYear} yearly fee ₹${net * 12} — ₹${net} × 12 months`;
    await putSessionCharge(db, {
      feeAccountId,
      kind: "YEARLY",
      periodKey: academicYear,
      amount: net * 12,
      note,
      createdById,
    });
  } else {
    await db.feeCharge.deleteMany({
      where: { feeAccountId, kind: "YEARLY", periodKey: academicYear },
    });
    for (const periodKey of months) {
      const priced = familyMonthlyNote(members, periodKey);
      const note =
        account.monthlyDiscount > 0
          ? `${priced.note} — discount ₹${account.monthlyDiscount}, payable ₹${net}`
          : priced.note;
      await putSessionCharge(db, {
        feeAccountId,
        kind: "MONTHLY",
        periodKey,
        amount: net,
        note,
        detailJson: priced.detailJson,
        createdById,
      });
    }
  }

  for (const item of oneTimeFields) {
    const oneGross = account.members.reduce((sum, m) => sum + (structureMap.get(m.student.classId)?.[item.field] ?? 0), 0);
    const payable = netAfterDiscount(oneGross, account[item.discount], account[item.waive]);
    const note = account[item.waive]
      ? `${item.label} nil for ${academicYear}`
      : account[item.discount] > 0
        ? `${item.label} ₹${payable} — structure ₹${oneGross} minus discount ₹${account[item.discount]}`
        : `${item.label} ₹${payable}`;
    await putSessionCharge(db, {
      feeAccountId,
      kind: item.kind,
      periodKey: academicYear,
      amount: payable,
      note,
      createdById,
    });
  }

  return { ok: true as const, netMonthly: net, billingMode: account.billingMode };
}

/** Update session rows that are already posted, without creating the months that are still missing. */
export async function repricePostedSession(
  db: PrismaClient,
  feeAccountId: string,
  academicYear: string,
  fromPeriod?: string
) {
  const account = await db.feeAccount.findUnique({
    where: { id: feeAccountId },
    include: { members: { include: memberInclude } },
  });
  if (!account || account.members.length === 0) return;
  const classIds = account.members.map((m) => m.student.classId);
  const [structureMap, ratePerKm] = await Promise.all([
    structuresByClass(db, academicYear, classIds),
    transportRateForYear(db, academicYear),
  ]);
  const members = familyMemberViews(account.members, structureMap, ratePerKm);
  const gross = members.reduce((sum, m) => sum + m.monthlyFee, 0);
  const net = netAfterDiscount(gross, account.monthlyDiscount);
  const months = sessionMonthKeys(academicYear);

  if (account.billingMode === "YEARLY") {
    const existing = await db.feeCharge.findFirst({
      where: { feeAccountId, kind: "YEARLY", periodKey: academicYear },
      select: { id: true },
    });
    if (!existing) return;
    await putSessionCharge(db, {
      feeAccountId,
      kind: "YEARLY",
      periodKey: academicYear,
      amount: net * 12,
      note:
        account.monthlyDiscount > 0
          ? `${academicYear} yearly fee ₹${net * 12} — ₹${net} × 12 months after ₹${account.monthlyDiscount} discount`
          : `${academicYear} yearly fee ₹${net * 12} — ₹${net} × 12 months`,
    });
    return;
  }

  const existing = await db.feeCharge.findMany({
    where: { feeAccountId, kind: "MONTHLY", periodKey: { in: months } },
    select: { periodKey: true },
  });
  const floor = [account.discountEffectiveFrom, fromPeriod].filter((key): key is string => Boolean(key)).sort().at(-1);
  for (const row of existing) {
    if (floor && row.periodKey < floor) continue;
    const priced = familyMonthlyNote(members, row.periodKey);
    await putSessionCharge(db, {
      feeAccountId,
      kind: "MONTHLY",
      periodKey: row.periodKey,
      amount: net,
      note:
        account.monthlyDiscount > 0
          ? `${priced.note} — discount ₹${account.monthlyDiscount}, payable ₹${net}`
          : priced.note,
      detailJson: priced.detailJson,
    });
  }
}

export type FamilyBillingInput = {
  billingMode: "MONTHLY" | "YEARLY";
  monthlyDiscount: number;
  annualDiscount: number;
  registrationDiscount: number;
  admissionDiscount: number;
  examDiscount: number;
  waiveAnnual: boolean;
  waiveRegistration: boolean;
  waiveAdmission: boolean;
  waiveExam: boolean;
};

export async function saveFamilyAccount(
  db: PrismaClient,
  studentId: string,
  input: {
    billingMode: "MONTHLY" | "YEARLY";
    monthlyDiscount: number;
    effectiveFrom: string;
    transport: { studentId: string; amount: number }[];
    annualDiscount: number;
    registrationDiscount: number;
    admissionDiscount: number;
    examDiscount: number;
    waiveAnnual: boolean;
    waiveRegistration: boolean;
    waiveAdmission: boolean;
    waiveExam: boolean;
    oneTimeAmounts?: { annual?: number; registration?: number; admission?: number; exam?: number };
    lastYearBalance?: number;
    yearlyFee?: number;
  },
  createdById?: string
) {
  const accountId = await ensureStudentFeeAccount(db, studentId);
  const academicYear = academicYearKey();
  const months = sessionMonthKeys(academicYear);
  if (!months.includes(input.effectiveFrom)) {
    return { error: "Choose a month in this academic year (April–March)." as const };
  }

  const account = await db.feeAccount.findUnique({
    where: { id: accountId },
    include: { members: { include: memberInclude } },
  });
  if (!account || account.members.length === 0) return { error: "Fee account not found" as const };

  for (const row of input.transport) {
    if (!account.members.some((m) => m.studentId === row.studentId)) {
      return { error: "That child is not on this account." as const };
    }
  }

  const classIds = account.members.map((m) => m.student.classId);
  const [structureMap, ratePerKm] = await Promise.all([
    structuresByClass(db, academicYear, classIds),
    transportRateForYear(db, academicYear),
  ]);
  await Promise.all(
    input.transport.map((row) =>
      db.feeAccountMember.update({
        where: { studentId: row.studentId },
        data: { transportRupees: row.amount, transportKm: 0, usesTransport: row.amount > 0 },
      })
    )
  );
  const pricedAccount = await db.feeAccount.findUnique({
    where: { id: accountId },
    include: { members: { include: memberInclude } },
  });
  if (!pricedAccount) return { error: "Fee account not found" as const };
  const members = familyMemberViews(pricedAccount.members, structureMap, ratePerKm);
  const gross = members.reduce((sum, m) => sum + m.monthlyFee, 0);
  const net = netAfterDiscount(gross, input.monthlyDiscount);
  const futureMonths = months.filter((key) => key >= input.effectiveFrom);

  const [existingMonthly, existingYearly] = await Promise.all([
    db.feeCharge.findMany({
      where: { feeAccountId: accountId, kind: "MONTHLY", periodKey: { in: months } },
      select: { periodKey: true, amount: true },
    }),
    db.feeCharge.findFirst({
      where: { feeAccountId: accountId, kind: "YEARLY", periodKey: academicYear },
      select: { id: true },
    }),
  ]);

  if (input.billingMode === "YEARLY" && input.effectiveFrom !== months[0]) {
    return { error: "A yearly fee covers April to March. Choose April, or use Monthly to start from a later month." as const };
  }
  if (input.billingMode === "YEARLY" && existingMonthly.some((row) => row.periodKey < input.effectiveFrom)) {
    return { error: "Earlier months are already on this account. A yearly fee cannot replace them." as const };
  }
  if (input.billingMode === "MONTHLY" && existingYearly && input.effectiveFrom !== months[0]) {
    return {
      error: "This account has a yearly fee. Choose April to replace it, or leave the yearly fee as it is." as const,
    };
  }

  const oneTimePayable = new Map<FeeChargeKind, number>();
  const oneTimeWrite = {
    annualDiscount: input.annualDiscount,
    registrationDiscount: input.registrationDiscount,
    admissionDiscount: input.admissionDiscount,
    examDiscount: input.examDiscount,
    waiveAnnual: input.waiveAnnual,
    waiveRegistration: input.waiveRegistration,
    waiveAdmission: input.waiveAdmission,
    waiveExam: input.waiveExam,
  };
  if (input.oneTimeAmounts) {
    for (const item of oneTimeFields) {
      const key = item.kind === "ANNUAL" ? "annual" : item.kind === "REGISTRATION" ? "registration" : item.kind === "ADMISSION" ? "admission" : "exam";
      const typed = input.oneTimeAmounts[key];
      if (typed == null) continue;
      const oneGross = pricedAccount.members.reduce((sum, m) => sum + (structureMap.get(m.student.classId)?.[item.field] ?? 0), 0);
      oneTimeWrite[item.discount] = typed === 0 || typed >= oneGross ? 0 : oneGross - typed;
      oneTimeWrite[item.waive] = typed === 0;
      oneTimePayable.set(item.kind, typed);
    }
  }

  await db.feeAccount.update({
    where: { id: accountId },
    data: {
      billingMode: input.billingMode,
      monthlyDiscount: input.monthlyDiscount,
      discountEffectiveFrom: input.effectiveFrom,
      ...oneTimeWrite,
    },
  });

  if (input.billingMode === "YEARLY") {
    await db.feeCharge.deleteMany({
      where: { feeAccountId: accountId, kind: "MONTHLY", periodKey: { in: months } },
    });
    await db.feeCharge.deleteMany({
      where: {
        feeAccountId: accountId,
        kind: { in: ["ANNUAL", "REGISTRATION", "ADMISSION", "EXAM"] },
        periodKey: academicYear,
      },
    });
    const yearlyAmount = input.yearlyFee ?? net * 12;
    await putSessionCharge(db, {
      feeAccountId: accountId,
      kind: "YEARLY",
      periodKey: academicYear,
      amount: yearlyAmount,
      note: `${academicYear} yearly fee ₹${yearlyAmount}`,
      createdById,
    });
  } else {
    if (input.effectiveFrom === months[0]) {
      await db.feeCharge.deleteMany({
        where: { feeAccountId: accountId, kind: "YEARLY", periodKey: academicYear },
      });
    }
    for (const periodKey of futureMonths.filter((key) => key <= monthPeriodKey())) {
      const priced = familyMonthlyNote(members, periodKey);
      const note =
        input.monthlyDiscount > 0
          ? `${priced.note} — discount ₹${input.monthlyDiscount}, payable ₹${net}`
          : priced.note;
      await putSessionCharge(db, {
        feeAccountId: accountId,
        kind: "MONTHLY",
        periodKey,
        amount: net,
        note,
        detailJson: priced.detailJson,
        createdById,
      });
    }
  }

  if (input.billingMode !== "YEARLY") {
  for (const item of oneTimeFields) {
    const oneGross = pricedAccount.members.reduce((sum, m) => sum + (structureMap.get(m.student.classId)?.[item.field] ?? 0), 0);
    const typed = oneTimePayable.get(item.kind);
    const payable = typed ?? netAfterDiscount(oneGross, oneTimeWrite[item.discount], oneTimeWrite[item.waive]);
    const note = oneTimeWrite[item.waive]
      ? `${item.label} nil for ${academicYear}`
      : payable !== oneGross
        ? `${item.label} ₹${payable} — class amount ₹${oneGross}`
        : `${item.label} ₹${payable}`;
    await putSessionCharge(db, {
      feeAccountId: accountId,
      kind: item.kind,
      periodKey: academicYear,
      amount: payable,
      note,
      createdById,
    });
  }
  }

  if (input.lastYearBalance != null) {
    await putSessionCharge(db, {
      feeAccountId: accountId,
      kind: "OPENING",
      periodKey: `opening:${academicYear}`,
      amount: input.lastYearBalance,
      note: "Last year balance",
      createdById,
    });
  }

  return { ok: true as const, netMonthly: net, billingMode: input.billingMode, grossMonthly: gross };
}

export async function saveFamilyBilling(
  db: PrismaClient,
  studentId: string,
  input: FamilyBillingInput,
  createdById?: string
) {
  const accountId = await ensureStudentFeeAccount(db, studentId);
  await db.feeAccount.update({
    where: { id: accountId },
    data: input,
  });
  return syncFamilySession(db, accountId, academicYearKey(), createdById);
}

export async function setLastYearBalance(
  db: PrismaClient,
  studentId: string,
  amount: number,
  createdById?: string
) {
  const student = await db.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) return { error: "Student not found" as const };
  const accountId = await ensureStudentFeeAccount(db, studentId);
  const academicYear = academicYearKey();
  await putSessionCharge(db, {
    feeAccountId: accountId,
    kind: "OPENING",
    periodKey: `opening:${academicYear}`,
    amount,
    note: "Last year balance",
    createdById,
  });
  const snapshot = await feeAccountSnapshot(db, studentId);
  return { snapshot };
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

export async function deleteOptionalCharge(db: PrismaClient, studentId: string, chargeId: string) {
  const member = await db.feeAccountMember.findUnique({
    where: { studentId },
    select: { feeAccountId: true },
  });
  if (!member) return { error: "Fee account not found" as const };
  const charge = await db.feeCharge.findUnique({ where: { id: chargeId } });
  if (!charge || charge.feeAccountId !== member.feeAccountId) return { error: "Charge not found" as const };
  const note = charge.note ?? "";
  const isDiscount = charge.amount < 0 || charge.periodKey.includes(":discount:") || note.startsWith("One-time discount");
  if (charge.kind !== "OTHER" || isDiscount) return { error: "Only an optional charge can be removed" as const };
  await db.feeCharge.delete({ where: { id: chargeId } });
  return { ok: true as const };
}

async function nextReceiptNo(db: Prisma.TransactionClient, academicYear: string): Promise<string> {
  const row = await db.feeReceiptSeq.upsert({
    where: { academicYear },
    create: { academicYear, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `FEE-${academicYear}-${String(row.lastNumber).padStart(6, "0")}`;
}

/** One-time reduction of the outstanding balance. Monthly and yearly fee rows are not changed. */
export async function addCollectionDiscount(
  db: PrismaClient,
  studentId: string,
  extraDiscount: number,
  paidOn: string,
  createdById?: string
) {
  if (extraDiscount <= 0) return { ok: true as const };
  const accountId = await ensureStudentFeeAccount(db, studentId);
  const account = await db.feeAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });
  if (!account) return { error: "Fee account not found" as const };
  await db.feeCharge.create({
    data: {
      feeAccountId: accountId,
      kind: "OTHER",
      periodKey: `${paidOn}:discount:${randomUUID().slice(0, 8)}`,
      amount: -extraDiscount,
      note: `One-time discount ₹${extraDiscount}`,
      createdById,
    },
  });
  return { ok: true as const };
}

export async function collectFeePayment(
  db: PrismaClient,
  params: {
    studentId: string;
    amount: number;
    mode: FeePaymentMode;
    paidOn: string;
    note?: string;
    discount?: number;
    createdById?: string;
  }
) {
  const student = await db.student.findUnique({ where: { id: params.studentId }, select: { id: true } });
  if (!student) return { error: "Student not found" as const };
  if ((params.discount ?? 0) > 0) {
    const applied = await addCollectionDiscount(
      db,
      params.studentId,
      params.discount ?? 0,
      params.paidOn,
      params.createdById
    );
    if ("error" in applied) return applied;
  }
  if (params.amount < 1) {
    const snapshot = await feeAccountSnapshot(db, params.studentId);
    return { payment: null, snapshot };
  }
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

export async function updateFeePayment(
  db: PrismaClient,
  studentId: string,
  paymentId: string,
  input: { amount: number; mode: FeePaymentMode; paidOn: string; note?: string | null }
) {
  const member = await db.feeAccountMember.findUnique({
    where: { studentId },
    select: { feeAccountId: true },
  });
  if (!member) return { error: "Fee account not found" as const };
  const payment = await db.feePayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.feeAccountId !== member.feeAccountId) {
    return { error: "Receipt not found on this account" as const };
  }
  await db.feePayment.update({
    where: { id: paymentId },
    data: {
      amount: input.amount,
      mode: input.mode,
      paidOn: input.paidOn,
      note: input.note?.trim() || null,
    },
  });
  const snapshot = await feeAccountSnapshot(db, studentId);
  return { snapshot };
}

export async function deleteFeePayment(db: PrismaClient, studentId: string, paymentId: string) {
  const member = await db.feeAccountMember.findUnique({
    where: { studentId },
    select: { feeAccountId: true },
  });
  if (!member) return { error: "Fee account not found" as const };
  const payment = await db.feePayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.feeAccountId !== member.feeAccountId) {
    return { error: "Receipt not found on this account" as const };
  }
  await db.feePayment.delete({ where: { id: paymentId } });
  const snapshot = await feeAccountSnapshot(db, studentId);
  return { snapshot };
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
  const fromMonth = monthPeriodKey();
  await repricePostedSession(db, keepId, year, fromMonth);
  await upsertMonthlyCharge(db, keepId, year, fromMonth);
  return { ok: true as const };
}

export async function unlinkFeeSibling(db: PrismaClient, studentId: string) {
  const member = await db.feeAccountMember.findUnique({
    where: { studentId },
    include: { feeAccount: { include: { members: true } } },
  });
  if (!member) return { error: "Fee account not found" as const };
  if (member.feeAccount.members.length < 2) return { error: "This student is not in a sibling group" as const };
  const originalAccountId = member.feeAccountId;

  await db.$transaction(async (tx) => {
    const account = await tx.feeAccount.create({ data: {} });
    await tx.feeAccountMember.update({
      where: { studentId },
      data: { feeAccountId: account.id },
    });
  });
  await repricePostedSession(db, originalAccountId, academicYearKey());
  return { ok: true as const };
}

export async function setStudentTransport(db: PrismaClient, studentId: string, transportKm: number) {
  await ensureStudentFeeAccount(db, studentId);
  await db.feeAccountMember.update({
    where: { studentId },
    data: { transportKm, usesTransport: transportKm > 0 },
  });
  const accountId = (await db.feeAccountMember.findUnique({
    where: { studentId },
    select: { feeAccountId: true },
  }))!.feeAccountId;
  const year = academicYearKey();
  await repricePostedSession(db, accountId, year);
  await upsertMonthlyCharge(db, accountId, year, monthPeriodKey());
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

/** Post monthly rows from the agreement start through the given month. Later months are not due yet. */
export async function postDueMonthlyCharges(
  db: PrismaClient,
  feeAccountId: string,
  academicYear: string,
  throughPeriod: string
) {
  const account = await db.feeAccount.findUnique({
    where: { id: feeAccountId },
    select: { id: true, billingMode: true, discountEffectiveFrom: true },
  });
  if (!account || account.billingMode !== "MONTHLY") return;
  const months = sessionMonthKeys(academicYear);
  if (!months.some((key) => key <= throughPeriod)) return;
  const future = months.filter((key) => key > throughPeriod);
  if (future.length) {
    await db.feeCharge.deleteMany({
      where: { feeAccountId, kind: "MONTHLY", periodKey: { in: future } },
    });
  }
  const floor =
    account.discountEffectiveFrom && months.includes(account.discountEffectiveFrom)
      ? account.discountEffectiveFrom
      : months[0];
  for (const periodKey of months) {
    if (periodKey < floor || periodKey > throughPeriod) continue;
    const row = await db.feeCharge.findFirst({
      where: { feeAccountId, kind: "MONTHLY", periodKey },
      select: { id: true },
    });
    if (row) continue;
    await upsertMonthlyCharge(db, feeAccountId, academicYear, periodKey);
  }
}

/** Add once-a-year charges from the class list when they are not on the account yet. Existing amounts stay. */
export async function postStandardOneTimeCharges(db: PrismaClient, feeAccountId: string, academicYear: string) {
  const account = await db.feeAccount.findUnique({
    where: { id: feeAccountId },
    include: { members: { include: memberInclude } },
  });
  if (!account || account.members.length === 0 || account.billingMode === "YEARLY") return;
  const classIds = account.members.map((m) => m.student.classId);
  const structureMap = await structuresByClass(db, academicYear, classIds);
  for (const item of oneTimeFields) {
    if (account[item.waive]) continue;
    const existing = await db.feeCharge.findFirst({
      where: { feeAccountId, kind: item.kind, periodKey: academicYear },
      select: { id: true },
    });
    if (existing) continue;
    const oneGross = account.members.reduce((sum, m) => sum + (structureMap.get(m.student.classId)?.[item.field] ?? 0), 0);
    const payable = netAfterDiscount(oneGross, account[item.discount], false);
    if (payable <= 0) continue;
    await putSessionCharge(db, {
      feeAccountId,
      kind: item.kind,
      periodKey: academicYear,
      amount: payable,
      note: account[item.discount] > 0
        ? `${item.label} ₹${payable} — structure ₹${oneGross} minus discount ₹${account[item.discount]}`
        : `${item.label} ₹${payable}`,
    });
  }
}

function countedCharge(kind: string, periodKey: string, throughPeriod: string): boolean {
  return kind !== "MONTHLY" || periodKey <= throughPeriod;
}

/** Read-only fee status for one class section. Does not post or change charges. */
export async function classFeeStatus(db: PrismaClient, classId: string, sectionId: string) {
  const section = await db.section.findFirst({
    where: { id: sectionId, classId },
    include: { schoolClass: { select: { name: true } } },
  });
  if (!section) return null;

  const academicYear = academicYearKey();
  const throughPeriod = monthPeriodKey();

  const students = await db.student.findMany({
    where: { classId, sectionId },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      feeMembership: {
        select: {
          feeAccount: {
            select: {
              billingMode: true,
              charges: { select: { kind: true, periodKey: true, amount: true } },
              payments: { select: { id: true, amount: true, paidOn: true } },
            },
          },
        },
      },
    },
  });

  const rows = students.map((student) => {
    const account = student.feeMembership?.feeAccount;
    if (!account) {
      return {
        studentId: student.id,
        fullName: student.fullName,
        billingMode: null as "MONTHLY" | "YEARLY" | null,
        balance: 0,
        lastYearBalance: 0,
        payments: [] as { id: string; paidOn: string; amount: number }[],
      };
    }

    const charges = account.charges.filter((charge) => countedCharge(charge.kind, charge.periodKey, throughPeriod));
    const charged = charges.reduce((sum, charge) => sum + charge.amount, 0);
    const paid = account.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const lastYearBalance = account.charges
      .filter((charge) => charge.kind === "OPENING")
      .reduce((sum, charge) => sum + charge.amount, 0);
    const latest = [...account.payments].sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id.localeCompare(a.id))[0];

    return {
      studentId: student.id,
      fullName: student.fullName,
      billingMode: account.billingMode,
      balance: charged - paid,
      lastYearBalance,
      payments: latest ? [{ id: latest.id, paidOn: latest.paidOn, amount: latest.amount }] : [],
    };
  });

  rows.sort((a, b) => {
    const aDue = a.balance > 0 ? 1 : 0;
    const bDue = b.balance > 0 ? 1 : 0;
    if (aDue !== bDue) return bDue - aDue;
    return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" });
  });

  return {
    academicYear,
    throughPeriod,
    className: section.schoolClass.name,
    sectionName: section.name,
    dueCount: rows.filter((row) => row.balance > 0).length,
    students: rows,
  };
}

/** Receipts whose payment date falls in the inclusive range. Does not post charges. */
export async function listFeeCollections(db: PrismaClient, from: string, to: string) {
  const payments = await db.feePayment.findMany({
    where: { paidOn: { gte: from, lte: to } },
    orderBy: [{ paidOn: "desc" }, { receiptNo: "desc" }],
    select: {
      id: true,
      amount: true,
      mode: true,
      receiptNo: true,
      paidOn: true,
      feeAccount: {
        select: {
          members: {
            select: {
              student: {
                select: {
                  fullName: true,
                  schoolClass: { select: { name: true, grade: true } },
                  section: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return {
    from,
    to,
    total: payments.reduce((sum, payment) => sum + payment.amount, 0),
    count: payments.length,
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      mode: payment.mode,
      receiptNo: payment.receiptNo,
      paidOn: payment.paidOn,
      family: payment.feeAccount.members
        .map((member) => {
          const student = member.student;
          const label = classLabelForDisplay(student.schoolClass);
          return `${student.fullName} (${label} ${student.section.name})`;
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .join(", "),
    })),
  };
}
