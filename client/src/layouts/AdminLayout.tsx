import { Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { AppShell } from "../components/AppShell";

export function AdminLayout() {
  const { logout, auth } = useAuth();
  return (
    <AppShell
      title={auth.profile?.fullName ?? "Admin"}
      onLogout={logout}
      nav={[
        { to: "/admin", label: "Dashboard", end: true },
        { to: "/admin/curriculum", label: "Curriculum" },
        { to: "/admin/question-bank", label: "Question Bank" },
        { to: "/admin/topic-lessons", label: "Topic lessons" },
        { to: "/admin/coverage", label: "Coverage" },
        { to: "/admin/students", label: "Students" },
        { to: "/admin/fees", label: "Fees" },
        { to: "/admin/attendance", label: "Attendance" },
        { to: "/admin/staff", label: "Staff" },
        { to: "/admin/branding", label: "School branding" },
        { to: "/admin/security", label: "Security" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
