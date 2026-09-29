import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { formatInr, type FeeAccountSnapshot } from "../../fees";

type StudentHit = {
  id: string;
  fullName: string;
  username: string;
  className: string;
  classLabel: string;
  sectionName: string;
};

type ClassOption = { id: string; name: string };

type Toast = { type: "ok" | "err"; message: string };

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

const oneTimeRows = [
  { key: "annual", label: "Annual" },
  { key: "admission", label: "Activity" },
  { key: "registration", label: "Registration" },
  { key: "exam", label: "Exam" },
] as const;

function studentSearchUrl(term: string, classId: string): string | null {
  const q = term.trim();
  if (q.length < 2) return null;
  const params = new URLSearchParams();
  params.set("q", q);
  if (classId) params.set("classId", classId);
  params.set("page", "1");
  params.set("pageSize", "20");
  return `/api/v1/admin/students?${params}`;
}

function AccountFeeSummary({ account }: { account: FeeAccountSnapshot }) {
  const from = account.discountEffectiveFrom
    ? sessionMonths(account.academicYear).find((m) => m.key === account.discountEffectiveFrom)?.label
    : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
      <p>
        <span className="text-slate-600">Payment plan: </span>
        <span className="font-medium text-slate-900">{account.billingMode === "YEARLY" ? "Yearly" : "Monthly"}</span>
      </p>
      <p>
        <span className="text-slate-600">Standard fee: </span>
        <span className="font-medium text-slate-900">{formatInr(account.grossMonthly)} / month</span>
      </p>
      <p>
        <span className="text-slate-600">Discount: </span>
        <span className="font-medium text-slate-900">{formatInr(account.monthlyDiscount)}</span>
      </p>
      <p>
        <span className="text-slate-600">{account.billingMode === "YEARLY" ? "Agreed yearly fee: " : "Payable: "}</span>
        <span className="font-medium text-slate-900">
          {account.billingMode === "YEARLY"
            ? `${formatInr(account.yearlyPayable)} for ${account.academicYear}`
            : `${formatInr(account.netMonthly)} / month`}
        </span>
      </p>
      {account.members.some((m) => m.transportAmount > 0) ? (
        <p>
          <span className="text-slate-600">Transport: </span>
          <span className="font-medium text-slate-900">
            {account.members.map((m) => `${m.fullName} ${formatInr(m.transportAmount)}`).join(", ")} / month
          </span>
        </p>
      ) : null}
      {oneTimeRows.map((row) => {
        const line = account.concessions[row.key];
        if (line.gross <= 0 && !line.waived) return null;
        return (
          <p key={row.key}>
            <span className="text-slate-600">{row.label}: </span>
            <span className="font-medium text-slate-900">{line.waived ? "Nil" : formatInr(line.net)}</span>
            {line.discount > 0 && !line.waived ? <span className="text-slate-600"> (standard {formatInr(line.gross)})</span> : null}
          </p>
        );
      })}
      {from ? <p className="text-slate-600">From {from}. Earlier months stay as they were.</p> : null}
      {account.paid > 0 ? (
        <p>
          <span className="text-slate-600">Paid {formatInr(account.paid)}. Outstanding </span>
          <span className="font-medium text-slate-900">{formatInr(account.balance)}</span>
        </p>
      ) : null}
    </div>
  );
}


export function FeeAccountPanel({ openStudentId }: { openStudentId?: string | null }) {
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [studentId, setStudentId] = useState("");
  const [account, setAccount] = useState<FeeAccountSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [siblingQ, setSiblingQ] = useState("");
  const [siblingClassId, setSiblingClassId] = useState("");
  const [siblingHits, setSiblingHits] = useState<StudentHit[]>([]);
  const [siblingId, setSiblingId] = useState("");
  const [addingSibling, setAddingSibling] = useState(false);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadAccount = useCallback(async (id: string) => {
    setBusy(true);
    setErr(null);
    const r = await api<FeeAccountSnapshot>(`/api/v1/admin/fees/students/${id}`);
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Could not open this account");
      setAccount(null);
      return;
    }
    setAccount(r.data);
  }, []);

  const selectStudent = useCallback(
    async (id: string, name?: string) => {
      setStudentId(id);
      setQ(name ?? "");
      setHits([]);
      setSiblingQ("");
      setSiblingId("");
      setSiblingHits([]);
      setAddingSibling(false);
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
    const url = studentSearchUrl(q, classId);
    if (!url) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const r = await api<{ students: StudentHit[] }>(url);
        setHits(r.data?.students ?? []);
      })();
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, classId]);

  useEffect(() => {
    const url = studentSearchUrl(siblingQ, siblingClassId);
    if (!url) {
      setSiblingHits([]);
      setSiblingId("");
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const r = await api<{ students: StudentHit[] }>(url);
        setSiblingHits(r.data?.students ?? []);
      })();
    }, 250);
    return () => window.clearTimeout(t);
  }, [siblingQ, siblingClassId]);

  const siblingFilter = useMemo(() => {
    const inAccount = new Set(account?.members.map((m) => m.studentId) ?? []);
    return siblingHits.filter((s) => !inAccount.has(s.id));
  }, [account, siblingHits]);

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
    setAddingSibling(false);
    showToast({ type: "ok", message: "Sibling added. They now share this family account." });
  }


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
          <div className="space-y-3">
            <p className="font-medium text-slate-900">{account.members.map((m) => m.fullName).join(", ")}</p>
            {addingSibling ? null : (
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm font-medium min-h-[44px]"
                onClick={() => setAddingSibling(true)}
              >
                Add sibling
              </button>
            )}
            {addingSibling ? (
            <>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="block text-slate-600 mb-1">Class</span>
                <select
                  className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                  value={siblingClassId}
                  onChange={(e) => {
                    setSiblingClassId(e.target.value);
                    setSiblingId("");
                  }}
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
                <span className="block text-slate-600 mb-1">Name</span>
                <input
                  className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                  value={siblingQ}
                  onChange={(e) => setSiblingQ(e.target.value)}
                  placeholder="Name"
                />
              </label>
              {siblingQ.trim().length >= 2 ? (
                <label className="text-sm md:col-span-2">
                  <span className="block text-slate-600 mb-1">Sibling</span>
                  <select
                    className="w-full rounded-lg border px-3 py-2 min-h-[44px]"
                    value={siblingId}
                    onChange={(e) => setSiblingId(e.target.value)}
                  >
                    <option value="">{siblingFilter.length ? "Select" : "No match"}</option>
                    {siblingFilter.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {siblingQ.trim().length >= 2 ? (
              <button
                type="button"
                className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
                disabled={busy || !siblingId}
                onClick={() => void linkSibling()}
              >
                Add to this account
              </button>
            ) : null}
            </>
            ) : null}
            {addingSibling ? null : <AccountFeeSummary account={account} />}
          </div>
        </section>
      ) : (
        <p className="text-slate-600">Search a student to open the family account.</p>
      )}
    </div>
  );
}
