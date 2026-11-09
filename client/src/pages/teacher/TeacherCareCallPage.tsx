import { useEffect, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { teacherPortalNav } from "./teacherPortalNav";
import { formatMonthLabel } from "../../attendanceReport";
import { YES_NO_OPTIONS, yesNoLabel, type CareCallYesNo } from "../../careCall";

type Tab = "mark" | "records";
type SectionRow = { id: string; name: string };
type ClassRow = {
  id: string;
  name: string;
  grade: string | null;
  studentCount: number;
  sections: SectionRow[];
};
type CareQuestion = { id: string; label: string };
type RosterRow = {
  id: string;
  fullName: string;
  studentLoginId: string | null;
  answers: Record<string, CareCallYesNo | null>;
};
type RecordRow = RosterRow & { recorded: boolean };

function answerKey(questions: CareQuestion[], answers: Record<string, CareCallYesNo | null>): string {
  return questions.map((question) => `${question.id}:${answers[question.id] ?? ""}`).join("|");
}

function TickPair({
  value,
  onChange,
}: {
  value: CareCallYesNo | null;
  onChange: (next: CareCallYesNo) => void;
}) {
  return (
    <div className="flex gap-1">
      {YES_NO_OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium min-h-[40px] min-w-[48px] border ${
              selected
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-700 border-slate-300"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TeacherCareCallPage() {
  const { logout, auth } = useAuth();
  const [tab, setTab] = useState<Tab>("mark");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [questions, setQuestions] = useState<CareQuestion[]>([]);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [recordMonths, setRecordMonths] = useState<string[]>([]);
  const [recordMonth, setRecordMonth] = useState("");
  const [recordQuestions, setRecordQuestions] = useState<CareQuestion[]>([]);
  const [recordRows, setRecordRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedAnswers = useRef(new Map<string, string>());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) {
        setError(r.error ?? "Could not load classes");
        return;
      }
      const list = r.data ?? [];
      setClasses(list);
      if (list[0]) {
        setClassId(list[0].id);
        setSectionId(list[0].sections[0]?.id ?? "");
      }
    })();
  }, []);

  const selectedClass = classes.find((c) => c.id === classId);
  const sections = selectedClass?.sections ?? [];

  useEffect(() => {
    if (sections.length === 0) {
      setSectionId("");
      return;
    }
    if (!sections.some((s) => s.id === sectionId)) {
      setSectionId(sections[0]!.id);
    }
  }, [classId, sections, sectionId]);

  useEffect(() => {
    void (async () => {
      setMessage(null);
      if (!classId || !sectionId) {
        setRows([]);
        return;
      }
      setLoading(true);
      setError(null);
      const q = new URLSearchParams({ classId, sectionId });
      const r = await api<{ questions: CareQuestion[]; students: RosterRow[] }>(
        `/api/v1/teacher/care-calls?${q.toString()}`
      );
      setLoading(false);
      if (!r.ok) {
        setError(r.error ?? "Could not load students");
        setQuestions([]);
        setRows([]);
        return;
      }
      const nextQuestions = r.data?.questions ?? [];
      const students = r.data?.students ?? [];
      setQuestions(nextQuestions);
      savedAnswers.current = new Map(
        students.map((student) => [student.id, answerKey(nextQuestions, student.answers ?? {})])
      );
      setRows(students);
    })();
  }, [classId, sectionId]);

  useEffect(() => {
    void (async () => {
      if (tab !== "records" || !classId || !sectionId) {
        setRecordMonths([]);
        setRecordMonth("");
        setRecordRows([]);
        return;
      }
      const q = new URLSearchParams({ classId, sectionId });
      const r = await api<{ months: string[] }>(`/api/v1/teacher/care-calls/months?${q.toString()}`);
      const months = r.ok ? r.data?.months ?? [] : [];
      setRecordMonths(months);
      setRecordMonth((prev) => (months.includes(prev) ? prev : months[0] ?? ""));
    })();
  }, [tab, classId, sectionId]);

  useEffect(() => {
    void (async () => {
      if (tab !== "records" || !classId || !sectionId || !recordMonth) {
        setRecordRows([]);
        return;
      }
      const q = new URLSearchParams({ classId, sectionId, month: recordMonth });
      const r = await api<{ questions: CareQuestion[]; students: RecordRow[] }>(
        `/api/v1/teacher/care-calls/records?${q.toString()}`
      );
      setRecordQuestions(r.ok ? r.data?.questions ?? [] : []);
      setRecordRows(r.ok ? r.data?.students ?? [] : []);
    })();
  }, [tab, classId, sectionId, recordMonth]);

  function patchRow(id: string, patch: Partial<RosterRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveClass() {
    if (!classId || !sectionId || rows.length === 0) return;
    const entries = rows.filter((row) => {
      if (!Object.values(row.answers ?? {}).some(Boolean)) return false;
      return savedAnswers.current.get(row.id) !== answerKey(questions, row.answers ?? {});
    });
    if (entries.length === 0) {
      setError(null);
      setMessage("No new answers to save.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const r = await api("/api/v1/teacher/care-calls", {
      method: "PUT",
      json: {
        classId,
        sectionId,
        entries: entries.map((row) => ({
          studentId: row.id,
          answers: questions.flatMap((question) => {
            const value = row.answers?.[question.id];
            return value ? [{ questionId: question.id, value }] : [];
          }),
        })),
      },
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save care calls");
      return;
    }
    for (const row of entries) {
      savedAnswers.current.set(row.id, answerKey(questions, row.answers ?? {}));
    }
    setMessage(`Saved ${entries.length} student${entries.length === 1 ? "" : "s"}.`);
  }

  const classSectionSelectors = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="block text-slate-600 mb-1">Class</span>
        <select
          className="w-full rounded-lg border px-3 py-2"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-slate-600 mb-1">Section</span>
        <select
          className="w-full rounded-lg border px-3 py-2"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          disabled={!classId || sections.length === 0}
        >
          <option value="">Select section</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <AppShell title={auth.profile?.fullName ?? "Teacher"} onLogout={logout} nav={[...teacherPortalNav]}>
      <h1 className="text-2xl font-bold text-slate-900">Care calls</h1>
      <p className="text-slate-600 mt-1">Mark the students you called. Answers already saved this month stay filled in.</p>

      <div className="mt-4 flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
        {(
          [
            ["mark", "Mark"],
            ["records", "Records"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 min-w-[100px] rounded-lg px-4 py-2.5 text-sm font-medium min-h-[44px] ${
              tab === id
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-red-600 mt-3">{error}</p> : null}
      {message && tab === "mark" ? <p className="text-emerald-700 mt-3">{message}</p> : null}

      <section className="mt-4 rounded-xl border bg-white p-4 shadow-sm">{classSectionSelectors}</section>

      {tab === "mark" ? (
        <>
          {loading ? <p className="mt-3 text-sm text-slate-500">Loading students…</p> : null}
          {rows.length > 0 ? (
            <section className="mt-4 rounded-xl border bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3">Student</th>
                    {questions.map((question) => (
                      <th key={question.id} className="text-left p-3">{question.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-3 min-w-[140px]">
                        <p className="font-medium text-slate-900">{row.fullName}</p>
                        <p className="text-xs text-slate-500">{row.studentLoginId ?? "—"}</p>
                      </td>
                      {questions.map((question) => (
                        <td key={question.id} className="p-3">
                          <TickPair
                            value={row.answers?.[question.id] ?? null}
                            onChange={(value) =>
                              patchRow(row.id, { answers: { ...row.answers, [question.id]: value } })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          <button
            type="button"
            className="mt-4 w-full rounded-lg bg-indigo-600 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50 min-h-[44px]"
            onClick={() => void saveClass()}
            disabled={saving || rows.length === 0}
          >
            {saving ? "Saving…" : "Save care calls"}
          </button>
        </>
      ) : (
        <section className="mt-4 rounded-xl border bg-white shadow-sm">
          <div className="p-4 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-900">Saved months</p>
            <p className="text-xs text-slate-500 mt-0.5">Only months this class has a saved call.</p>
            {recordMonths.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No care calls saved yet.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {recordMonths.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRecordMonth(m)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium min-h-[40px] border ${
                      recordMonth === m
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    {formatMonthLabel(m)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {recordRows.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">Student</th>
                  {recordQuestions.map((question) => (
                    <th key={question.id} className="text-left p-3">{question.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recordRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-3">
                      <p className="font-medium text-slate-900">{row.fullName}</p>
                      <p className="text-xs text-slate-500">{row.studentLoginId ?? "—"}</p>
                    </td>
                    {recordQuestions.map((question) => (
                      <td key={question.id} className="p-3">
                        {row.recorded ? yesNoLabel(row.answers?.[question.id] ?? null) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}
