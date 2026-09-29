import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import {
  formatInr,
  istToday,
  parseRupees,
  printFeeReceipt,
  type FeeAccountSnapshot,
  type FeeBillingMode,
  type FeePaymentMode,
} from "../../fees";

type StudentHit = {
  id: string;
  fullName: string;
};

type ClassOption = { id: string; name: string };

type Toast = { type: "ok" | "err"; message: string };

const oneTimeKeys = ["annual", "admission", "registration", "exam"] as const;
type OneTimeKey = (typeof oneTimeKeys)[number];
type OneTimeAmounts = Record<OneTimeKey, string>;

function emptyOneTimeAmounts(): OneTimeAmounts {
  return { annual: "", admission: "", registration: "", exam: "" };
}

function oneTimeLabel(key: OneTimeKey): string {
  if (key === "annual") return "Annual";
  if (key === "admission") return "Activity";
  if (key === "registration") return "Registration";
  return "Exam";
}

function sessionMonths(academicYear: string): { key: string; label: string }[] {
  const start = Number(academicYear.slice(0, 4));
  if (!start) return [];
  const keys: string[] = [];
  for (let month = 4; month <= 12; month++) keys.push(`${start}-${String(month).padStart(2, "0")}`);
  for (let month = 1; month <= 3; month++) keys.push(`${start + 1}-${String(month).padStart(2, "0")}`);
  return keys.map((key) => ({
    key,
    label: new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1)).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  }));
}

function studentSearchUrl(term: string, classId: string): string | null {
  const q = term.trim();
  if (q.length < 2) return null;
  const params = new URLSearchParams();
  params.set("q", q);
  if (classId) params.set("classId", classId);
  params.set("page", "1");
  params.set("pageSize", "20");
  params.set("brief", "1");
  return `/api/v1/admin/students?${params}`;
}

function WorkingNote({ label }: { label: string }) {
  return (
    <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
        aria-hidden
      />
      {label}
    </p>
  );
}

export function FeePaymentPanel({ openStudentId }: { openStudentId?: string | null }) {
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [studentId, setStudentId] = useState("");
  const [account, setAccount] = useState<FeeAccountSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [amount, setAmount] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [mode, setMode] = useState<FeePaymentMode>("CASH");
  const [paidOn, setPaidOn] = useState(istToday());
  const [note, setNote] = useState("");
  const [editingFee, setEditingFee] = useState(false);
  const [addingCharge, setAddingCharge] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [feeBillingMode, setFeeBillingMode] = useState<FeeBillingMode>("MONTHLY");
  const [feeMonthlyInput, setFeeMonthlyInput] = useState("");
  const [feeEffectiveFrom, setFeeEffectiveFrom] = useState("");
  const [feeTransport, setFeeTransport] = useState<Record<string, string>>({});
  const [oneTimeAmounts, setOneTimeAmounts] = useState<OneTimeAmounts>(emptyOneTimeAmounts);
  const [lastYearInput, setLastYearInput] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState<FeePaymentMode>("CASH");
  const [editPaidOn, setEditPaidOn] = useState("");
  const [editNote, setEditNote] = useState("");
  const chosenQuery = useRef<string | null>(null);
  const searchGen = useRef(0);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadAccount = useCallback(async (id: string) => {
    setOpening(true);
    setBusy(true);
    setErr(null);
    try {
      const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${id}`);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Could not open this account");
        setAccount(null);
        return;
      }
      setAccount(r.data);
      setAmount("");
    } finally {
      setBusy(false);
      setOpening(false);
    }
  }, []);

  const selectStudent = useCallback(
    async (id: string, name?: string) => {
      searchGen.current += 1;
      chosenQuery.current = name ?? "";
      setStudentId(id);
      setQ(name ?? "");
      setHits([]);
      setNote("");
      setDiscountInput("");
      setEditingId("");
      setEditingFee(false);
      setAddingCharge(false);
      setExtraName("");
      setExtraAmount("");
      setMode("CASH");
      setPaidOn(istToday());
      await loadAccount(id);
    },
    [loadAccount]
  );

  useEffect(() => {
    if (openStudentId) void selectStudent(openStudentId);
  }, [openStudentId, selectStudent]);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassOption[]>("/api/v1/admin/classes");
      if (!r.ok || !r.data) return;
      setClasses([...r.data].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    })();
  }, []);

  useEffect(() => {
    if (chosenQuery.current != null && q.trim() === chosenQuery.current.trim()) {
      setSearching(false);
      setHits([]);
      return;
    }
    chosenQuery.current = null;
    const url = studentSearchUrl(q, classId);
    if (!url) {
      setSearching(false);
      setHits([]);
      return;
    }
    setSearching(true);
    const gen = ++searchGen.current;
    const t = window.setTimeout(() => {
      void (async () => {
        const r = await api<{ students: StudentHit[] }>(url);
        if (gen !== searchGen.current) return;
        setHits(r.data?.students ?? []);
        setSearching(false);
      })();
    }, 250);
    return () => {
      window.clearTimeout(t);
      searchGen.current += 1;
      setSearching(false);
    };
  }, [q, classId]);

  async function collect() {
    if (!studentId || !account) return;
    const rupees = parseRupees(amount);
    const discount = parseRupees(discountInput);
    if (rupees == null || discount == null) {
      showToast({ type: "err", message: "Enter the amount and discount in rupees." });
      return;
    }
    if (rupees < 1 && discount < 1) {
      showToast({ type: "err", message: "Enter the amount received or a discount." });
      return;
    }
    setBusy(true);
    const r = await api<{
      snapshot: FeeAccountSnapshot;
      payment: { receiptNo: string; amount: number; mode: FeePaymentMode; paidOn: string } | null;
    }>(`/api/v1/admin/fees/students/${studentId}/pay`, {
      method: "POST",
      json: { amount: rupees, discount, mode, paidOn, note: note.trim() || undefined },
    });
    setBusy(false);
    if (!r.ok || !r.data?.snapshot) {
      showToast({ type: "err", message: r.error ?? "Could not save this payment" });
      return;
    }
    setAccount(r.data.snapshot);
    setAmount("");
    setDiscountInput("");
    setNote("");
    const outstanding = `Outstanding ${formatInr(r.data.snapshot.balance)}.`;
    showToast({
      type: "ok",
      message: r.data.payment
        ? `Receipt ${r.data.payment.receiptNo} saved. ${discount > 0 ? "One-time discount applied. " : ""}${outstanding}`
        : `One-time discount applied. ${outstanding}`,
    });
    if (r.data.payment) {
      printFeeReceipt({
        receiptNo: r.data.payment.receiptNo,
        paidOn: r.data.payment.paidOn,
        amount: r.data.payment.amount,
        mode: r.data.payment.mode,
        members: r.data.snapshot.members,
        familyMonthlyFee: r.data.snapshot.familyMonthlyFee,
        balance: r.data.snapshot.balance,
      });
    }
  }

  function startEdit(payment: FeeAccountSnapshot["payments"][number]) {
    setEditingId(payment.id);
    setEditAmount(String(payment.amount));
    setEditMode(payment.mode);
    setEditPaidOn(payment.paidOn);
    setEditNote(payment.note ?? "");
  }

  async function saveEdit() {
    if (!studentId || !editingId) return;
    const rupees = parseRupees(editAmount);
    if (rupees == null || rupees < 1) {
      showToast({ type: "err", message: "Enter the corrected amount." });
      return;
    }
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/payments/${editingId}`, {
      method: "PATCH",
      json: { amount: rupees, mode: editMode, paidOn: editPaidOn, note: editNote.trim() || null },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not update this receipt" });
      return;
    }
    setAccount(r.data);
    setEditingId("");
    setAmount("");
    showToast({ type: "ok", message: `Receipt updated. Outstanding ${formatInr(r.data.balance)}.` });
  }

  async function removeReceipt(payment: FeeAccountSnapshot["payments"][number]) {
    if (!studentId) return;
    if (!window.confirm(`Delete receipt ${payment.receiptNo} for ${formatInr(payment.amount)}? The monthly fee will stay the same.`)) {
      return;
    }
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/payments/${payment.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not delete this receipt" });
      return;
    }
    setAccount(r.data);
    if (editingId === payment.id) setEditingId("");
    setAmount("");
    showToast({ type: "ok", message: `Receipt ${payment.receiptNo} deleted. Outstanding ${formatInr(r.data.balance)}.` });
  }

  function openFeeEdit() {
    if (!account) return;
    const months = sessionMonths(account.academicYear);
    const mode = account.billingMode;
    const transport: Record<string, string> = {};
    for (const member of account.members) {
      transport[member.studentId] = String(member.transportAmount);
    }
    const amounts = emptyOneTimeAmounts();
    for (const key of oneTimeKeys) {
      amounts[key] = String(account.concessions[key].net);
    }
    const opening = account.charges
      .filter((c) => c.kind === "OPENING" && c.periodKey === `opening:${account.academicYear}`)
      .reduce((sum, c) => sum + c.amount, 0);
    const classTuition = account.members.reduce((sum, member) => sum + member.classTuition, 0);
    const transportNow = account.members.reduce((sum, member) => sum + member.transportAmount, 0);
    const chargedTuition = Math.min(classTuition, Math.max(0, account.netMonthly - transportNow));
    const postedYearly = account.charges.find((c) => c.kind === "YEARLY" && c.periodKey === account.academicYear)?.amount;
    setFeeBillingMode(mode);
    setFeeMonthlyInput(mode === "YEARLY" ? String(postedYearly ?? account.yearlyPayable) : String(chargedTuition));
    setFeeEffectiveFrom(mode === "YEARLY" ? (months[0]?.key ?? "") : account.monthPeriod);
    setFeeTransport(transport);
    setOneTimeAmounts(amounts);
    setLastYearInput(String(opening));
    setEditingFee(true);
  }

  async function saveFee() {
    if (!studentId || !account) return;
    const months = sessionMonths(account.academicYear);
    const opening = parseRupees(lastYearInput);
    if (opening == null) {
      showToast({ type: "err", message: "Enter last year balance in rupees." });
      return;
    }
    if (feeBillingMode === "YEARLY") {
      const yearlyFee = parseRupees(feeMonthlyInput);
      if (yearlyFee == null) {
        showToast({ type: "err", message: "Enter the yearly fee in rupees." });
        return;
      }
      const firstMonth = months[0]?.key ?? "";
      if (!firstMonth) {
        showToast({ type: "err", message: "Choose the month this fee starts." });
        return;
      }
      setBusy(true);
      const accountSave = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/account`, {
        method: "PUT",
        json: {
          billingMode: "YEARLY",
          monthlyDiscount: 0,
          effectiveFrom: firstMonth,
          transport: account.members.map((member) => ({ studentId: member.studentId, amount: member.transportAmount })),
          yearlyFee,
          lastYearBalance: opening,
        },
      });
      setBusy(false);
      if (!accountSave.ok || !accountSave.data) {
        showToast({ type: "err", message: accountSave.error ?? "Could not save this fee" });
        return;
      }
      setAccount(accountSave.data);
      setEditingFee(false);
      setAmount("");
      showToast({ type: "ok", message: `Yearly fee saved. Outstanding ${formatInr(accountSave.data.balance)}.` });
      return;
    }
    const tuitionCharged = parseRupees(feeMonthlyInput);
    if (tuitionCharged == null) {
      showToast({ type: "err", message: "Enter the tuition in rupees." });
      return;
    }
    const effectiveFrom = feeEffectiveFrom;
    if (!effectiveFrom) {
      showToast({ type: "err", message: "Choose the month this fee starts." });
      return;
    }
    const transport: { studentId: string; amount: number }[] = [];
    for (const member of account.members) {
      const amount = parseRupees(feeTransport[member.studentId] ?? "");
      if (amount == null) {
        showToast({ type: "err", message: `Enter transport for ${member.fullName} in rupees.` });
        return;
      }
      transport.push({ studentId: member.studentId, amount });
    }
    const classTuition = account.members.reduce((sum, m) => sum + m.classTuition, 0);
    if (tuitionCharged > classTuition) {
      showToast({ type: "err", message: `Tuition cannot be more than ${formatInr(classTuition)} for this family.` });
      return;
    }
    const visible = oneTimeKeys.filter((key) => account.concessions[key].gross > 0 || account.concessions[key].waived);
    const oneTimeValues: { key: OneTimeKey; amount: number }[] = [];
    for (const key of visible) {
      const amount = parseRupees(oneTimeAmounts[key] ?? "");
      if (amount == null) {
        showToast({ type: "err", message: `Enter the ${oneTimeLabel(key)} amount in rupees.` });
        return;
      }
      oneTimeValues.push({ key, amount });
    }
    const oneTimeAmountsPayload: Partial<Record<OneTimeKey, number>> = {};
    for (const row of oneTimeValues) oneTimeAmountsPayload[row.key] = row.amount;
    setBusy(true);
    const accountSave = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/account`, {
      method: "PUT",
      json: {
        billingMode: feeBillingMode,
        monthlyDiscount: classTuition - tuitionCharged,
        effectiveFrom,
        transport,
        oneTimeAmounts: oneTimeAmountsPayload,
        lastYearBalance: opening,
      },
    });
    setBusy(false);
    if (!accountSave.ok || !accountSave.data) {
      showToast({ type: "err", message: accountSave.error ?? "Could not save this fee" });
      return;
    }
    setAccount(accountSave.data);
    setEditingFee(false);
    setAmount("");
    showToast({ type: "ok", message: `Fee saved. Outstanding ${formatInr(accountSave.data.balance)}.` });
  }

  async function addOptionalCharge() {
    if (!studentId) return;
    const name = extraName.trim();
    const amountValue = parseRupees(extraAmount);
    if (!name) {
      showToast({ type: "err", message: "Enter a name for this charge, such as I card or books." });
      return;
    }
    if (amountValue == null || amountValue < 1) {
      showToast({ type: "err", message: "Enter the charge amount in rupees." });
      return;
    }
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/charge`, {
      method: "POST",
      json: { kind: "OTHER", amount: amountValue, note: name },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not add this charge" });
      return;
    }
    setAccount(r.data);
    setAddingCharge(false);
    setExtraName("");
    setExtraAmount("");
    setAmount("");
    showToast({ type: "ok", message: `${name} added. Outstanding ${formatInr(r.data.balance)}.` });
  }

  async function removeOptionalCharge(chargeId: string, name: string) {
    if (!studentId) return;
    if (!window.confirm(`Remove ${name}? The monthly fee will stay the same.`)) return;
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/charges/${chargeId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not remove this charge" });
      return;
    }
    setAccount(r.data);
    setAmount("");
    showToast({ type: "ok", message: `${name} removed. Outstanding ${formatInr(r.data.balance)}.` });
  }

  const lastYear = account
    ? account.charges
        .filter((c) => c.kind === "OPENING" && c.periodKey === `opening:${account.academicYear}`)
        .reduce((sum, c) => sum + c.amount, 0)
    : 0;
  const optionalCharges = account
    ? account.charges.filter(
        (c) =>
          c.kind === "OTHER" &&
          c.amount > 0 &&
          !c.periodKey.includes(":discount:") &&
          !(c.note ?? "").startsWith("One-time discount")
      )
    : [];
  const postedYearly = account
    ? account.charges.find((c) => c.kind === "YEARLY" && c.periodKey === account.academicYear)?.amount
    : undefined;
  const yearlyShown = postedYearly ?? account?.yearlyPayable ?? 0;
  const history = account ? [...account.payments].reverse() : [];
  const collectionDiscounts = account
    ? account.charges
        .filter((c) => c.amount < 0 && (c.periodKey.includes(":discount:") || (c.note ?? "").startsWith("One-time discount")))
        .map((c) => ({
          id: c.id,
          amount: -c.amount,
          date: /^\d{4}-\d{2}-\d{2}/.test(c.periodKey) ? c.periodKey.slice(0, 10) : c.createdAt.slice(0, 10),
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    : [];

  return (
    <div className="space-y-4">
      {toast ? (
        <p className={`text-sm ${toast.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{toast.message}</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Find student</h2>
        <p className="text-sm text-slate-600 mt-1">Type a name or student ID. Class narrows that search.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Class</span>
            <select
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Name or student ID</span>
            <input
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              placeholder="Name or student ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>
        {searching ? <WorkingNote label="Searching…" /> : opening ? <WorkingNote label="Opening account…" /> : null}
        {hits.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {hits.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 min-h-[44px]"
                  onClick={() => void selectStudent(s.id, s.fullName)}
                >
                  <span className="font-medium text-slate-900">{s.fullName}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {account ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div>
            <p className="font-medium text-slate-900">{account.members.map((m) => m.fullName).join(", ")}</p>
            <p className="text-sm text-slate-600 mt-1">
              {account.members.map((m) => `${m.classLabel} ${m.sectionName}`).join(", ")}
            </p>
          </div>
          <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                <p>
                  <span className="text-slate-600">Payment plan: </span>
                  <span className="font-medium text-slate-900">{account.billingMode === "YEARLY" ? "Yearly" : "Monthly"}</span>
                </p>
                <p>
                  <span className="text-slate-600">
                    {account.billingMode === "YEARLY" ? "Agreed yearly fee: " : "Agreed monthly fee: "}
                  </span>
                  <span className="font-medium text-slate-900">
                    {account.billingMode === "YEARLY"
                      ? `${formatInr(yearlyShown)} for ${account.academicYear}`
                      : `${formatInr(account.netMonthly)} / month`}
                  </span>
                </p>
                {editingFee ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                    <label className="block">
                      <span className="block text-slate-600 mb-1">Payment</span>
                      <select
                        className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                        value={feeBillingMode}
                        onChange={(e) => {
                          const mode = e.target.value as FeeBillingMode;
                          setFeeBillingMode(mode);
                          if (mode === "YEARLY") {
                            const first = sessionMonths(account.academicYear)[0];
                            if (first) setFeeEffectiveFrom(first.key);
                            setFeeMonthlyInput(String(yearlyShown));
                          } else {
                            const classTuition = account.members.reduce((sum, member) => sum + member.classTuition, 0);
                            const transportNow = account.members.reduce((sum, member) => sum + member.transportAmount, 0);
                            setFeeMonthlyInput(String(Math.min(classTuition, Math.max(0, account.netMonthly - transportNow))));
                            setFeeEffectiveFrom(account.monthPeriod);
                          }
                        }}
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="YEARLY">Yearly</option>
                      </select>
                    </label>
                    {feeBillingMode === "YEARLY" ? (
                      <label className="block">
                        <span className="block text-slate-600 mb-1">Yearly fee (₹)</span>
                        <input
                          className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                          inputMode="numeric"
                          value={feeMonthlyInput}
                          onChange={(e) => setFeeMonthlyInput(e.target.value)}
                        />
                      </label>
                    ) : (
                      <>
                    <label className="block">
                      <span className="block text-slate-600 mb-1">Tuition (₹)</span>
                      <input
                        className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                        inputMode="numeric"
                        value={feeMonthlyInput}
                        onChange={(e) => setFeeMonthlyInput(e.target.value)}
                      />
                    </label>
                    {account.members.map((m) => (
                      <label key={m.studentId} className="block">
                        <span className="block text-slate-600 mb-1">{account.members.length > 1 ? `${m.fullName} transport (₹)` : "Transport (₹)"}</span>
                        <input
                          className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                          inputMode="numeric"
                          value={feeTransport[m.studentId] ?? ""}
                          onChange={(e) => setFeeTransport((current) => ({ ...current, [m.studentId]: e.target.value }))}
                        />
                      </label>
                    ))}
                    {oneTimeKeys.map((key) => {
                      const line = account.concessions[key];
                      if (line.gross <= 0 && !line.waived) return null;
                      return (
                        <label key={key} className="block">
                          <span className="block text-slate-600 mb-1">{oneTimeLabel(key)} (₹)</span>
                          <input
                            className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                            inputMode="numeric"
                            value={oneTimeAmounts[key]}
                            onChange={(e) => setOneTimeAmounts((current) => ({ ...current, [key]: e.target.value }))}
                          />
                        </label>
                      );
                    })}
                      </>
                    )}
                    <label className="block">
                      <span className="block text-slate-600 mb-1">Last year balance (₹)</span>
                      <input
                        className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                        inputMode="numeric"
                        value={lastYearInput}
                        onChange={(e) => setLastYearInput(e.target.value)}
                      />
                    </label>
                    {feeBillingMode === "YEARLY" ? null : (
                      <>
                    <p className="text-slate-800">
                      Monthly fee {formatInr((parseRupees(feeMonthlyInput) ?? 0) + account.members.reduce((sum, member) => sum + (parseRupees(feeTransport[member.studentId] ?? "") ?? 0), 0))} / month. This is tuition plus transport.
                    </p>
                    <label className="block">
                      <span className="block text-slate-600 mb-1">From</span>
                      <select
                        className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                        value={feeEffectiveFrom}
                        onChange={(e) => setFeeEffectiveFrom(e.target.value)}
                      >
                        {sessionMonths(account.academicYear).map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-slate-600">Clear a number and type the new amount. Months before the one you chose stay as they are.</p>
                      </>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-brand-600 text-white px-3 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void saveFee()}
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-2 text-sm font-medium min-h-[44px]"
                        onClick={() => setEditingFee(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : account.billingMode === "YEARLY" ? (
                  <div className="space-y-1">
                    <p>
                      <span className="text-slate-600">Last year balance: </span>
                      <span className="font-medium text-slate-900">{formatInr(lastYear)}</span>
                    </p>
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-sm font-medium min-h-[44px]"
                      onClick={openFeeEdit}
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p>
                      <span className="text-slate-600">Tuition: </span>
                      <span className="font-medium text-slate-900">
                        {formatInr(Math.min(account.members.reduce((sum, member) => sum + member.classTuition, 0), Math.max(0, account.netMonthly - account.members.reduce((sum, member) => sum + member.transportAmount, 0))))} / month
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-600">Transport: </span>
                      <span className="font-medium text-slate-900">
                        {account.members.map((m) => `${account.members.length > 1 ? `${m.fullName} ` : ""}${formatInr(m.transportAmount)}`).join(", ")} / month
                      </span>
                    </p>
                    {oneTimeKeys.map((key) => {
                      const line = account.concessions[key];
                      if (line.gross <= 0 && !line.waived) return null;
                      return (
                        <p key={key}>
                          <span className="text-slate-600">{oneTimeLabel(key)}: </span>
                          <span className="font-medium text-slate-900">{formatInr(line.net)}</span>
                        </p>
                      );
                    })}
                    <p>
                      <span className="text-slate-600">Last year balance: </span>
                      <span className="font-medium text-slate-900">{formatInr(lastYear)}</span>
                    </p>
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-sm font-medium min-h-[44px]"
                      onClick={openFeeEdit}
                    >
                      Edit
                    </button>
                  </div>
                )}
                {optionalCharges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between gap-2">
                    <p>
                      <span className="text-slate-600">{charge.note?.trim() || "Optional charge"}: </span>
                      <span className="font-medium text-slate-900">{formatInr(charge.amount)}</span>
                    </p>
                    <button
                      type="button"
                      className="text-sm text-slate-600 underline min-h-[44px]"
                      disabled={busy}
                      onClick={() => void removeOptionalCharge(charge.id, charge.note?.trim() || "Optional charge")}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {addingCharge ? (
                  <div className="space-y-2">
                    <label className="block">
                      <span className="block text-slate-600 mb-1">Name</span>
                      <input
                        className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                        value={extraName}
                        onChange={(e) => setExtraName(e.target.value)}
                        placeholder="I card, books"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-slate-600 mb-1">Amount (₹)</span>
                      <input
                        className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                        inputMode="numeric"
                        value={extraAmount}
                        onChange={(e) => setExtraAmount(e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-sm font-semibold min-h-[44px] disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void addOptionalCharge()}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-sm font-medium min-h-[44px]"
                        onClick={() => {
                          setAddingCharge(false);
                          setExtraName("");
                          setExtraAmount("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-sm font-medium min-h-[44px]"
                    onClick={() => setAddingCharge(true)}
                  >
                    Add charge
                  </button>
                )}
                <p>
                  <span className="text-slate-600">This year: </span>
                  <span className="font-medium text-slate-900">{formatInr(account.charged - lastYear)}</span>
                </p>
                <p>
                  <span className="text-slate-600">Paid: </span>
                  <span className="font-medium text-slate-900">{formatInr(account.paid)}</span>
                </p>
                <p>
                  <span className="text-slate-600">Outstanding: </span>
                  <span className="font-medium text-slate-900">{formatInr(account.balance)}</span>
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">Amount received</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">Discount now (₹)</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                    inputMode="numeric"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="0"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">How paid</span>
                  <select
                    className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as FeePaymentMode)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK">Bank</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">Date</span>
                  <input
                    type="date"
                    className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                    value={paidOn}
                    onChange={(e) => setPaidOn(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-slate-600 mb-1">Note</span>
                  <input
                    className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>
              <p className="text-sm text-slate-600">
                A discount comes off the outstanding balance once. The monthly fee stays the same. The receipt is only the amount received.
              </p>
              {(parseRupees(discountInput) ?? 0) > 0 ? (
                <p className="text-sm text-slate-800">
                  Outstanding after this:{" "}
                  {formatInr(account.balance - (parseRupees(discountInput) ?? 0) - (parseRupees(amount) ?? 0))}. The monthly fee stays {formatInr(account.netMonthly)}.
                </p>
              ) : null}
              <button
                type="button"
                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
                disabled={busy}
                onClick={() => void collect()}
              >
                Save payment
              </button>
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <h3 className="font-medium text-slate-900">Receipts</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-slate-600">No receipts yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {history.map((payment) => (
                      <li key={payment.id} className="p-3 text-sm">
                        {editingId === payment.id ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <label>
                              <span className="block text-slate-600 mb-1">Amount</span>
                              <input
                                className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                                inputMode="numeric"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                              />
                            </label>
                            <label>
                              <span className="block text-slate-600 mb-1">How paid</span>
                              <select
                                className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                                value={editMode}
                                onChange={(e) => setEditMode(e.target.value as FeePaymentMode)}
                              >
                                <option value="CASH">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="BANK">Bank</option>
                              </select>
                            </label>
                            <label>
                              <span className="block text-slate-600 mb-1">Date</span>
                              <input
                                type="date"
                                className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                                value={editPaidOn}
                                onChange={(e) => setEditPaidOn(e.target.value)}
                              />
                            </label>
                            <label>
                              <span className="block text-slate-600 mb-1">Note</span>
                              <input
                                className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                              />
                            </label>
                            <div className="flex flex-wrap gap-2 md:col-span-2">
                              <button
                                type="button"
                                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
                                disabled={busy}
                                onClick={() => void saveEdit()}
                              >
                                Save correction
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border px-4 py-2 text-sm font-medium min-h-[44px]"
                                onClick={() => setEditingId("")}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-900">
                                {payment.receiptNo} · {formatInr(payment.amount)}
                              </p>
                              <p className="text-slate-600">
                                {payment.paidOn} · {payment.mode}
                                {payment.note ? ` · ${payment.note}` : ""}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="rounded-lg border px-3 py-2 text-sm font-medium min-h-[44px]"
                                onClick={() => startEdit(payment)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 min-h-[44px] disabled:opacity-50"
                                disabled={busy}
                                onClick={() => void removeReceipt(payment)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-slate-600">Editing or deleting a receipt changes the outstanding balance. It does not change the monthly fee.</p>
                <h3 className="font-medium text-slate-900 pt-2">Discounts at payment</h3>
                {collectionDiscounts.length === 0 ? (
                  <p className="text-sm text-slate-600">No one-time discount has been given on this account.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {collectionDiscounts.map((row) => (
                      <li key={row.id} className="p-3 text-sm">
                        <p className="font-medium text-slate-900">{formatInr(row.amount)} off the outstanding balance</p>
                        <p className="text-slate-600">{row.date}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
          </>
        </section>
      ) : (
        <p className="text-slate-600">Search a student to collect a fee.</p>
      )}
    </div>
  );
}
