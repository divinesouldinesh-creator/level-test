import { useEffect, useState } from "react";
import { api } from "../../api";
import { formatMonthLabel } from "../../attendanceReport";

type Question = { id: string; label: string };
type MonthPlan = { month: string; locked: boolean; questions: Question[] };
type Plans = { current: MonthPlan; next: MonthPlan };
type SubmissionRow = {
  sectionId: string;
  className: string;
  sectionName: string;
  studentCount: number;
  answeredCount: number;
  submitted: boolean;
  teacherName: string | null;
  savedAt: string | null;
};

function formatSaved(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function QuestionList({
  plan,
  onChanged,
}: {
  plan: MonthPlan;
  onChanged: () => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    const name = label.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    const r = await api("/api/v1/admin/care-call-questions", {
      method: "POST",
      json: { month: plan.month, label: name },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not add the question");
      return;
    }
    setLabel("");
    await onChanged();
  }

  async function removeQuestion(questionId: string) {
    setBusy(true);
    setErr(null);
    const r = await api(`/api/v1/admin/care-call-questions/${questionId}?month=${encodeURIComponent(plan.month)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not remove the question");
      return;
    }
    await onChanged();
  }

  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">{formatMonthLabel(plan.month)}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {plan.locked
          ? "Calls are already saved, so a question can be added but not removed."
          : "No calls saved yet. Questions can be added or removed."}
      </p>
      <ul className="mt-3 space-y-2">
        {plan.questions.map((question) => (
          <li key={question.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <span className="text-sm text-slate-900">{question.label}</span>
            <button
              type="button"
              className="text-sm text-red-700 disabled:text-slate-400"
              disabled={busy || plan.locked || plan.questions.length <= 1}
              onClick={() => void removeQuestion(question.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => void addQuestion(e)}>
        <input
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="New question"
          maxLength={60}
          disabled={busy}
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy || !label.trim()}
        >
          Add
        </button>
      </form>
      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
    </section>
  );
}

export function AdminCareCallQuestionsPage() {
  const [plans, setPlans] = useState<Plans | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const [questions, status] = await Promise.all([
      api<Plans>("/api/v1/admin/care-call-questions"),
      api<{ rows: SubmissionRow[] }>("/api/v1/admin/care-call-submissions"),
    ]);
    if (!questions.ok || !questions.data) {
      setErr(questions.error ?? "Could not load care call questions");
      return;
    }
    setErr(status.ok ? null : status.error ?? "Could not load who submitted");
    setPlans(questions.data);
    setSubmissions(status.data?.rows ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Care call questions</h1>
      <p className="mt-1 text-slate-600">
        These Yes or No questions are the same for every class. This month stays readable after calls are saved. Next month can be a different list.
      </p>
      {err ? <p className="mt-4 text-red-600">{err}</p> : null}
      {plans ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <QuestionList plan={plans.current} onChanged={load} />
          <QuestionList plan={plans.next} onChanged={load} />
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="font-semibold text-slate-900">
          Submitted this month{plans ? ` · ${formatMonthLabel(plans.current.month)}` : ""}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          A section counts once any student has an answer. The teacher is whoever saved the latest call.
        </p>
        {submissions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No classes with students yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="p-3 font-medium">Class</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Teacher</th>
                  <th className="p-3 font-medium">Saved</th>
                  <th className="p-3 font-medium">Students</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((row) => (
                  <tr key={row.sectionId} className="border-t border-slate-100">
                    <td className="p-3">
                      {row.className} · {row.sectionName}
                    </td>
                    <td className={`p-3 ${row.submitted ? "text-emerald-700" : "text-amber-800"}`}>
                      {row.submitted ? "Submitted" : "Not submitted"}
                    </td>
                    <td className="p-3">{row.teacherName ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">{row.savedAt ? formatSaved(row.savedAt) : "—"}</td>
                    <td className="p-3">
                      {row.answeredCount}/{row.studentCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
