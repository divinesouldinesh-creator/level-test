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
        { to: "/admin/students", label: "Students" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
