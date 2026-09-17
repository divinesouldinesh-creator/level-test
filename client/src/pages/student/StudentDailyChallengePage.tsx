import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, mediaUrl } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";
import { QuestionResponse } from "../../components/QuestionResponse";
import {
  isDraftAnswered,
  toSubmitAnswer,
  type DraftAnswer,
  type QuestionType,
} from "../../questionTypes";

type Q = {
  id: string;
  type?: QuestionType;
  stem: string;
  stemImageUrl?: string | null;
  options: string[];
  topicId: string;
  topicName: string;
  orderIndex: number;
  selectedOption?: number | null;
  numericAnswer?: number | null;
  correctOption?: number;
  isCorrect?: boolean | null;
};

type ChallengePayload = {
  id: string;
  dayKey: string;
  status: "IN_PROGRESS" | "COMPLETED";
  subjectName: string;
  levelName: string;
  focusTopicNames: string[];
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  xpAwarded: number | null;
  questions: Q[];
};

type DoneState = {
  score: number;
  maxScore: number;
  percentage: number;
  topicWise: { topicName: string; correct: number; total: number; percentage: number }[];
  xpAwarded: number;
  xpTotal: number;
  practiceStreak: number;
  checkInStreak: number;
};

export function StudentDailyChallengePage() {
  const { challengeId } = useParams();
  const { logout, auth } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<ChallengePayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({});
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<DoneState | null>(null);

  useEffect(() => {
    if (!challengeId) return;
    void (async () => {
      setLoading(true);
      const r = await api<ChallengePayload>(`/api/v1/student/daily-challenge/${challengeId}`);
      setLoading(false);
      if (!r.ok || !r.data) {
        setErr(r.error ?? "Failed to load challenge");
        return;
      }
      setChallenge(r.data);
      if (r.data.status === "COMPLETED") {
        const restored: Record<string, DraftAnswer> = {};
        for (const q of r.data.questions) {
          if (typeof q.selectedOption === "number") restored[q.id] = { selectedOption: q.selectedOption };
          else if (q.numericAnswer != null) restored[q.id] = { numericRaw: String(q.numericAnswer) };
        }
        setAnswers(restored);
        setDone({
          score: r.data.score ?? 0,
          maxScore: r.data.maxScore ?? r.data.questions.length,
          percentage: r.data.percentage ?? 0,
          topicWise: [],
          xpAwarded: r.data.xpAwarded ?? 0,
          xpTotal: 0,
          practiceStreak: 0,
          checkInStreak: 0,
        });
      }
    })();
  }, [challengeId]);

  async function submit() {
    if (!challengeId || !challenge) return;
    const payload = challenge.questions.map((q) => toSubmitAnswer(q.id, q.type, answers[q.id]));
    if (challenge.questions.some((q) => !isDraftAnswered(q.type, answers[q.id]))) {
      setErr("Answer every question before submitting");
      return;
    }
    setSubmitting(true);
    setErr(null);
    const r = await api<DoneState>(`/api/v1/student/daily-challenge/${challengeId}/submit`, {
      method: "POST",
      json: { answers: payload },
    });
    setSubmitting(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Submit failed");
      return;
    }
    setDone(r.data);
    setChallenge((c) => (c ? { ...c, status: "COMPLETED" } : c));
  }

  if (loading) {
    return (
      <AppShell title="Daily 5" onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
        <p className="text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell title="Daily 5" onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
        <p className="text-red-600">{err ?? "Challenge not found"}</p>
        <Link to="/student/daily" className="mt-3 inline-block text-brand-700 font-medium">
          ← Daily Challenge
        </Link>
      </AppShell>
    );
  }

  if (done && challenge.status === "COMPLETED") {
    return (
      <AppShell title="Daily 5" onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
        <h1 className="text-2xl font-bold text-slate-900">Daily 5 complete</h1>
        <p className="mt-1 text-slate-600">
          {challenge.subjectName} · {challenge.levelName}
        </p>
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-3xl font-bold text-slate-900">
            {done.score}/{done.maxScore}
          </p>
          <p className="mt-1 text-slate-700">{done.percentage}%</p>
          <p className="mt-3 text-sm font-medium text-emerald-900">+{done.xpAwarded} XP earned</p>
          {done.practiceStreak > 0 && (
            <p className="mt-1 text-sm text-slate-600">Practice streak: {done.practiceStreak} days</p>
          )}
        </div>
        {done.topicWise.length > 0 && (
          <ul className="mt-4 space-y-2">
            {done.topicWise.map((t) => (
              <li key={t.topicName} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                <span className="font-medium">{t.topicName}</span>: {t.correct}/{t.total} (
                {t.percentage}%)
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate("/student/daily")}
            className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white"
          >
            Back to Daily Challenge
          </button>
        </div>
      </AppShell>
    );
  }

  const q = challenge.questions[idx];
  const answered = challenge.questions.filter((item) => isDraftAnswered(item.type, answers[item.id])).length;
  const total = challenge.questions.length;

  return (
    <AppShell title="Daily 5" onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {challenge.subjectName} · Daily 5
          </h1>
          <p className="text-sm text-slate-600">
            {challenge.levelName}
            {challenge.focusTopicNames.length > 0
              ? ` · Focus: ${challenge.focusTopicNames.join(", ")}`
              : ""}
          </p>
        </div>
        <p className="text-sm font-medium text-slate-500">
          {idx + 1} / {total} · Answered {answered}
        </p>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {q && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{q.topicName}</p>
          <p className="mt-2 text-lg font-medium text-slate-900 select-none">{q.stem}</p>
          {q.stemImageUrl && (
            <img
              src={mediaUrl(q.stemImageUrl)}
              alt=""
              className="mt-3 max-h-56 rounded-lg border border-slate-100"
            />
          )}
          <QuestionResponse
            type={q.type}
            options={q.options}
            selectedOption={answers[q.id]?.selectedOption}
            numericRaw={answers[q.id]?.numericRaw}
            onSelect={(oi) => setAnswers((a) => ({ ...a, [q.id]: { selectedOption: oi } }))}
            onNumeric={(raw) => setAnswers((a) => ({ ...a, [q.id]: { numericRaw: raw } }))}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium disabled:opacity-40"
        >
          Previous
        </button>
        {idx < total - 1 ? (
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            className="rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || answered < total}
            onClick={() => void submit()}
            className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Daily 5"}
          </button>
        )}
      </div>
    </AppShell>
  );
}
