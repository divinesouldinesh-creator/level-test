import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { AdminLayout } from "./layouts/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { StudentSubjects } from "./pages/student/StudentSubjects";
import { StudentLevels } from "./pages/student/StudentLevels";
import { StudentTest } from "./pages/student/StudentTest";
import { AdminHome } from "./pages/admin/AdminHome";
import { AdminStudentsPage } from "./pages/admin/AdminStudentsPage";
import { AdminCurriculumPage } from "./pages/admin/AdminCurriculumPage";
import { AdminCoveragePage } from "./pages/admin/AdminCoveragePage";
import { AdminQuestionBankPage } from "./pages/admin/AdminQuestionBankPage";
import { AdminTeachersPage } from "./pages/admin/AdminTeachersPage";
import { AdminSecurityPage } from "./pages/admin/AdminSecurityPage";
import { TeacherOverviewPage } from "./pages/teacher/TeacherOverviewPage";
import { TeacherAttendancePage } from "./pages/teacher/TeacherAttendancePage";
import { TeacherAnalyticsPage } from "./pages/teacher/TeacherAnalyticsPage";

function Guard({
  role,
  children,
}: {
  role: "ADMIN" | "TEACHER" | "STUDENT";
  children: React.ReactNode;
}) {
  const { auth } = useAuth();
  if (auth.loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-slate-600">
        Loading…
      </div>
    );
  }
  if (auth.role !== role) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/student"
        element={
          <Guard role="STUDENT">
            <StudentSubjects />
          </Guard>
        }
      />
      <Route
        path="/student/subject/:subjectId/levels"
        element={
          <Guard role="STUDENT">
            <StudentLevels />
          </Guard>
        }
      />
      <Route
        path="/student/test/:testId"
        element={
          <Guard role="STUDENT">
            <StudentTest />
          </Guard>
        }
      />
      <Route
        path="/teacher"
        element={
          <Guard role="TEACHER">
            <TeacherOverviewPage />
          </Guard>
        }
      />
      <Route
        path="/teacher/attendance"
        element={
          <Guard role="TEACHER">
            <TeacherAttendancePage />
          </Guard>
        }
      />
      <Route
        path="/teacher/analytics"
        element={
          <Guard role="TEACHER">
            <TeacherAnalyticsPage />
          </Guard>
        }
      />
      <Route
        path="/admin"
        element={
          <Guard role="ADMIN">
            <AdminLayout />
          </Guard>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="curriculum" element={<AdminCurriculumPage />} />
        <Route path="coverage" element={<AdminCoveragePage />} />
        <Route path="question-bank" element={<AdminQuestionBankPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="teachers" element={<AdminTeachersPage />} />
        <Route path="security" element={<AdminSecurityPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
