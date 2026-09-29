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
        { to: "/office/fee-structure", label: "Fee structure" },
        { to: "/office/account", label: "Account" },
        { to: "/office/collect", label: "Collect" },
        { to: "/office/school-totals", label: "School totals" },
        { to: "/office/attendance", label: "Attendance" },
        { to: "/office/teachers", label: "Teachers" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
