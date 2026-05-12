import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { teacherPortalNav } from "./teacherPortalNav";

type ClassRow = {
  id: string;
  name: string;
  grade: string | null;
  studentCount: number;
};

export function TeacherOverviewPage() {
  const { logout, auth } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<ClassRow[]>("/api/v1/teacher/classes");
      if (!r.ok) {
        setErr(r.error ?? "Could not load classes");
        return;
      }
      setClasses(r.data ?? []);
    })();
  }, []);

  const totalStudents = classes.reduce((acc, c) => acc + c.studentCount, 0);

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      nav={[...teacherPortalNav]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Teacher overview</h1>
      <p className="text-slate-600 mt-1">Simple daily workflow for phone use.</p>
      {err ? <p className="text-red-600 mt-3">{err}</p> : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Classes</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{classes.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Students</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalStudents}</p>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/teacher/attendance"
          className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm block"
        >
          <p className="font-semibold text-indigo-900">Take attendance</p>
          <p className="text-sm text-indigo-700 mt-1">Mark and save class attendance by date.</p>
        </Link>
        <Link
          to="/teacher/skill/analytics"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm block"
        >
          <p className="font-semibold text-slate-900">Skill tests</p>
          <p className="text-sm text-slate-600 mt-1">Level tests: analytics, weak topics, and scores.</p>
        </Link>
        <Link
          to="/teacher/syllabus"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm block lg:col-span-1"
        >
          <p className="font-semibold text-emerald-900">Syllabus tests</p>
          <p className="text-sm text-emerald-800 mt-1">
            Chapter-based practice: who took tests and their marks.
          </p>
        </Link>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold text-lg text-slate-900">Class list</h2>
        <div className="mt-3 space-y-2">
          {classes.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-medium text-slate-900">{c.name}</p>
              <p className="text-sm text-slate-600">
                {c.grade ? `Grade ${c.grade} • ` : ""}
                {c.studentCount} students
              </p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
