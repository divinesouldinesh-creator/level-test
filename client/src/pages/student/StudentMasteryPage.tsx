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

type MasteryDetail = {
  masteryId: string;
  status: string;
  topicName: string;
  subjectName: string;
  levelName: string;
  accuracyPct: number | null;
  nextStep: "learn" | "practice" | "recheck" | "done";
  lesson: { title: string; body: string; isDefault: boolean };
};

type SessionPayload = {
  id: string;
  kind: "PRACTICE" | "RECHECK";
  status: string;
  topicName: string;
  subjectName: string;
  levelName: string;
  masteryId: string;
  questions: {
    id: string;
    type?: QuestionType;
    stem: string;
    stemImageUrl?: string | null;
    options: string[];
    optionImageUrls?: (string | null)[];
    orderIndex: number;
  }[];
};

type DoneState = {
  kind: string;
  score: number;
  maxScore: number;
  percentage: number;
  status: string;
  practicePassed?: boolean;
  mastered?: boolean;
  xpAwarded: number;
  passThreshold: number;
};

function statusLabel(s: string) {
  switch (s) {
    case "REVIEW_DUE":
      return "Recheck due";
    case "NEEDS_WORK":
      return "Needs work";
    case "LEARNING":
      return "Learning";
    case "PRACTICING":
      return "Practicing";
    case "MASTERED":
      return "Mastered";
    default:
      return s;
  }
}

export function StudentMasteryPage() {
  const { masteryId } = useParams();
  const { logout, auth } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MasteryDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({});
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<DoneState | null>(null);

  async function loadDetail() {
    if (!masteryId) return;
    const r = await api<MasteryDetail>(`/api/v1/student/mastery/${masteryId}`);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Failed to load");
      return;
    }
    setDetail(r.data);
    setErr(null);
  }

  useEffect(() => {
    void loadDetail();
  }, [masteryId]);

  async function completeLearn() {
    if (!masteryId) return;
    setBusy(true);
    const r = await api(`/api/v1/student/mastery/${masteryId}/learn`, { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not complete learn step");
      return;
    }
    await loadDetail();
  }

  async function start(kind: "PRACTICE" | "RECHECK") {
    if (!masteryId) return;
    setBusy(true);
    setErr(null);
    const r = await api<{ sessionId: string }>("/api/v1/student/mastery/" + masteryId + "/start", {
      method: "POST",
      json: { kind },
    });
    setBusy(false);
    if (!r.ok || !r.data?.sessionId) {
      setErr(r.error ?? "Could not start");
      return;
    }
    const s = await api<SessionPayload>(`/api/v1/student/mastery/sessions/${r.data.sessionId}`);
    if (!s.ok || !s.data) {
      setErr(s.error ?? "Could not load session");
      return;
    }
    setSession(s.data);
    setAnswers({});
    setIdx(0);
    setDone(null);
  }

  async function submit() {
    if (!session) return;
    const payload = session.questions.map((q) => toSubmitAnswer(q.id, q.type, answers[q.id]));
    if (session.questions.some((q) => !isDraftAnswered(q.type, answers[q.id]))) {
      setErr("Answer every question");
      return;
    }
    setBusy(true);
    const r = await api<DoneState>(`/api/v1/student/mastery/sessions/${session.id}/submit`, {
      method: "POST",
      json: { answers: payload },
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error ?? "Submit failed");
      return;
    }
    setDone(r.data);
    setSession(null);
    await loadDetail();
  }

  if (done) {
    return (
      <AppShell title="Topic path" onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
        <h1 className="text-2xl font-bold text-slate-900">
          {done.mastered ? "Topic mastered!" : done.practicePassed ? "Practice passed" : "Keep going"}
        </h1>
        <p className="mt-1 text-slate-600">
          {done.score}/{done.maxScore} · {done.percentage}%
          {done.xpAwarded > 0 ? ` · +${done.xpAwarded} XP` : ""}
        </p>
        <p className="mt-3 text-sm text-slate-700">
          {done.mastered
            ? "Great work — this topic is marked mastered."
            : done.practicePassed
              ? "Next: take the short recheck to lock it in."
              : `Need at least ${done.passThreshold}% to pass. Review the lesson and try again.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {done.practicePassed && !done.mastered && (
            <button
              type="button"
              onClick={() => {
                setDone(null);
                void start("RECHECK");
              }}
              className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Start recheck
            </button>
          )}
          {!done.practicePassed && !done.mastered && (
            <button
              type="button"
              onClick={() => {
                setDone(null);
                void start("PRACTICE");
              }}
              className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Retry practice
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/student/subjects")}
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium"
          >
            Back to Subjects
          </button>
        </div>
      </AppShell>
    );
  }

  if (session) {
    const q = session.questions[idx];
    const total = session.questions.length;
    const answered = session.questions.filter((item) => isDraftAnswered(item.type, answers[item.id])).length;
    return (
      <AppShell title="Topic path" onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {session.kind === "PRACTICE" ? "Practice" : "Recheck"} · {session.subjectName}
        </p>
        <h1 className="text-xl font-bold text-slate-900">{session.topicName}</h1>
        <p className="text-sm text-slate-600">
          {idx + 1}/{total} · Answered {answered}
        </p>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {q && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-lg font-medium text-slate-900 select-none">{q.stem}</p>
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
              optionImageUrls={q.optionImageUrls}
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
            className="rounded-lg border border-slate-300 px-4 py-3 text-sm disabled:opacity-40"
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
              disabled={busy || answered < total}
              onClick={() => void submit()}
              className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit"}
            </button>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Topic path"}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <Link to="/student/subjects" className="text-sm font-medium text-brand-700">
        ← Subjects
      </Link>
      {!detail ? (
        <p className="mt-4 text-slate-500">{err ?? "Loading…"}</p>
      ) : (
        <>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{detail.topicName}</h1>
          <p className="text-slate-600">
            {detail.subjectName} · {detail.levelName} · {statusLabel(detail.status)}
            {detail.accuracyPct != null ? ` · ${detail.accuracyPct}% so far` : ""}
          </p>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

          <ol className="mt-5 flex flex-wrap gap-2 text-sm">
            {(["learn", "practice", "recheck"] as const).map((step, i) => {
              const active = detail.nextStep === step;
              const doneStep =
                (step === "learn" && detail.nextStep !== "learn") ||
                (step === "practice" && (detail.nextStep === "recheck" || detail.nextStep === "done")) ||
                (step === "recheck" && detail.nextStep === "done");
              return (
                <li
                  key={step}
                  className={`rounded-full px-3 py-1 font-medium ${
                    active
                      ? "bg-indigo-600 text-white"
                      : doneStep
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {i + 1}. {step[0].toUpperCase() + step.slice(1)}
                </li>
              );
            })}
          </ol>

          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{detail.lesson.title}</h2>
            {detail.lesson.isDefault && (
              <p className="mt-1 text-xs text-slate-500">
                Default study tips — admin can add a custom lesson for this topic later.
              </p>
            )}
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-700">
              {detail.lesson.body}
            </pre>
            {detail.nextStep === "learn" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void completeLearn()}
                className="mt-4 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
              >
                I&apos;ve studied this — start practice
              </button>
            )}
          </section>

          {detail.nextStep === "practice" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void start("PRACTICE")}
              className="mt-4 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Start practice (5 questions, pass ≥70%)
            </button>
          )}
          {detail.nextStep === "recheck" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void start("RECHECK")}
              className="mt-4 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Start recheck (3 questions, pass ≥80%)
            </button>
          )}
          {detail.nextStep === "done" && (
            <p className="mt-4 text-emerald-800 font-medium">This topic is mastered. Nice work!</p>
          )}
        </>
      )}
    </AppShell>
  );
}
