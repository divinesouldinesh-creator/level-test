import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { AdminLayout } from "./layouts/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { StudentSubjects } from "./pages/student/StudentSubjects";
import { StudentLevels } from "./pages/student/StudentLevels";
import { StudentTest } from "./pages/student/StudentTest";
import { SyllabusSubjects } from "./pages/student/SyllabusSubjects";
import { SyllabusChapterPractice } from "./pages/student/SyllabusChapterPractice";
import { SyllabusTakeTest } from "./pages/student/SyllabusTakeTest";
import { StudentAttendancePage } from "./pages/student/StudentAttendancePage";
import { AdminHome } from "./pages/admin/AdminHome";
import { AdminStudentsPage } from "./pages/admin/AdminStudentsPage";
import { AdminCurriculumPage } from "./pages/admin/AdminCurriculumPage";
import { AdminCoveragePage } from "./pages/admin/AdminCoveragePage";
import { AdminQuestionBankPage } from "./pages/admin/AdminQuestionBankPage";
import { SyllabusCurriculumPage } from "./pages/admin/SyllabusCurriculumPage";
import { SyllabusQuestionBankPage } from "./pages/admin/SyllabusQuestionBankPage";
import { AdminTeachersPage } from "./pages/admin/AdminTeachersPage";
import { AdminSecurityPage } from "./pages/admin/AdminSecurityPage";
import { AdminAttendancePage } from "./pages/admin/AdminAttendancePage";
import { TeacherOverviewPage } from "./pages/teacher/TeacherOverviewPage";
import { TeacherAttendancePage } from "./pages/teacher/TeacherAttendancePage";
import { TeacherAnalyticsPage } from "./pages/teacher/TeacherAnalyticsPage";
import { TeacherSyllabusPage } from "./pages/teacher/TeacherSyllabusPage";

function LegacySyllabusTestUrlRedirect() {
  const { testId } = useParams();
  if (!testId) return <Navigate to="/student/syllabus" replace />;
  return <Navigate to={`/student/syllabus/practice/${testId}`} replace />;
}

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
        path="/student/attendance"
        element={
          <Guard role="STUDENT">
            <StudentAttendancePage />
          </Guard>
        }
      />
      <Route
        path="/student/syllabus"
        element={
          <Guard role="STUDENT">
            <SyllabusSubjects />
          </Guard>
        }
      />
      <Route
        path="/student/syllabus/subject/:subjectId"
        element={
          <Guard role="STUDENT">
            <SyllabusChapterPractice />
          </Guard>
        }
      />
      <Route
        path="/student/syllabus/practice/:testId"
        element={
          <Guard role="STUDENT">
            <SyllabusTakeTest />
          </Guard>
        }
      />
      <Route
        path="/student/syllabus/test/:testId"
        element={
          <Guard role="STUDENT">
            <LegacySyllabusTestUrlRedirect />
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
      <Route path="/teacher/analytics" element={<Navigate to="/teacher/skill/analytics" replace />} />
      <Route
        path="/teacher/skill/analytics"
        element={
          <Guard role="TEACHER">
            <TeacherAnalyticsPage />
          </Guard>
        }
      />
      <Route
        path="/teacher/syllabus"
        element={
          <Guard role="TEACHER">
            <TeacherSyllabusPage />
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
        <Route path="syllabus/curriculum" element={<SyllabusCurriculumPage />} />
        <Route path="syllabus/question-bank" element={<SyllabusQuestionBankPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="attendance" element={<AdminAttendancePage />} />
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
