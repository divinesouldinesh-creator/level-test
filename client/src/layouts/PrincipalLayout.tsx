import { Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { AppShell } from "../components/AppShell";

export function PrincipalLayout() {
  const { logout, auth } = useAuth();
  return (
    <AppShell
      title={auth.profile?.fullName ?? "Principal"}
      onLogout={logout}
      sidebarKicker="Principal"
      nav={[
        { to: "/principal", label: "Needs support", end: true },
        { to: "/principal/security", label: "Password" },
      ]}
    >
      <Outlet />
    </AppShell>
  );
}
