import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

type LevelCoverage = {
  id: string;
  name: string;
  order: number;
  questionCount: number;
};

type SubjectCoverage = {
  id: string;
  name: string;
  code: string | null;
  levelCount: number;
  questionCount: number;
  levels: LevelCoverage[];
};

type ClassCoverage = {
  id: string;
  name: string;
  grade: string | null;
  subjects: SubjectCoverage[];
};

type CoverageSummary = {
  totals: {
    classes: number;
    subjects: number;
    levels: number;
    questions: number;
  };
  classes: ClassCoverage[];
};

export function AdminCoveragePage() {
  const [data, setData] = useState<CoverageSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<CoverageSummary>("/api/v1/admin/coverage/summary");
      if (!r.ok) setErr(r.error ?? "Failed to load coverage summary");
      else setData(r.data ?? null);
    })();
  }, []);

  const classCountWithNoSubjects = useMemo(
    () => (data?.classes ?? []).filter((c) => c.subjects.length === 0).length,
    [data]
  );

  const levelCountWithNoQuestions = useMemo(
    () =>
      (data?.classes ?? [])
        .flatMap((c) => c.subjects)
        .flatMap((s) => s.levels)
        .filter((l) => l.questionCount === 0).length,
    [data]
  );

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Coverage report</h1>
      <p className="mt-1 text-slate-600">
        Track how many classes, subjects, levels, and question-bank entries exist. Quickly find levels with zero
        questions.
      </p>
      {err && <p className="mt-4 text-red-600">{err}</p>}

      {data ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Classes" value={data.totals.classes} />
            <StatCard label="Subjects" value={data.totals.subjects} />
            <StatCard label="Levels" value={data.totals.levels} />
            <StatCard label="Questions" value={data.totals.questions} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Classes without linked subjects: <strong>{classCountWithNoSubjects}</strong>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Levels with zero questions: <strong>{levelCountWithNoQuestions}</strong>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {data.classes.map((c) => (
              <details key={c.id} className="rounded-xl border border-slate-200 bg-white open:shadow-sm">
                <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {c.name}
                      {c.grade ? <span className="ml-2 font-normal text-slate-500">(Grade {c.grade})</span> : null}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Subjects linked: {c.subjects.length}</p>
                  </div>
                  <span className="text-sm text-slate-400">Expand</span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-3">
                  {c.subjects.length === 0 ? (
                    <p className="text-sm text-amber-700">No subjects linked to this class yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="p-2 text-left">Subject</th>
                            <th className="p-2 text-right">Levels</th>
                            <th className="p-2 text-right">Questions</th>
                            <th className="p-2 text-left">Levels detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.subjects.map((s) => (
                            <tr key={s.id} className="border-t border-slate-100 align-top">
                              <td className="p-2">
                                {s.name}
                                {s.code ? <span className="ml-1 text-slate-500">({s.code})</span> : null}
                              </td>
                              <td className="p-2 text-right">{s.levelCount}</td>
                              <td className="p-2 text-right">{s.questionCount}</td>
                              <td className="p-2">
                                {s.levels.length === 0 ? (
                                  <span className="text-slate-500">No levels</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.levels.map((l) => (
                                      <span
                                        key={l.id}
                                        className={`rounded-full px-2 py-0.5 text-xs ${
                                          l.questionCount === 0
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-emerald-100 text-emerald-700"
                                        }`}
                                      >
                                        {l.name}: {l.questionCount}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-6 text-slate-500">Loading…</p>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
