import type { AppShellNavItem } from "../../components/AppShell";

/** Shared sidebar links for the teacher portal. */
export const teacherPortalNav: AppShellNavItem[] = [
  { to: "/teacher", label: "Overview", end: true },
  { to: "/teacher/attendance", label: "Attendance" },
  { to: "/teacher/class-tests", label: "Class tests" },
  { to: "/teacher/care-calls", label: "Care calls" },
  { to: "/teacher/daily-practice", label: "Daily practice" },
  { to: "/teacher/skill/analytics", label: "Skill tests" },
];
