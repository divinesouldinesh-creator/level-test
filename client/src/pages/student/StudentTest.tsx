import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";

type Q = { id: string; stem: string; options: string[]; topicId: string };
type SavedTestProgress = {
  answers: Record<string, number>;
  idx: number;
};

function progressKey(testId?: string): string | null {
  return testId ? `student-test-progress:${testId}` : null;
}

export function StudentTest() {
  const { testId } = useParams();
  const { logout, auth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<null | {
    score: number;
    maxScore: number;
    percentage: number;
    band: string;
    topicWise: { topicName: string; correct: number; total: number; percentage: number }[];
    strongTopics: string[];
    weakTopics: string[];
    suggestedNextLevelId: string | null;
  }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!testId || questions.length === 0) return;
    const key = progressKey(testId);
    if (!key) return;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedTestProgress;
      const validIds = new Set(questions.map((q) => q.id));
      const restoredAnswers: Record<string, number> = {};
      for (const [qid, opt] of Object.entries(saved.answers ?? {})) {
        if (validIds.has(qid) && Number.isInteger(opt) && opt >= 0 && opt <= 3) {
          restoredAnswers[qid] = opt;
        }
      }
      setAnswers(restoredAnswers);
      const maxIdx = Math.max(0, questions.length - 1);
      setIdx(Math.min(Math.max(saved.idx ?? 0, 0), maxIdx));
    } catch {
      localStorage.removeItem(key);
    }
  }, [testId, questions]);

  useEffect(() => {
    if (!testId || questions.length === 0 || done) return;
    const key = progressKey(testId);
    if (!key) return;
    const payload: SavedTestProgress = { answers, idx };
    localStorage.setItem(key, JSON.stringify(payload));
  }, [testId, questions, answers, idx, done]);

  useEffect(() => {
    void (async () => {
      const r = await api<unknown>(`/api/v1/student/tests/${testId}`);
      setLoading(false);
      if (!r.ok) {
        setErr(r.error ?? "Failed");
        return;
      }
      const data = r.data as Record<string, unknown>;
      if (data.status === "completed") {
        const key = progressKey(testId);
        if (key) localStorage.removeItem(key);
        setDone({
          score: data.score as number,
          maxScore: data.maxScore as number,
          percentage: data.percentage as number,
          band: data.band as string,
          topicWise: (data.topicWise as { topicName: string; correct: number; total: number; percentage: number }[]) ?? [],
          strongTopics: (data.strongTopics as string[]) ?? [],
          weakTopics: (data.weakTopics as string[]) ?? [],
          suggestedNextLevelId: (data.suggestedNextLevelId as string | null) ?? null,
        });
        return;
      }
      const qs = (data.questions as Q[]) ?? [];
      setQuestions(qs);
      setIdx(0);
    })();
  }, [testId]);

  const current = questions[idx];
  const progress = questions.length ? Math.round(((idx + (answers[current?.id ?? ""] !== undefined ? 1 : 0)) / questions.length) * 100) : 0;

  async function submitAll() {
    if (!testId) return;
    const missing = questions.filter((q) => answers[q.id] === undefined);
    if (missing.length) {
      setErr("Answer all questions before submitting.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    const r = await api<{
      score: number;
      maxScore: number;
      percentage: number;
      band: string;
      topicWise: { topicName: string; correct: number; total: number; percentage: number }[];
      strongTopics: string[];
      weakTopics: string[];
      suggestedNextLevelId: string | null;
    }>(`/api/v1/student/tests/${testId}/submit`, {
      method: "POST",
      json: {
        answers: questions.map((q) => ({ questionId: q.id, selectedOption: answers[q.id]! })),
      },
    });
    setSubmitting(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Submit failed");
      return;
    }
    const key = progressKey(testId);
    if (key) localStorage.removeItem(key);
    setDone(r.data);
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-slate-600 p-4">
        Loading test…
      </div>
    );
  }

  if (done) {
    const chartData = done.topicWise.map((t) => ({
      name: t.topicName.length > 12 ? t.topicName.slice(0, 10) + "…" : t.topicName,
      pct: t.percentage,
    }));
    return (
      <AppShell
        title="Results"
        onLogout={logout}
        nav={[{ to: "/student", label: "Subjects" }]}
      >
        <h1 className="text-2xl font-bold">Your result</h1>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white border p-4 shadow-sm">
            <p className="text-sm text-slate-500">Score</p>
            <p className="text-3xl font-bold text-brand-800">
              {done.score}/{done.maxScore}
            </p>
          </div>
          <div className="rounded-xl bg-white border p-4 shadow-sm">
            <p className="text-sm text-slate-500">Percentage</p>
            <p className="text-3xl font-bold text-brand-800">{done.percentage.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-white border p-4 shadow-sm">
            <p className="text-sm text-slate-500">Band</p>
            <p className="text-2xl font-bold text-slate-800">{done.band}</p>
          </div>
        </div>
        <div className="mt-6 rounded-xl bg-white border p-4 overflow-x-auto">
          <p className="font-semibold mb-2">Topic-wise</p>
          <div className="h-64 min-w-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="pct" fill="#0284c7" radius={[4, 4, 0, 0]} name="%" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">Strong topics</p>
            <p className="text-emerald-800 mt-1">{done.strongTopics.length ? done.strongTopics.join(", ") : "—"}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="font-semibold text-rose-900">Weak topics</p>
            <p className="text-rose-800 mt-1">{done.weakTopics.length ? done.weakTopics.join(", ") : "—"}</p>
          </div>
        </div>
        {done.suggestedNextLevelId && (
          <p className="mt-4 text-brand-800 font-medium">Next level unlocked — open Levels to continue.</p>
        )}
        <Link
          to="/student"
          className="mt-8 inline-flex rounded-xl bg-brand-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] items-center"
        >
          Back to subjects
        </Link>
      </AppShell>
    );
  }

  if (!current) {
    return (
      <AppShell title={auth.profile?.fullName ?? "Test"} onLogout={logout} nav={[{ to: "/student", label: "Subjects" }]}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">No questions available for this test.</p>
          <p className="text-amber-800 text-sm mt-1">
            {err ?? "This test does not have question rows yet. Please go back and start a new test."}
          </p>
          <Link to="/student" className="mt-3 inline-block text-brand-700 font-medium">
            Back to subjects
          </Link>
        </div>
      </AppShell>
    );
  }

  const labels = ["A", "B", "C", "D"];

  return (
    <AppShell title={auth.profile?.fullName ?? "Test"} onLogout={logout} nav={[{ to: "/student", label: "Subjects" }]}>
      <div className="mb-4">
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-slate-600 mt-2">
          Question {idx + 1} of {questions.length}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <p className="text-lg md:text-xl font-medium leading-relaxed">{current.stem}</p>
        <div className="mt-6 space-y-3">
          {current.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setAnswers((a) => ({ ...a, [current.id]: i }));
              }}
              className={`w-full text-left rounded-xl border px-4 py-4 text-base min-h-[52px] transition ${
                answers[current.id] === i
                  ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500"
                  : "border-slate-200 hover:border-brand-300 bg-slate-50"
              }`}
            >
              <span className="font-semibold text-brand-700 mr-2">{labels[i]}.</span>
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          className="rounded-xl border border-slate-300 px-6 py-4 text-base font-medium min-h-[52px] disabled:opacity-40"
        >
          Previous
        </button>
        {idx < questions.length - 1 ? (
          <button
            type="button"
            onClick={() => setIdx((i) => i + 1)}
            className="rounded-xl bg-brand-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] flex-1"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitAll()}
            className="rounded-xl bg-emerald-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] flex-1 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit test"}
          </button>
        )}
      </div>
      {err && <p className="text-red-600 mt-4">{err}</p>}
    </AppShell>
  );
}
