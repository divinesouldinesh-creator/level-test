import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { AdminLayout } from "./layouts/AdminLayout";
import { OfficeLayout } from "./layouts/OfficeLayout";
import { LoginPage } from "./pages/LoginPage";
import { StudentHomePage } from "./pages/student/StudentHomePage";
import { StudentSubjectAreasPage } from "./pages/student/StudentSubjectAreasPage";
import { StudentSubjectAreaPage } from "./pages/student/StudentSubjectAreaPage";
import { StudentSubjectFixPage } from "./pages/student/StudentSubjectFixPage";
import { StudentPartHubPage } from "./pages/student/StudentPartHubPage";
import { StudentPartLearnPage } from "./pages/student/StudentPartLearnPage";
import { StudentLevels } from "./pages/student/StudentLevels";
import { StudentTest } from "./pages/student/StudentTest";
import { StudentDailyChallengeHubPage } from "./pages/student/StudentDailyChallengeHubPage";
import { StudentDailyChallengePage } from "./pages/student/StudentDailyChallengePage";
import { StudentMasteryPage } from "./pages/student/StudentMasteryPage";
import { StudentAttendancePage } from "./pages/student/StudentAttendancePage";
import { AdminHome } from "./pages/admin/AdminHome";
import { AdminStudentsPage } from "./pages/admin/AdminStudentsPage";
import { AdminCurriculumPage } from "./pages/admin/AdminCurriculumPage";
import { AdminCoveragePage } from "./pages/admin/AdminCoveragePage";
import { AdminQuestionBankPage } from "./pages/admin/AdminQuestionBankPage";
import { AdminStaffPage } from "./pages/admin/AdminStaffPage";
import { AdminTeachersPage } from "./pages/admin/AdminTeachersPage";
import { AdminSecurityPage } from "./pages/admin/AdminSecurityPage";
import { AdminSchoolBrandingPage } from "./pages/admin/AdminSchoolBrandingPage";
import { AdminTopicLessonsPage } from "./pages/admin/AdminTopicLessonsPage";
import { AdminAttendancePage } from "./pages/admin/AdminAttendancePage";
import { TeacherOverviewPage } from "./pages/teacher/TeacherOverviewPage";
import { TeacherAttendancePage } from "./pages/teacher/TeacherAttendancePage";
import { TeacherAnalyticsPage } from "./pages/teacher/TeacherAnalyticsPage";
import { TeacherDailyPracticePage } from "./pages/teacher/TeacherDailyPracticePage";

function Guard({
  role,
  children,
}: {
  role: "ADMIN" | "TEACHER" | "STUDENT" | "OFFICE";
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
            <StudentHomePage />
          </Guard>
        }
      />
      <Route
        path="/student/subjects"
        element={
          <Guard role="STUDENT">
            <StudentSubjectAreasPage />
          </Guard>
        }
      />
      <Route
        path="/student/subjects/:area/fix"
        element={
          <Guard role="STUDENT">
            <StudentSubjectFixPage />
          </Guard>
        }
      />
      <Route
        path="/student/subjects/:area"
        element={
          <Guard role="STUDENT">
            <StudentSubjectAreaPage />
          </Guard>
        }
      />
      <Route
        path="/student/part/:subjectId"
        element={
          <Guard role="STUDENT">
            <StudentPartHubPage />
          </Guard>
        }
      />
      <Route
        path="/student/part/:subjectId/learn"
        element={
          <Guard role="STUDENT">
            <StudentPartLearnPage />
          </Guard>
        }
      />
      <Route
        path="/student/part/:subjectId/test"
        element={
          <Guard role="STUDENT">
            <StudentLevels />
          </Guard>
        }
      />
      <Route
        path="/student/skills"
        element={<Navigate to="/student/subjects" replace />}
      />
      <Route
        path="/student/daily"
        element={
          <Guard role="STUDENT">
            <StudentDailyChallengeHubPage />
          </Guard>
        }
      />
      <Route
        path="/student/daily/:challengeId"
        element={
          <Guard role="STUDENT">
            <StudentDailyChallengePage />
          </Guard>
        }
      />
      <Route
        path="/student/mastery/:masteryId"
        element={
          <Guard role="STUDENT">
            <StudentMasteryPage />
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
        path="/student/syllabus/*"
        element={<Navigate to="/student/subjects" replace />}
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
        path="/teacher/daily-practice"
        element={
          <Guard role="TEACHER">
            <TeacherDailyPracticePage />
          </Guard>
        }
      />
      <Route path="/teacher/syllabus" element={<Navigate to="/teacher" replace />} />
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
        <Route path="topic-lessons" element={<AdminTopicLessonsPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="attendance" element={<AdminAttendancePage />} />
        <Route path="staff" element={<AdminStaffPage />} />
        <Route path="teachers" element={<Navigate to="/admin/staff" replace />} />
        <Route path="branding" element={<AdminSchoolBrandingPage />} />
        <Route path="security" element={<AdminSecurityPage />} />
      </Route>
      <Route
        path="/office"
        element={
          <Guard role="OFFICE">
            <OfficeLayout />
          </Guard>
        }
      >
        <Route index element={<Navigate to="students" replace />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="attendance" element={<AdminAttendancePage />} />
        <Route path="teachers" element={<AdminTeachersPage />} />
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
