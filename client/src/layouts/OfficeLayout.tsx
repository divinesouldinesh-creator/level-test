import { Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { AppShell } from "../components/AppShell";

export function OfficeLayout() {
  const { logout, auth } = useAuth();
  return (
    <AppShell
      title={auth.profile?.fullName ?? "Office"}
      onLogout={logout}
      sidebarKicker="Office"
      nav={[
        { to: "/office/students", label: "Students" },
        { to: "/office/fees", label: "Fees" },
        { to: "/office/attendance", label: "Attendance" },
        { to: "/office/teachers", label: "Teachers" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
