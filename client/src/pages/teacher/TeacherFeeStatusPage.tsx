import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { formatInr } from "../../fees";
import { teacherPortalNav } from "./teacherPortalNav";

type SectionRow = { id: string; name: string };
type ClassRow = { id: string; name: string; grade: string | null; studentCount: number; sections: SectionRow[] };
type FeeStatusStudent = {
  studentId: string;
  fullName: string;
  billingMode: "MONTHLY" | "YEARLY" | null;
  balance: number;
  lastYearBalance: number;
  payments: { id: string; paidOn: string; amount: number }[];
};
type FeeStatusReport = {
  academicYear: string;
  className: string;
  sectionName: string;
  dueCount: number;
  students: FeeStatusStudent[];
};

function lastYearCompare(balance: number, lastYear: number): string {
  if (lastYear <= 0) return "No last year balance";
  const gap = Math.abs(balance - lastYear);
  if (balance > lastYear) return `Up by ${formatInr(gap)} from last year ${formatInr(lastYear)}`;
  if (balance < lastYear) return `Down by ${formatInr(gap)} from last year ${formatInr(lastYear)}`;
  return `Same as last year ${formatInr(lastYear)}`;
}

function paymentDateLabel(paidOn: string): string {
  const [year, month, day] = paidOn.split("-").map(Number);
  if (!year || !month || !day) return paidOn;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function TeacherFeeStatusPage() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [report, setReport] = useState<FeeStatusReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dueOnly, setDueOnly] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) {
        setError(r.error ?? "Could not load classes");
        return;
      }
      const list = r.data ?? [];
      setClasses(list);
      if (list.length > 0) {
        setClassId(list[0]!.id);
        setSectionId(list[0]!.sections[0]?.id ?? "");
      }
    })();
  }, []);

  const selectedClass = classes.find((row) => row.id === classId);
  const sections = selectedClass?.sections ?? [];

  useEffect(() => {
    if (sections.length === 0) {
      setSectionId("");
      return;
    }
    if (!sections.some((section) => section.id === sectionId)) {
      setSectionId(sections[0]!.id);
    }
  }, [classId, sectionId, sections]);

  useEffect(() => {
    if (!classId || !sectionId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const r = await api<FeeStatusReport>(
        `/api/v1/teacher/fees/status?classId=${encodeURIComponent(classId)}&sectionId=${encodeURIComponent(sectionId)}`
      );
      if (cancelled) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setReport(null);
        setError(r.error ?? "Could not load fee status");
        return;
      }
      setReport(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, sectionId]);

  const visibleStudents = (report?.students ?? []).filter((student) => !dueOnly || student.balance > 0);

  return (
    <AppShell title={auth.profile?.fullName ?? "Teacher"} onLogout={logout} nav={[...teacherPortalNav]}>
      <h1 className="text-2xl font-bold text-slate-900">Fee status</h1>
      <p className="text-slate-600 mt-1">
        See who pays monthly or yearly, the balance, and the last payment. This list does not collect or change a fee.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="text-sm text-slate-700">
          Class
          <select
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
          >
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Section
          <select
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700 flex items-end gap-2 pb-2">
          <input type="checkbox" checked={dueOnly} onChange={(event) => setDueOnly(event.target.checked)} />
          Still to pay only
        </label>
      </div>

      {error ? <p className="text-red-600 mt-3">{error}</p> : null}
      {loading ? <p className="text-slate-500 mt-4">Loading fee status…</p> : null}

      {report && !loading ? (
        <>
          <p className="mt-4 text-sm text-slate-700">
            {report.className} · Section {report.sectionName} · {report.academicYear}.{" "}
            <span className="font-medium text-slate-900">{report.dueCount}</span> still to pay of {report.students.length}.
          </p>
          {visibleStudents.length === 0 ? (
            <p className="mt-4 text-slate-600">No children in this list.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {visibleStudents.map((student) => (
                <article key={student.studentId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-900">{student.fullName}</h2>
                      <p className="text-sm text-slate-600 mt-0.5">
                        {student.billingMode === "YEARLY"
                          ? "Yearly"
                          : student.billingMode === "MONTHLY"
                            ? "Monthly"
                            : "No fee account"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-medium ${
                          student.billingMode == null
                            ? "text-slate-500"
                            : student.balance > 0
                              ? "text-rose-700"
                              : "text-emerald-700"
                        }`}
                      >
                        {student.billingMode == null
                          ? "Fee not on the account yet"
                          : student.balance > 0
                            ? `Still to pay ${formatInr(student.balance)}`
                            : "Nothing owed"}
                      </p>
                      {student.billingMode != null ? (
                        <p className="text-sm text-slate-600 mt-1">
                          {lastYearCompare(student.balance, student.lastYearBalance)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {student.billingMode != null ? (
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Last payment</p>
                      {student.payments.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-600">No payment yet</p>
                      ) : (
                        <p className="mt-1 text-sm text-slate-800">
                          {paymentDateLabel(student.payments[0]!.paidOn)} · {formatInr(student.payments[0]!.amount)}
                        </p>
                      )}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
