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
        { to: "/admin/curriculum", label: "Skill Curriculum" },
        { to: "/admin/question-bank", label: "Skill Question Bank" },
        { to: "/admin/syllabus/curriculum", label: "Syllabus Curriculum" },
        { to: "/admin/syllabus/question-bank", label: "Syllabus Question Bank" },
        { to: "/admin/coverage", label: "Coverage" },
        { to: "/admin/students", label: "Students" },
        { to: "/admin/teachers", label: "Teachers" },
        { to: "/admin/security", label: "Security" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
