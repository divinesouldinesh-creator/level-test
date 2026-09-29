import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { formatInr, type FeeCollections, type FeeSchoolTotals, type SchoolAccountsReport } from "../../fees";

type ClassRow = { id: string; name: string };
type Toast = { type: "ok" | "err"; message: string };

export function FeeSchoolPanel({ onOpenStudent }: { onOpenStudent?: (studentId: string) => void }) {
  const [report, setReport] = useState<SchoolAccountsReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [totals, setTotals] = useState<FeeSchoolTotals | null>(null);
  const [collections, setCollections] = useState<FeeCollections | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [periodKey, setPeriodKey] = useState("");
  const [classId, setClassId] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async (day?: string) => {
    const qs = day ? `?paidOn=${encodeURIComponent(day)}` : "";
    const [school, coll, meta, classList] = await Promise.all([
      api<FeeSchoolTotals>(`/api/v1/admin/fees/school${qs}`),
      api<FeeCollections>(`/api/v1/admin/fees/collections${qs}`),
      api<{ monthPeriod: string; today: string }>("/api/v1/admin/fees/meta"),
      api<ClassRow[]>("/api/v1/admin/classes"),
    ]);
    if (!school.ok || !school.data) {
      setErr(school.error ?? "Could not load school totals");
      return;
    }
    setErr(null);
    setTotals(school.data);
    setCollections(coll.data ?? null);
    const metaData = meta.data;
    if (metaData) {
      setPeriodKey((prev) => prev || metaData.monthPeriod);
      setPaidOn((prev) => prev || metaData.today);
    }
    setClasses(classList.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await api<SchoolAccountsReport>("/api/v1/admin/fees/school-report");
      if (cancelled) return;
      if (!r.ok || !r.data) {
        setReportError(r.error ?? "Could not load the school report");
        return;
      }
      setReportError(null);
      setReport(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    if (!periodKey) return;
    setBusy(true);
    const r = await api<{ accounts: number; totalAmount: number }>(`/api/v1/admin/fees/generate-month`, {
      method: "POST",
      json: { periodKey, classId: classId || undefined },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      showToast({ type: "err", message: r.error ?? "Generate failed" });
      return;
    }
    showToast({
      type: "ok",
      message: `Posted ${periodKey} on ${r.data.accounts} family accounts (${formatInr(r.data.totalAmount)}). Sibling groups counted once.`,
    });
    await load(paidOn);
  }

  async function refreshDay() {
    await load(paidOn);
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <p className={`text-sm ${toast.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{toast.message}</p>
      ) : null}
      {reportError ? <p className="text-sm text-red-600">{reportError}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">School report{report ? ` · ${report.academicYear}` : ""}</h2>
        <p className="text-sm text-slate-600 mt-1">
          The school total is everything still owed, with each family counted once. Under it, that total is compared with
          the last year balances entered on the accounts.
        </p>
        {report ? (
          <>
            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">School total</p>
              <p
                className={`text-3xl font-bold mt-1 ${report.schoolTotal > 0 ? "text-rose-700" : "text-emerald-700"}`}
              >
                {formatInr(report.schoolTotal)}
              </p>
              <p className="text-sm text-slate-700 mt-1">{schoolYearCompare(report.schoolTotal, report.lastYearOpening)}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat
                label="Monthly payers pending"
                value={String(report.monthlyPayerPendingCount)}
                hint={`Still to pay ${formatInr(report.monthlyPayerPendingAmount)}`}
                tone={report.monthlyPayerPendingCount > 0 ? "warn" : "ok"}
              />
              <Stat
                label="Current year balance"
                value={formatInr(report.currentYearBalance)}
                tone={report.currentYearBalance > 0 ? "warn" : "ok"}
              />
              <Stat
                label="Last year balance"
                value={formatInr(report.lastYearBalance)}
                tone={report.lastYearBalance > 0 ? "warn" : "ok"}
              />
            </div>
            <h3 className="mt-6 font-semibold text-slate-900">Paid in {report.monthLabel}</h3>
            <p className="mt-1 text-sm text-slate-600">
              Children who paid this month, out of the class. The higher share is first. A family payment counts for each child in that child’s class.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="p-2">Class</th>
                    <th className="p-2 text-right">Paid this month</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.classes]
                    .sort((a, b) => {
                      const aShare = a.studentCount > 0 ? a.paidThisMonth / a.studentCount : 0;
                      const bShare = b.studentCount > 0 ? b.paidThisMonth / b.studentCount : 0;
                      if (bShare !== aShare) return bShare - aShare;
                      return a.className.localeCompare(b.className, undefined, { numeric: true });
                    })
                    .map((row) => (
                      <tr key={row.classId} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-900">{row.className}</td>
                        <td className="p-2 text-right">
                          {row.paidThisMonth} of {row.studentCount} ·{" "}
                          {row.studentCount > 0 ? Math.round((row.paidThisMonth / row.studentCount) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              By class, this year’s balance is what is still owed, on the senior child’s class. Last year is the amount entered on the account, and a payment does not remove it. Each child who still owes is counted in their own class.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="p-2">Class</th>
                    <th className="p-2 text-right">Students pending</th>
                    <th className="p-2 text-right">Current year</th>
                    <th className="p-2 text-right">Last year</th>
                  </tr>
                </thead>
                <tbody>
                  {report.classes.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={4}>
                        No classes yet.
                      </td>
                    </tr>
                  ) : (
                    report.classes.map((row) => (
                      <tr key={row.classId} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-900">{row.className}</td>
                        <td className="p-2 text-right">{row.studentsPending}</td>
                        <td className="p-2 text-right">{formatInr(row.currentYearBalance)}</td>
                        <td className="p-2 text-right">{formatInr(row.lastYearBalance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : reportError ? null : (
          <p className="mt-3 text-sm text-slate-500">Loading school report…</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Generate monthly dues</h2>
        <p className="text-sm text-slate-600 mt-1">
          Each sibling family gets one combined charge. School totals will not count them twice.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Month</span>
            <input
              type="month"
              className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Class (optional)</span>
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
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
              disabled={busy || !periodKey}
              onClick={() => void generate()}
            >
              Generate month
            </button>
          </div>
        </div>
      </section>

      {totals ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">School totals · {totals.academicYear}</h2>
          <p className="text-sm text-slate-600 mt-1">
            {totals.accountCount} fee accounts · {totals.studentCount} students · {totals.siblingFamilyCount} sibling
            families. Sibling screens may show the same ₹ amount; reports count the family once.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Charged" value={formatInr(totals.charged)} />
            <Stat label="Collected" value={formatInr(totals.paid)} />
            <Stat label="Outstanding" value={formatInr(totals.balance)} tone={totals.balance > 0 ? "warn" : "ok"} />
            <Stat label={`Today (${totals.today})`} value={formatInr(totals.todayPaid)} hint={`${totals.todayReceipts} receipts`} />
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Collection date</span>
            <input
              type="date"
              className="rounded-lg border px-3 py-2 min-h-[44px]"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm font-medium min-h-[44px]"
            onClick={() => void refreshDay()}
          >
            Show
          </button>
        </div>
        <h3 className="mt-4 font-medium text-slate-900">
          Collections {collections ? `· ${formatInr(collections.total)} · ${collections.count} receipts` : ""}
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="p-2">Receipt</th>
                <th className="p-2">For</th>
                <th className="p-2">Mode</th>
                <th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(collections?.payments.length ?? 0) === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={4}>
                    No receipts on this date.
                  </td>
                </tr>
              ) : (
                collections!.payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-2 whitespace-nowrap">{p.receiptNo}</td>
                    <td className="p-2">{p.members.join(", ")}</td>
                    <td className="p-2">{p.mode}</td>
                    <td className="p-2 text-right font-medium">{formatInr(p.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
        <h2 className="font-semibold text-slate-900">Pending (one row per family)</h2>
        <table className="mt-3 min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="p-2">Account</th>
              <th className="p-2 text-right">Charged</th>
              <th className="p-2 text-right">Paid</th>
              <th className="p-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(totals?.pending.length ?? 0) === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={4}>
                  No pending balances.
                </td>
              </tr>
            ) : (
              totals!.pending.map((row) => (
                <tr key={row.accountId} className="border-t border-slate-100">
                  <td className="p-2">
                    {row.members.map((m) => (
                      <button
                        key={m.studentId}
                        type="button"
                        className="block text-left text-brand-700 hover:underline"
                        onClick={() => onOpenStudent?.(m.studentId)}
                      >
                        {m.fullName} · {m.classLabel} {m.sectionName}
                      </button>
                    ))}
                  </td>
                  <td className="p-2 text-right">{formatInr(row.charged)}</td>
                  <td className="p-2 text-right">{formatInr(row.paid)}</td>
                  <td className="p-2 text-right font-medium">{formatInr(row.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function schoolYearCompare(total: number, lastYear: number): string {
  if (lastYear <= 0) return "No last year balance";
  const gap = Math.abs(total - lastYear);
  if (total > lastYear) return `Up by ${formatInr(gap)} from last year ${formatInr(lastYear)}`;
  if (total < lastYear) return `Down by ${formatInr(gap)} from last year ${formatInr(lastYear)}`;
  return `Same as last year ${formatInr(lastYear)}`;
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 ${
          tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
    </div>
  );
}
