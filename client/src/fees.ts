export type FeePaymentMode = "CASH" | "UPI" | "BANK";
export type FeeChargeKind = "MONTHLY" | "ANNUAL" | "ADMISSION" | "EXAM" | "OTHER" | "OPENING";

export type FeeMember = {
  studentId: string;
  fullName: string;
  studentLoginId: string | null;
  classId: string;
  className: string;
  classLabel: string;
  sectionName: string;
  usesTransport: boolean;
  classTuition: number;
  classTransport: number;
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
  transportAmount: number;
  annualAmount: number;
  admissionAmount: number;
  examAmount: number;
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
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
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
