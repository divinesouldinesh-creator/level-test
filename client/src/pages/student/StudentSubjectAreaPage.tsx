import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
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
  const navigate = useNavigate();
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
      <p className="mt-1 text-slate-600">Fix weak topics or open a part to Learn and Test.</p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-3">
          <li>
            <button
              type="button"
              onClick={() => navigate(`/student/subjects/${encodeURIComponent(areaParam)}/fix`)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-left shadow-sm hover:border-rose-400"
            >
              <div>
                <p className="font-semibold text-slate-900">Fix these topics</p>
                <p className="mt-0.5 text-sm text-slate-600">Practice topics you missed on tests</p>
              </div>
              <span className="text-slate-400">→</span>
            </button>
          </li>
          {subjects.length === 0 ? (
            <li className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
              No {title} parts assigned to your class yet.
            </li>
          ) : (
            subjects.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/student/part/${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-brand-500"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    {s.code && <p className="text-sm text-slate-500">{s.code}</p>}
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
