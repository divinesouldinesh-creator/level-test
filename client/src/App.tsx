import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { LoginPage } from "./pages/LoginPage";

const AdminLayout = lazy(() =>
  import("./layouts/AdminLayout").then((m) => ({ default: m.AdminLayout }))
);
const OfficeLayout = lazy(() =>
  import("./layouts/OfficeLayout").then((m) => ({ default: m.OfficeLayout }))
);
const StudentHomePage = lazy(() =>
  import("./pages/student/StudentHomePage").then((m) => ({ default: m.StudentHomePage }))
);
const StudentSubjectAreasPage = lazy(() =>
  import("./pages/student/StudentSubjectAreasPage").then((m) => ({ default: m.StudentSubjectAreasPage }))
);
const StudentSubjectAreaPage = lazy(() =>
  import("./pages/student/StudentSubjectAreaPage").then((m) => ({ default: m.StudentSubjectAreaPage }))
);
const StudentSubjectFixPage = lazy(() =>
  import("./pages/student/StudentSubjectFixPage").then((m) => ({ default: m.StudentSubjectFixPage }))
);
const StudentPartHubPage = lazy(() =>
  import("./pages/student/StudentPartHubPage").then((m) => ({ default: m.StudentPartHubPage }))
);
const StudentPartLearnPage = lazy(() =>
  import("./pages/student/StudentPartLearnPage").then((m) => ({ default: m.StudentPartLearnPage }))
);
const StudentLevels = lazy(() =>
  import("./pages/student/StudentLevels").then((m) => ({ default: m.StudentLevels }))
);
const StudentTest = lazy(() =>
  import("./pages/student/StudentTest").then((m) => ({ default: m.StudentTest }))
);
const StudentDailyChallengeHubPage = lazy(() =>
  import("./pages/student/StudentDailyChallengeHubPage").then((m) => ({
    default: m.StudentDailyChallengeHubPage,
  }))
);
const StudentDailyChallengePage = lazy(() =>
  import("./pages/student/StudentDailyChallengePage").then((m) => ({
    default: m.StudentDailyChallengePage,
  }))
);
const StudentMasteryPage = lazy(() =>
  import("./pages/student/StudentMasteryPage").then((m) => ({ default: m.StudentMasteryPage }))
);
const StudentAttendancePage = lazy(() =>
  import("./pages/student/StudentAttendancePage").then((m) => ({ default: m.StudentAttendancePage }))
);
const AdminHome = lazy(() => import("./pages/admin/AdminHome").then((m) => ({ default: m.AdminHome })));
const AdminStudentsPage = lazy(() =>
  import("./pages/admin/AdminStudentsPage").then((m) => ({ default: m.AdminStudentsPage }))
);
const AdminCurriculumPage = lazy(() =>
  import("./pages/admin/AdminCurriculumPage").then((m) => ({ default: m.AdminCurriculumPage }))
);
const AdminCoveragePage = lazy(() =>
  import("./pages/admin/AdminCoveragePage").then((m) => ({ default: m.AdminCoveragePage }))
);
const AdminQuestionBankPage = lazy(() =>
  import("./pages/admin/AdminQuestionBankPage").then((m) => ({ default: m.AdminQuestionBankPage }))
);
const AdminStaffPage = lazy(() =>
  import("./pages/admin/AdminStaffPage").then((m) => ({ default: m.AdminStaffPage }))
);
const AdminTeachersPage = lazy(() =>
  import("./pages/admin/AdminTeachersPage").then((m) => ({ default: m.AdminTeachersPage }))
);
const AdminSecurityPage = lazy(() =>
  import("./pages/admin/AdminSecurityPage").then((m) => ({ default: m.AdminSecurityPage }))
);
const AdminSchoolBrandingPage = lazy(() =>
  import("./pages/admin/AdminSchoolBrandingPage").then((m) => ({ default: m.AdminSchoolBrandingPage }))
);
const AdminTopicLessonsPage = lazy(() =>
  import("./pages/admin/AdminTopicLessonsPage").then((m) => ({ default: m.AdminTopicLessonsPage }))
);
const AdminAttendancePage = lazy(() =>
  import("./pages/admin/AdminAttendancePage").then((m) => ({ default: m.AdminAttendancePage }))
);
const OfficeFeesPage = lazy(() =>
  import("./pages/office/OfficeFeesPage").then((m) => ({ default: m.OfficeFeesPage }))
);
const TeacherOverviewPage = lazy(() =>
  import("./pages/teacher/TeacherOverviewPage").then((m) => ({ default: m.TeacherOverviewPage }))
);
const TeacherAttendancePage = lazy(() =>
  import("./pages/teacher/TeacherAttendancePage").then((m) => ({ default: m.TeacherAttendancePage }))
);
const TeacherAnalyticsPage = lazy(() =>
  import("./pages/teacher/TeacherAnalyticsPage").then((m) => ({ default: m.TeacherAnalyticsPage }))
);
const TeacherDailyPracticePage = lazy(() =>
  import("./pages/teacher/TeacherDailyPracticePage").then((m) => ({ default: m.TeacherDailyPracticePage }))
);
const TeacherClassroomTestPage = lazy(() =>
  import("./pages/teacher/TeacherClassroomTestPage").then((m) => ({ default: m.TeacherClassroomTestPage }))
);
const TeacherCareCallPage = lazy(() =>
  import("./pages/teacher/TeacherCareCallPage").then((m) => ({ default: m.TeacherCareCallPage }))
);

function PageFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center text-slate-600">Loading…</div>
  );
}

function Guard({
  role,
  children,
}: {
  role: "ADMIN" | "TEACHER" | "STUDENT" | "OFFICE";
  children: React.ReactNode;
}) {
  const { auth } = useAuth();
  if (auth.loading) {
    return <PageFallback />;
  }
  if (auth.role !== role) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
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
        <Route path="/student/skills" element={<Navigate to="/student/subjects" replace />} />
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
        <Route path="/student/syllabus/*" element={<Navigate to="/student/subjects" replace />} />
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
          path="/teacher/class-tests"
          element={
            <Guard role="TEACHER">
              <TeacherClassroomTestPage />
            </Guard>
          }
        />
        <Route
          path="/teacher/care-calls"
          element={
            <Guard role="TEACHER">
              <TeacherCareCallPage />
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
          <Route path="fees" element={<OfficeFeesPage />} />
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
          <Route path="fees" element={<OfficeFeesPage />} />
          <Route path="attendance" element={<AdminAttendancePage />} />
          <Route path="teachers" element={<AdminTeachersPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
