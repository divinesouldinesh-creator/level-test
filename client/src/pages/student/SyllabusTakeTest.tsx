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

type Q = {
  id: string;
  stem: string;
  options: string[];
  chapterId: string;
  topicId: string;
};

type SavedProgress = { answers: Record<string, number>; idx: number };

type ReviewItem = {
  id: string;
  stem: string;
  options: string[];
  selectedOption: number | null;
  correctOption: number;
  isCorrect: boolean;
  topicId: string;
  topicName: string;
  chapterId: string;
  chapterName: string;
};

type ReviewPayload = {
  score: number;
  maxScore: number;
  percentage: number;
  questions: ReviewItem[];
};

type PracticeState = { picks: number[]; solved: boolean };

type DoneState = {
  score: number;
  maxScore: number;
  percentage: number;
  subject?: string;
  difficulty?: string;
  chapters?: string[];
  chapterWise: { chapterId: string; chapterName: string; correct: number; total: number; percentage: number }[];
};

function progressKey(testId?: string): string | null {
  return testId ? `student-syllabus-progress:${testId}` : null;
}

export function SyllabusTakeTest() {
  const { testId } = useParams();
  const { logout, auth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<DoneState | null>(null);
  const [meta, setMeta] = useState<{ subject?: string; difficulty?: string; chapters?: string[] }>({});
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<"wrong" | "all">("wrong");
  const [practice, setPractice] = useState<Record<string, PracticeState>>({});

  useEffect(() => {
    function blockCopyHotkeys(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (
        (e.ctrlKey || e.metaKey) &&
        (key === "c" || key === "x" || key === "a" || key === "u" || key === "s" || key === "p")
      ) {
        e.preventDefault();
      }
    }
    function blockContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    const protectActive = !done || reviewOpen;
    if (protectActive) {
      window.addEventListener("keydown", blockCopyHotkeys);
      window.addEventListener("contextmenu", blockContextMenu);
    }
    return () => {
      window.removeEventListener("keydown", blockCopyHotkeys);
      window.removeEventListener("contextmenu", blockContextMenu);
    };
  }, [done, reviewOpen]);

  useEffect(() => {
    if (!testId || questions.length === 0) return;
    const key = progressKey(testId);
    if (!key) return;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedProgress;
      const validIds = new Set(questions.map((q) => q.id));
      const restored: Record<string, number> = {};
      for (const [qid, opt] of Object.entries(saved.answers ?? {})) {
        if (validIds.has(qid) && Number.isInteger(opt) && opt >= 0 && opt <= 3) {
          restored[qid] = opt;
        }
      }
      setAnswers(restored);
      setIdx(Math.min(Math.max(saved.idx ?? 0, 0), Math.max(0, questions.length - 1)));
    } catch {
      localStorage.removeItem(key);
    }
  }, [testId, questions]);

  useEffect(() => {
    if (!testId || questions.length === 0 || done) return;
    const key = progressKey(testId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({ answers, idx }));
  }, [testId, questions, answers, idx, done]);

  useEffect(() => {
    void (async () => {
      const r = await api<unknown>(`/api/v1/student/syllabus/tests/${testId}`);
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
          subject: data.subject as string | undefined,
          difficulty: data.difficulty as string | undefined,
          chapters: data.chapters as string[] | undefined,
          chapterWise:
            (data.chapterWise as DoneState["chapterWise"]) ?? [],
        });
        return;
      }
      setMeta({
        subject: data.subject as string | undefined,
        difficulty: data.difficulty as string | undefined,
        chapters: data.chapters as string[] | undefined,
      });
      setQuestions((data.questions as Q[]) ?? []);
      setIdx(0);
    })();
  }, [testId]);

  const current = questions[idx];
  const progress = questions.length
    ? Math.round(
        ((idx + (answers[current?.id ?? ""] !== undefined ? 1 : 0)) / questions.length) * 100
      )
    : 0;

  async function openReview() {
    setReviewOpen(true);
    if (reviewItems) return;
    setReviewLoading(true);
    setReviewErr(null);
    const r = await api<ReviewPayload>(`/api/v1/student/syllabus/tests/${testId}/review`);
    setReviewLoading(false);
    if (!r.ok || !r.data) {
      setReviewErr(r.error ?? "Could not load review");
      return;
    }
    setReviewItems(r.data.questions);
  }

  function practicePick(item: ReviewItem, optIdx: number) {
    setPractice((prev) => {
      const cur = prev[item.id] ?? { picks: [], solved: false };
      if (cur.solved) return prev;
      if (cur.picks.includes(optIdx)) return prev;
      const picks = [...cur.picks, optIdx];
      const solved = optIdx === item.correctOption;
      return { ...prev, [item.id]: { picks, solved } };
    });
  }

  function resetPractice(itemId: string) {
    setPractice((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  async function submitAll() {
    if (!testId) return;
    const missing = questions.filter((q) => answers[q.id] === undefined);
    if (missing.length) {
      setErr("Answer all questions before submitting.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    const r = await api<DoneState>(`/api/v1/student/syllabus/tests/${testId}/submit`, {
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
    setDone({ ...r.data, subject: meta.subject, difficulty: meta.difficulty, chapters: meta.chapters });
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-slate-600 p-4">
        Loading…
      </div>
    );
  }

  if (done) {
    const chartData = done.chapterWise.map((c) => ({
      name: c.chapterName.length > 14 ? c.chapterName.slice(0, 12) + "…" : c.chapterName,
      pct: c.percentage,
    }));
    return (
      <AppShell
        title="Syllabus"
        onLogout={logout}
        nav={[
          { to: "/student", label: "Skill subjects" },
          { to: "/student/syllabus", label: "Syllabus" },
        ]}
      >
        <h1 className="text-2xl font-bold">Your result</h1>
        <p className="mt-1 text-sm text-slate-600">
          {done.subject}
          {done.difficulty ? ` · ${done.difficulty}` : ""}
          {done.chapters && done.chapters.length ? ` · ${done.chapters.join(", ")}` : ""}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white border p-4 shadow-sm">
            <p className="text-sm text-slate-500">Score</p>
            <p className="text-3xl font-bold text-indigo-800">
              {done.score}/{done.maxScore}
            </p>
          </div>
          <div className="rounded-xl bg-white border p-4 shadow-sm">
            <p className="text-sm text-slate-500">Percentage</p>
            <p className="text-3xl font-bold text-indigo-800">{done.percentage.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-white border p-4 shadow-sm">
            <p className="text-sm text-slate-500">Mode</p>
            <p className="text-2xl font-bold text-slate-800">Practice</p>
          </div>
        </div>
        {chartData.length > 0 && (
          <div className="mt-6 rounded-xl bg-white border p-4 overflow-x-auto">
            <p className="font-semibold mb-2">Chapter-wise</p>
            <div className="h-64 min-w-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="pct" fill="#6366f1" radius={[4, 4, 0, 0]} name="%" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {!reviewOpen ? (
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <p className="font-semibold text-slate-900">Learn from your mistakes</p>
            <p className="mt-1 text-sm text-slate-700">
              Open the review to see the correct answer for every question. You can also re-attempt the questions
              you missed — practice picks do not change your score.
            </p>
            <button
              type="button"
              onClick={() => void openReview()}
              className="mt-3 rounded-xl bg-indigo-600 text-white px-5 py-3 text-sm font-semibold min-h-[44px]"
            >
              Review &amp; practice
            </button>
          </div>
        ) : (
          <div
            className="mt-6 rounded-xl border border-slate-200 bg-white p-4 select-none"
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">Review &amp; practice</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setReviewFilter("wrong")}
                    className={`px-3 py-1.5 ${
                      reviewFilter === "wrong"
                        ? "bg-rose-100 text-rose-800 font-medium"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    Wrong only
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewFilter("all")}
                    className={`px-3 py-1.5 ${
                      reviewFilter === "all"
                        ? "bg-slate-100 text-slate-900 font-medium"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    All
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700"
                >
                  Hide
                </button>
              </div>
            </div>

            {reviewLoading ? (
              <p className="mt-3 text-sm text-slate-500">Loading review…</p>
            ) : reviewErr ? (
              <p className="mt-3 text-sm text-rose-700">{reviewErr}</p>
            ) : reviewItems == null ? null : reviewItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No questions to review.</p>
            ) : (
              (() => {
                const filtered =
                  reviewFilter === "wrong" ? reviewItems.filter((q) => !q.isCorrect) : reviewItems;
                if (reviewFilter === "wrong" && filtered.length === 0) {
                  return (
                    <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      Perfect score — nothing wrong to review. Switch to <span className="font-medium">All</span>{" "}
                      to revisit your answers.
                    </p>
                  );
                }
                const labels = ["A", "B", "C", "D"];
                return (
                  <ol className="mt-4 space-y-4">
                    {filtered.map((q, i) => {
                      const ps = practice[q.id] ?? { picks: [], solved: false };
                      const wrongPicks = new Set(ps.picks.filter((p) => p !== q.correctOption));
                      const showCorrectStatic = ps.picks.length === 0;
                      return (
                        <li
                          key={q.id}
                          className="rounded-xl border border-slate-200 bg-white p-3"
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-medium text-slate-900 whitespace-pre-wrap">
                              {i + 1}. {q.stem}
                            </p>
                            {q.isCorrect ? (
                              <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
                                ✓ Correct
                              </span>
                            ) : (
                              <span className="text-xs rounded-full bg-rose-100 text-rose-800 px-2 py-0.5">
                                ✗ Wrong
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {q.chapterName} · {q.topicName}
                          </p>
                          {!q.isCorrect && q.selectedOption != null ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Your original answer:{" "}
                              <span className="font-medium text-rose-700">
                                {labels[q.selectedOption]}
                              </span>
                            </p>
                          ) : null}

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {q.options.map((opt, optIdx) => {
                              const isCorrect = optIdx === q.correctOption;
                              const wasOriginal = optIdx === q.selectedOption;
                              const isWrongPick = wrongPicks.has(optIdx);
                              let cls =
                                "w-full text-left rounded-lg border px-3 py-2 text-sm min-h-[44px] transition";
                              let suffix = "";
                              if (q.isCorrect) {
                                if (isCorrect) {
                                  cls += " border-emerald-400 bg-emerald-50 text-emerald-900";
                                  suffix = "  ✓";
                                } else {
                                  cls += " border-slate-200 bg-white text-slate-700";
                                }
                              } else if (showCorrectStatic) {
                                if (isCorrect) {
                                  cls += " border-emerald-400 bg-emerald-50 text-emerald-900";
                                  suffix = "  ✓ correct";
                                } else if (wasOriginal) {
                                  cls += " border-rose-300 bg-rose-50 text-rose-800";
                                  suffix = "  ✗ your pick";
                                } else {
                                  cls += " border-slate-200 bg-white text-slate-700";
                                }
                              } else if (ps.solved) {
                                if (isCorrect) {
                                  cls += " border-emerald-400 bg-emerald-50 text-emerald-900";
                                  suffix = "  ✓";
                                } else if (isWrongPick) {
                                  cls += " border-rose-300 bg-rose-50 text-rose-700";
                                } else {
                                  cls += " border-slate-200 bg-white text-slate-700";
                                }
                              } else if (isWrongPick) {
                                cls +=
                                  " border-rose-300 bg-rose-50 text-rose-700 opacity-70 cursor-not-allowed";
                                suffix = "  ✗";
                              } else {
                                cls += " border-slate-300 bg-white text-slate-800 hover:border-indigo-400";
                              }
                              const clickable =
                                !q.isCorrect && !showCorrectStatic && !ps.solved && !isWrongPick;
                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() => clickable && practicePick(q, optIdx)}
                                  disabled={!clickable && !showCorrectStatic ? true : isWrongPick}
                                  className={cls}
                                >
                                  <span className="font-semibold mr-2">{labels[optIdx]}.</span>
                                  {opt}
                                  {suffix ? <span className="text-xs ml-2">{suffix}</span> : null}
                                </button>
                              );
                            })}
                          </div>

                          {!q.isCorrect ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                              {showCorrectStatic ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPractice((p) => ({ ...p, [q.id]: { picks: [], solved: false } }))
                                  }
                                  className="rounded-lg border border-indigo-300 bg-white text-indigo-700 px-3 py-1.5"
                                >
                                  Try this question again
                                </button>
                              ) : ps.solved ? (
                                <>
                                  <span className="text-emerald-700">
                                    Got it on attempt {ps.picks.length}.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => resetPractice(q.id)}
                                    className="rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-1.5"
                                  >
                                    Reset
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-slate-600">
                                    Pick the right answer. Wrong picks turn red — keep trying.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => resetPractice(q.id)}
                                    className="rounded-lg border border-slate-300 bg-white text-slate-700 px-3 py-1.5"
                                  >
                                    Reset
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                );
              })()
            )}
          </div>
        )}

        <Link
          to="/student/syllabus"
          className="mt-8 inline-flex rounded-xl bg-indigo-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] items-center"
        >
          Back to syllabus
        </Link>
      </AppShell>
    );
  }

  if (!current) {
    return (
      <AppShell
        title={auth.profile?.fullName ?? "Practice"}
        onLogout={logout}
        nav={[
          { to: "/student", label: "Skill subjects" },
          { to: "/student/syllabus", label: "Syllabus" },
        ]}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">No questions available.</p>
          <p className="text-amber-800 text-sm mt-1">
            {err ?? "Go back to your subject and choose chapters again."}
          </p>
          <Link to="/student/syllabus" className="mt-3 inline-block text-indigo-700 font-medium">
            Back to syllabus
          </Link>
        </div>
      </AppShell>
    );
  }

  const labels = ["A", "B", "C", "D"];

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Practice"}
      onLogout={logout}
      nav={[
        { to: "/student", label: "Skill subjects" },
        { to: "/student/syllabus", label: "Syllabus" },
      ]}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-slate-500">
          {meta.subject}
          {meta.difficulty ? ` · ${meta.difficulty}` : ""}
          {meta.chapters && meta.chapters.length ? ` · ${meta.chapters.join(", ")}` : ""}
        </p>
      </div>
      <div className="mb-4">
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-slate-600 mt-2">
          Question {idx + 1} of {questions.length}
        </p>
      </div>
      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm select-none"
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
      >
        <p className="text-lg md:text-xl font-medium leading-relaxed">{current.stem}</p>
        <div className="mt-6 space-y-3">
          {current.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAnswers((a) => ({ ...a, [current.id]: i }))}
              className={`w-full text-left rounded-xl border px-4 py-4 text-base min-h-[52px] transition ${
                answers[current.id] === i
                  ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500"
                  : "border-slate-200 hover:border-indigo-300 bg-slate-50"
              }`}
            >
              <span className="font-semibold text-indigo-700 mr-2">{labels[i]}.</span>
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
            className="rounded-xl bg-indigo-600 text-white px-6 py-4 text-base font-semibold min-h-[52px] flex-1"
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
            {submitting ? "Submitting…" : "Submit"}
          </button>
        )}
      </div>
      {err && <p className="text-rose-700 mt-4">{err}</p>}
    </AppShell>
  );
}
