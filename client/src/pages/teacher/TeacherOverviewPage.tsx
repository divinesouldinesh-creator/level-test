import { Link } from "react-router-dom";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../auth";
import { teacherPortalNav } from "./teacherPortalNav";

export function TeacherOverviewPage() {
  const { logout, auth } = useAuth();

  return (
    <AppShell
      title={auth.profile?.fullName ?? "Teacher"}
      onLogout={logout}
      nav={[...teacherPortalNav]}
    >
      <h1 className="text-2xl font-bold text-slate-900">Teacher overview</h1>
      <p className="text-slate-600 mt-1">Simple daily workflow for phone use.</p>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link
          to="/teacher/fees"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm block"
        >
          <p className="font-semibold text-rose-900">Fee status</p>
          <p className="text-sm text-rose-800 mt-1">
            See who pays monthly or yearly, the balance, and the last payment.
          </p>
        </Link>
        <Link
          to="/teacher/attendance"
          className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm block"
        >
          <p className="font-semibold text-indigo-900">Take attendance</p>
          <p className="text-sm text-indigo-700 mt-1">Mark and save class attendance by date.</p>
        </Link>
        <Link
          to="/teacher/class-tests"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm block"
        >
          <p className="font-semibold text-amber-900">Record class test</p>
          <p className="text-sm text-amber-800 mt-1">
            Enter paper marks or tick oral / speaking levels. Separate from online tests.
          </p>
        </Link>
        <Link
          to="/teacher/care-calls"
          className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm block"
        >
          <p className="font-semibold text-sky-900">Care calls</p>
          <p className="text-sm text-sky-800 mt-1">
            Monthly parent call: English practice and heavy phone/TV, Yes or No.
          </p>
        </Link>
        <Link
          to="/teacher/skill/analytics"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm block"
        >
          <p className="font-semibold text-slate-900">Skill tests</p>
          <p className="text-sm text-slate-600 mt-1">Level tests: analytics, weak topics, and scores.</p>
        </Link>
        <Link
          to="/teacher/daily-practice"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm block"
        >
          <p className="font-semibold text-emerald-900">Daily practice</p>
          <p className="text-sm text-emerald-800 mt-1">
            Who practiced today and each student’s practice streak.
          </p>
        </Link>
      </section>
    </AppShell>
  );
}
