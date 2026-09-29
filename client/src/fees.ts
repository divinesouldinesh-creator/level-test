export type FeePaymentMode = "CASH" | "UPI" | "BANK";
export type FeeChargeKind = "MONTHLY" | "YEARLY" | "ANNUAL" | "ADMISSION" | "EXAM" | "REGISTRATION" | "OTHER" | "OPENING";
export type FeeBillingMode = "MONTHLY" | "YEARLY";

export type FeeOneTimeLine = {
  gross: number;
  discount: number;
  waived: boolean;
  net: number;
};

export type FeeMember = {
  studentId: string;
  fullName: string;
  studentLoginId: string | null;
  classId: string;
  className: string;
  classLabel: string;
  sectionName: string;
  usesTransport: boolean;
  transportKm: number;
  transportAmount: number;
  classTuition: number;
  monthlyFee: number;
};

export type FeeLedgerRow = {
  id: string;
  type: "charge" | "payment";
  date: string;
  particular: string;
  debit: number;
  credit: number;
  balance: number;
};

export type FeeAccountSnapshot = {
  studentId: string;
  accountId: string;
  parentName: string | null;
  phone: string | null;
  academicYear: string;
  monthPeriod: string;
  monthLabel: string;
  members: FeeMember[];
  familyMonthlyFee: number;
  grossMonthly: number;
  monthlyDiscount: number;
  netMonthly: number;
  yearlyPayable: number;
  billingMode: FeeBillingMode;
  discountEffectiveFrom: string | null;
  concessions: {
    annual: FeeOneTimeLine;
    registration: FeeOneTimeLine;
    admission: FeeOneTimeLine;
    exam: FeeOneTimeLine;
  };
  sessionReady: boolean;
  transportRatePerKm: number;
  missingStructure: boolean;
  monthCharged: boolean;
  charged: number;
  paid: number;
  balance: number;
  charges: {
    id: string;
    kind: FeeChargeKind;
    periodKey: string;
    amount: number;
    note: string | null;
    createdAt: string;
  }[];
  payments: {
    id: string;
    amount: number;
    mode: FeePaymentMode;
    receiptNo: string;
    paidOn: string;
    note: string | null;
    createdAt: string;
  }[];
  ledger: FeeLedgerRow[];
};

export type FeeStructureRow = {
  classId: string;
  className: string;
  classLabel: string;
  tuitionAmount: number;
  annualAmount: number;
  admissionAmount: number;
  registrationAmount: number;
  examAmount: number;
};

export type SchoolAccountsReport = {
  academicYear: string;
  monthlyPayerPendingCount: number;
  monthlyPayerPendingAmount: number;
  schoolTotal: number;
  monthLabel: string;
  lastYearOpening: number;
  currentYearBalance: number;
  lastYearBalance: number;
  classes: {
    classId: string;
    className: string;
    studentsPending: number;
    currentYearBalance: number;
    lastYearBalance: number;
    studentCount: number;
    paidThisMonth: number;
  }[];
};

export type FeeSchoolTotals = {
  academicYear: string;
  today: string;
  accountCount: number;
  studentCount: number;
  siblingFamilyCount: number;
  charged: number;
  paid: number;
  balance: number;
  todayPaid: number;
  todayReceipts: number;
  pending: {
    accountId: string;
    balance: number;
    charged: number;
    paid: number;
    members: { studentId: string; fullName: string; classLabel: string; sectionName: string }[];
  }[];
};

export type FeeCollections = {
  paidOn: string;
  total: number;
  count: number;
  payments: {
    id: string;
    receiptNo: string;
    amount: number;
    mode: FeePaymentMode;
    paidOn: string;
    recordedAgainst: string | null;
    members: string[];
  }[];
};

export function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** School calendar day in Asia/Kolkata. */
export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseRupees(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function normFeeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type ParsedFeeStructureLine = {
  className: string;
  tuitionAmount: number;
  annualAmount: number;
  admissionAmount: number;
  registrationAmount: number;
  examAmount: number;
};

function cellRupees(mapped: Map<string, string>, keys: string[]): number {
  for (const key of keys) {
    const raw = mapped.get(key);
    if (raw == null || raw === "") continue;
    const n = parseRupees(raw);
    if (n != null) return n;
  }
  return 0;
}

/** Parse Excel/CSV rows: Class, Tuition, Annual, Activity, Registration, Exam. */
export function parseFeeStructureSheet(rows: Record<string, unknown>[]): ParsedFeeStructureLine[] {
  const out: ParsedFeeStructureLine[] = [];
  for (const raw of rows) {
    const mapped = new Map<string, string>();
    for (const [k, v] of Object.entries(raw)) {
      mapped.set(normFeeKey(String(k)), String(v ?? "").trim());
    }
    const className =
      mapped.get("class") ??
      mapped.get("classname") ??
      mapped.get("classlabel") ??
      mapped.get("grade") ??
      mapped.get("classgrade") ??
      "";
    if (!className) continue;
    out.push({
      className,
      tuitionAmount: cellRupees(mapped, ["tuition", "tuitionamount", "monthly", "monthlyfee", "fee"]),
      annualAmount: cellRupees(mapped, ["annual", "annualamount", "development"]),
      admissionAmount: cellRupees(mapped, ["activity", "activityamount", "admission", "admissionamount"]),
      registrationAmount: cellRupees(mapped, ["registration", "registrationamount", "registrationfee"]),
      examAmount: cellRupees(mapped, ["exam", "examamount", "examination"]),
    });
  }
  if (!out.length) {
    throw new Error("No class rows found. Use columns: Class, Tuition, Annual, Activity, Registration, Exam.");
  }
  return out;
}

export function matchFeeStructureClass(
  classes: FeeStructureRow[],
  fileClass: string
): FeeStructureRow | undefined {
  const want = normFeeKey(fileClass);
  if (!want) return undefined;
  return classes.find((c) => {
    const names = [c.className, c.classLabel, `class${c.classLabel}`].map(normFeeKey);
    return names.includes(want);
  });
}

export function applyFeeStructureUpload(
  current: FeeStructureRow[],
  parsed: ParsedFeeStructureLine[]
): { rows: FeeStructureRow[]; matched: number; unmatched: string[] } {
  const next = current.map((row) => ({ ...row }));
  const unmatched: string[] = [];
  let matched = 0;
  for (const line of parsed) {
    const hit = matchFeeStructureClass(next, line.className);
    if (!hit) {
      unmatched.push(line.className);
      continue;
    }
    matched += 1;
    hit.tuitionAmount = line.tuitionAmount;
    hit.annualAmount = line.annualAmount;
    hit.admissionAmount = line.admissionAmount;
    hit.registrationAmount = line.registrationAmount;
    hit.examAmount = line.examAmount;
  }
  return { rows: next, matched, unmatched };
}

export function feeStructureTemplateCsv(rows: FeeStructureRow[]): string {
  const header = "Class,Tuition,Annual,Activity,Registration,Exam";
  const body = rows
    .map(
      (r) =>
        `${r.classLabel || r.className},${r.tuitionAmount},${r.annualAmount},${r.admissionAmount},${r.registrationAmount},${r.examAmount}`
    )
    .join("\n");
  return `${header}\n${body || "1,3000,0,0,0,0"}`;
}

export function printFeeReceipt(params: {
  receiptNo: string;
  paidOn: string;
  amount: number;
  mode: FeePaymentMode;
  members: { fullName: string; classLabel: string; sectionName: string }[];
  familyMonthlyFee: number;
  balance: number;
  schoolName?: string;
}) {
  const names = params.members
    .map((m) => `${m.fullName} (${m.classLabel} ${m.sectionName})`)
    .join("<br/>");
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${params.receiptNo}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .muted { color: #475569; font-size: 13px; }
    .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 16px; }
    .row { display: flex; justify-content: space-between; margin: 8px 0; }
    .amt { font-size: 22px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${params.schoolName ?? "School"} — Fee receipt</h1>
  <p class="muted">${params.receiptNo} · ${params.paidOn} · ${params.mode}</p>
  <div class="box">
    <p><strong>Received for</strong></p>
    <p>${names}</p>
    <div class="row"><span>Amount received</span><span class="amt">${formatInr(params.amount)}</span></div>
    <div class="row"><span>Family monthly fee</span><span>${formatInr(params.familyMonthlyFee)}</span></div>
    <div class="row"><span>Balance after this receipt</span><span>${formatInr(params.balance)}</span></div>
  </div>
  <p class="muted">Sibling accounts show the same family total. This receipt is counted once in school collection.</p>
  <script>window.onload = function () { window.print(); }</script>
</body>
</html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
