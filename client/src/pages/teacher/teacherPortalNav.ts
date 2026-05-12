import type { AppShellNavItem } from "../../components/AppShell";

/** Shared sidebar links — skill (level tests) vs syllabus stay on separate routes. */
export const teacherPortalNav: AppShellNavItem[] = [
  { to: "/teacher", label: "Overview", end: true },
  { to: "/teacher/attendance", label: "Attendance" },
  { to: "/teacher/skill/analytics", label: "Skill tests" },
  { to: "/teacher/syllabus", label: "Syllabus tests" },
];
