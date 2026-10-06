import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import teacherRoutes from "./routes/teacher.js";
import studentRoutes from "./routes/student.js";
import settingsRoutes from "./routes/settings.js";
import { resolveUpload, syncUploadDirToStore } from "./services/storedUploads.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = "0.0.0.0";
const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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

async function sendStoredMedia(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  let rel = "";
  try {
    rel = decodeURIComponent(req.path).replace(/^\/+/, "");
  } catch {
    next();
    return;
  }
  if (rel.startsWith("uploads/")) rel = rel.slice("uploads/".length);
  if (!rel || rel.includes("..") || rel.includes("\\")) {
    next();
    return;
  }
  try {
    const stored = await resolveUpload(`/uploads/${rel}`, uploadDir);
    if (!stored) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    const body = Buffer.isBuffer(stored.data) ? stored.data : Buffer.from(stored.data);
    res.setHeader("Content-Type", stored.mimeType);
    res.setHeader("Content-Length", body.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  } catch (err) {
    next(err);
  }
}

app.use("/uploads", sendStoredMedia);
app.use("/api/v1/media/uploads", sendStoredMedia);
app.use("/api/v1/media", sendStoredMedia);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/teacher", teacherRoutes);
app.use("/api/v1/student", studentRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

void syncUploadDirToStore(uploadDir)
  .then((saved) => {
    if (saved > 0) console.log(`Stored ${saved} upload(s) in the database`);
  })
  .catch((err) => {
    console.error("upload sync failed", err);
  });

app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});
