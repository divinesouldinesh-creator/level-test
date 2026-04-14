import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { LoginPage } from "./pages/LoginPage";
import { StudentSubjects } from "./pages/student/StudentSubjects";
import { StudentLevels } from "./pages/student/StudentLevels";
import { StudentTest } from "./pages/student/StudentTest";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { TeacherDashboard } from "./pages/teacher/TeacherDashboard";

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
            <TeacherDashboard />
          </Guard>
        }
      />
      <Route
        path="/admin"
        element={
          <Guard role="ADMIN">
            <AdminDashboard />
          </Guard>
        }
      />
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
