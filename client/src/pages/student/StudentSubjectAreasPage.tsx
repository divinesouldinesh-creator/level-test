import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { AppShell } from "../../components/AppShell";
import { studentNav } from "../../studentNav";

type AreaRow = {
  id: string;
  name: string;
  code: string | null;
  branches: { id: string; name: string; code: string | null }[];
};

export function StudentSubjectAreasPage() {
  const { logout, auth } = useAuth();
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const headerTitle =
    [auth.profile?.fullName, auth.profile?.className].filter(Boolean).join(" · ") || "Student";

  useEffect(() => {
    void (async () => {
      const r = await api<AreaRow[]>("/api/v1/student/subject-areas");
      setLoading(false);
      if (!r.ok) setErr(r.error ?? "Failed to load subjects");
      else setAreas(r.data ?? []);
    })();
  }, []);

  return (
    <AppShell title={headerTitle} onLogout={logout} nav={[...studentNav]} sidebarKicker="Student">
      <Link to="/student" className="text-sm font-medium text-brand-700">
        ← Home
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Subjects</h1>
      <p className="mt-1 text-slate-600">Choose a subject to learn or take tests.</p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : areas.length === 0 ? (
        <p className="mt-6 text-slate-600">No subjects assigned to your class yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {areas.map((area) => (
            <li key={area.id}>
              <Link
                to={`/student/subjects/${encodeURIComponent(area.id === "__none__" ? "maths" : area.id)}`}
                className="block min-h-[88px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500 hover:shadow-md"
              >
                <span className="text-lg font-semibold text-brand-900">{area.name}</span>
                <p className="mt-1 text-sm text-slate-500">
                  {area.branches.length} part{area.branches.length === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
