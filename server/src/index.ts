import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import teacherRoutes from "./routes/teacher.js";
import studentRoutes from "./routes/student.js";
import syllabusAdminRoutes from "./routes/syllabusAdmin.js";
import syllabusStudentRoutes from "./routes/syllabusStudent.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = "0.0.0.0";

/** Browser origins allowed when the client calls the API with an absolute URL (VITE_API_URL). Default covers local Vite. */
function corsAllowedOrigins(): string[] {
  const fromList = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const defaults = ["http://localhost:5173", "http://127.0.0.1:5173"];
  const extra = process.env.FRONTEND_ORIGIN?.trim();
  return [...new Set([...defaults, ...fromList, ...(extra ? [extra] : [])])];
}

const allowedOrigins = corsAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/admin/syllabus", syllabusAdminRoutes);
app.use("/api/v1/teacher", teacherRoutes);
app.use("/api/v1/student", studentRoutes);
app.use("/api/v1/student/syllabus", syllabusStudentRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});
