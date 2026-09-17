import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";
import {
  areaLabelFromSubjects,
  subjectMatchesArea,
  type SubjectWithArea,
} from "../../subjectAreas";

export function StudentSubjectAreaPage() {
  const { area: areaParam } = useParams();
  const { logout, auth } = useAuth();
  const [subjects, setSubjects] = useState<SubjectWithArea[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!areaParam) return;
    void (async () => {
      setLoading(true);
      const subRes = await api<SubjectWithArea[]>("/api/v1/student/subjects");
      setLoading(false);
      if (!subRes.ok) {
        setErr(subRes.error ?? "Failed to load subjects");
        return;
      }
      const all = subRes.data ?? [];
      setSubjects(all.filter((s) => subjectMatchesArea(s, areaParam)));
      setErr(null);
    })();
  }, [areaParam]);

  if (!areaParam) {
    return <Navigate to="/student/subjects" replace />;
  }

  const title = areaLabelFromSubjects(areaParam, subjects);

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Student"}
      onLogout={logout}
      nav={[...studentNav]}
      sidebarKicker="Student"
    >
      <Link to="/student/subjects" className="text-sm font-medium text-brand-700">
        ← Subjects
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-slate-600">Open a part to Learn and Test, or pick a book to choose chapters.</p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {subjects.length === 0 ? (
            <li className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
              No {title} parts assigned to your class yet.
            </li>
          ) : (
            subjects.map((s) => (
              <li key={s.id}>
                <Link
                  to={
                    s.testMode === "CHAPTER"
                      ? `/student/part/${s.id}/test`
                      : `/student/part/${s.id}`
                  }
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-brand-500"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    {s.code && <p className="text-sm text-slate-500">{s.code}</p>}
                    {s.testMode === "CHAPTER" ? (
                      <p className="mt-1 text-xs text-emerald-700">Tick chapters to start a test</p>
                    ) : null}
                  </div>
                  <span className="text-slate-400">→</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </AppShell>
  );
}
