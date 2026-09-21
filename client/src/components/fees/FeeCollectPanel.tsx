import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import {
  formatInr,
  istToday,
  parseRupees,
  printFeeReceipt,
  type FeeAccountSnapshot,
  type FeePaymentMode,
} from "../../fees";

type StudentHit = {
  id: string;
  fullName: string;
  username: string;
  className: string;
  classLabel: string;
  sectionName: string;
};

type Toast = { type: "ok" | "err"; message: string };

export function FeeCollectPanel({ openStudentId }: { openStudentId?: string | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [studentId, setStudentId] = useState("");
  const [account, setAccount] = useState<FeeAccountSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<FeePaymentMode>("CASH");
  const [paidOn, setPaidOn] = useState(istToday);
  const [note, setNote] = useState("");

  const [siblingQ, setSiblingQ] = useState("");
  const [siblingHits, setSiblingHits] = useState<StudentHit[]>([]);
  const [siblingId, setSiblingId] = useState("");
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [extraKind, setExtraKind] = useState<"OPENING" | "OTHER" | "ANNUAL" | "ADMISSION" | "EXAM">("OTHER");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraNote, setExtraNote] = useState("");

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (openStudentId) void selectStudent(openStudentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when parent asks to open a pending student
  }, [openStudentId]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const r = await api<{ students: StudentHit[] }>(
          `/api/v1/admin/students?q=${encodeURIComponent(term)}&pageSize=20`
        );
        setHits(r.data?.students ?? []);
      })();
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const term = siblingQ.trim();
    if (term.length < 2) {
      setSiblingHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const r = await api<{ students: StudentHit[] }>(
          `/api/v1/admin/students?q=${encodeURIComponent(term)}&pageSize=20`
        );
        setSiblingHits(r.data?.students ?? []);
      })();
    }, 250);
    return () => window.clearTimeout(t);
  }, [siblingQ]);

  async function loadAccount(id: string) {
    setBusy(true);
    setErr(null);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${id}`);
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not load fee account");
      setAccount(null);
      return;
    }
    setAccount(r.data);
    setParentName(r.data.parentName ?? "");
    setPhone(r.data.phone ?? "");
    setAmount(String(Math.max(0, r.data.balance) || r.data.familyMonthlyFee));
    setPaidOn(istToday());
  }

  async function selectStudent(id: string, name?: string) {
    setStudentId(id);
    setQ(name ?? q);
    setHits([]);
    await loadAccount(id);
  }

  async function addThisMonth() {
    if (!studentId || !account) return;
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/generate-month`, {
      method: "POST",
      json: { periodKey: account.monthPeriod, academicYear: account.academicYear },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not add this month" });
      return;
    }
    setAccount(r.data);
    setAmount(String(Math.max(0, r.data.balance)));
    showToast({ type: "ok", message: `${account.monthLabel} fee added to this family account.` });
  }

  async function collect() {
    if (!studentId) return;
    const rupees = parseRupees(amount);
    if (rupees == null || rupees < 1) {
      showToast({ type: "err", message: "Enter a valid amount." });
      return;
    }
    setBusy(true);
    const r = await api<{ snapshot: FeeAccountSnapshot; payment: { receiptNo: string; amount: number; mode: FeePaymentMode; paidOn: string } }>(
      `/api/v1/admin/fees/students/${studentId}/pay`,
      { method: "POST", json: { amount: rupees, mode, paidOn, note: note.trim() || undefined } }
    );
    setBusy(false);
    if (!r.ok || !r.data?.snapshot) {
      showToast({ type: "err", message: r.error ?? "Payment failed" });
      return;
    }
    setAccount(r.data.snapshot);
    setNote("");
    setAmount(String(Math.max(0, r.data.snapshot.balance)));
    showToast({ type: "ok", message: `Receipt ${r.data.payment.receiptNo} saved. Sibling accounts updated.` });
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

  async function linkSibling() {
    if (!studentId || !siblingId) return;
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/link-sibling`, {
      method: "POST",
      json: { siblingStudentId: siblingId },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not link sibling" });
      return;
    }
    setAccount(r.data);
    setSiblingQ("");
    setSiblingId("");
    setSiblingHits([]);
    setAmount(String(Math.max(0, r.data.balance) || r.data.familyMonthlyFee));
    showToast({ type: "ok", message: "Siblings now share one family fee. Same total on both accounts." });
  }

  async function unlink(id: string) {
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${id}/unlink`, { method: "POST" });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not unlink" });
      return;
    }
    setAccount(r.data);
    showToast({ type: "ok", message: "Student removed from the family fee account." });
  }

  async function toggleTransport(id: string, usesTransport: boolean) {
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${id}/transport`, {
      method: "PATCH",
      json: { usesTransport },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not update transport" });
      return;
    }
    setAccount(r.data);
    setAmount(String(Math.max(0, r.data.balance) || r.data.familyMonthlyFee));
  }

  async function saveContact() {
    if (!studentId) return;
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/contact`, {
      method: "PATCH",
      json: { parentName, phone },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not save contact" });
      return;
    }
    setAccount(r.data);
    showToast({ type: "ok", message: "Parent contact saved on this family account." });
  }

  async function addExtra() {
    if (!studentId) return;
    const rupees = parseRupees(extraAmount);
    if (rupees == null || rupees < 1) {
      showToast({ type: "err", message: "Enter a valid extra amount." });
      return;
    }
    setBusy(true);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${studentId}/charge`, {
      method: "POST",
      json: { kind: extraKind, amount: rupees, note: extraNote.trim() || undefined },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Could not add charge" });
      return;
    }
    setAccount(r.data);
    setExtraAmount("");
    setExtraNote("");
    setAmount(String(Math.max(0, r.data.balance)));
    showToast({ type: "ok", message: "Charge added to the family account." });
  }

  const siblingFilter = useMemo(() => {
    const inAccount = new Set(account?.members.map((m) => m.studentId) ?? []);
    return siblingHits.filter((s) => !inAccount.has(s.id));
  }, [account, siblingHits]);

  return (
    <div className="space-y-4">
      {toast ? (
        <p className={`text-sm ${toast.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{toast.message}</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Find student</h2>
        <p className="text-sm text-slate-600 mt-1">
          Open any sibling — both accounts show the same family total. Pay once and both update.
        </p>
        <input
          className="mt-3 w-full rounded-lg border px-3 py-2 min-h-[44px]"
          placeholder="Name or student ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {hits.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {hits.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 min-h-[44px]"
                  onClick={() => void selectStudent(s.id, s.fullName)}
                >
                  <span className="font-medium text-slate-900">{s.fullName}</span>
                  <span className="text-sm text-slate-600">
                    {" "}
                    · {s.classLabel} {s.sectionName}
                    {s.username ? ` · ${s.username}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {account ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Family fee account</h2>
                <p className="text-sm text-slate-600 mt-1">
                  {account.members.length > 1
                    ? `${account.members.length} siblings · same ₹ total on every child`
                    : "Single student account"}
                </p>
              </div>
              {!account.monthCharged ? (
                <button
                  type="button"
                  className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void addThisMonth()}
                >
                  Add {account.monthLabel} fee
                </button>
              ) : (
                <p className="text-sm text-emerald-700">{account.monthLabel} already on this account</p>
              )}
            </div>
            {account.missingStructure ? (
              <p className="mt-2 text-sm text-amber-700">
                Set class fees in the Structure tab so monthly totals are not zero.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Family monthly</p>
                <p className="text-2xl font-bold text-slate-900">{formatInr(account.familyMonthlyFee)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Paid</p>
                <p className="text-2xl font-bold text-slate-900">{formatInr(account.paid)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Balance</p>
                <p className={`text-2xl font-bold ${account.balance > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {formatInr(account.balance)}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Class fee</th>
                    <th className="py-2 pr-3">Transport</th>
                    <th className="py-2">This child’s share</th>
                  </tr>
                </thead>
                <tbody>
                  {account.members.map((m) => (
                    <tr key={m.studentId} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-900">{m.fullName}</p>
                        <p className="text-slate-600">
                          {m.classLabel} {m.sectionName}
                          {m.studentLoginId ? ` · ${m.studentLoginId}` : ""}
                        </p>
                      </td>
                      <td className="py-2 pr-3">{formatInr(m.classTuition)}</td>
                      <td className="py-2 pr-3">
                        <label className="inline-flex items-center gap-2 min-h-[44px]">
                          <input
                            type="checkbox"
                            checked={m.usesTransport}
                            disabled={busy}
                            onChange={(e) => void toggleTransport(m.studentId, e.target.checked)}
                          />
                          {m.usesTransport ? formatInr(m.classTransport) : "No"}
                        </label>
                      </td>
                      <td className="py-2 font-medium">{formatInr(m.monthlyFee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {account.members.length > 1 ? (
              <p className="mt-2 text-sm text-slate-600">
                Shown on every sibling: family monthly {formatInr(account.familyMonthlyFee)} (not counted twice in school
                totals).
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">Collect fee</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-sm md:col-span-1">
                <span className="block text-slate-600 mb-1">Amount</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Mode</span>
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
            <button
              type="button"
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
              disabled={busy}
              onClick={() => void collect()}
            >
              Save payment
            </button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">Siblings</h2>
            <p className="text-sm text-slate-600">
              Link children of the same parent. Class fees stay different; the account shows the combined total.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Parent / guardian</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Phone</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
              disabled={busy}
              onClick={() => void saveContact()}
            >
              Save contact
            </button>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Search sibling to link</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                  value={siblingQ}
                  onChange={(e) => setSiblingQ(e.target.value)}
                  placeholder="Other child’s name"
                />
              </label>
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Sibling</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                  value={siblingId}
                  onChange={(e) => setSiblingId(e.target.value)}
                >
                  <option value="">Select</option>
                  {siblingFilter.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} · {s.classLabel} {s.sectionName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
              disabled={busy || !siblingId}
              onClick={() => void linkSibling()}
            >
              Link sibling
            </button>
            {account.members.length > 1 ? (
              <ul className="text-sm text-slate-700 space-y-1">
                {account.members.map((m) => (
                  <li key={m.studentId} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {m.fullName} · {m.classLabel} {m.sectionName}
                    </span>
                    <button
                      type="button"
                      className="text-rose-700 underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void unlink(m.studentId)}
                    >
                      Remove from family
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">Extra charge</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <select
                className="rounded-lg border px-3 py-2 min-h-[44px]"
                value={extraKind}
                onChange={(e) => setExtraKind(e.target.value as typeof extraKind)}
              >
                <option value="OTHER">Other</option>
                <option value="OPENING">Opening / previous due</option>
                <option value="ANNUAL">Annual</option>
                <option value="ADMISSION">Admission</option>
                <option value="EXAM">Exam</option>
              </select>
              <input
                className="rounded-lg border px-3 py-2 min-h-[44px]"
                placeholder="Amount"
                inputMode="numeric"
                value={extraAmount}
                onChange={(e) => setExtraAmount(e.target.value)}
              />
              <input
                className="rounded-lg border px-3 py-2 min-h-[44px] md:col-span-2"
                placeholder="Note"
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
              disabled={busy}
              onClick={() => void addExtra()}
            >
              Add charge
            </button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
            <h2 className="font-semibold text-slate-900">Ledger</h2>
            <table className="mt-3 min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Particular</th>
                  <th className="p-2 text-right">Debit</th>
                  <th className="p-2 text-right">Credit</th>
                  <th className="p-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {account.ledger.length === 0 ? (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={5}>
                      No entries yet. Add this month’s fee, then collect payment.
                    </td>
                  </tr>
                ) : (
                  account.ledger.map((row) => (
                    <tr key={`${row.type}-${row.id}`} className="border-t border-slate-100">
                      <td className="p-2 whitespace-nowrap">{row.date}</td>
                      <td className="p-2">{row.particular}</td>
                      <td className="p-2 text-right">{row.debit ? formatInr(row.debit) : "—"}</td>
                      <td className="p-2 text-right">{row.credit ? formatInr(row.credit) : "—"}</td>
                      <td className="p-2 text-right font-medium">{formatInr(row.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <p className="text-slate-600">Search a student to open the fee account.</p>
      )}
    </div>
  );
}
