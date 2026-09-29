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
import { readStoredUpload, syncUploadDirToStore } from "./services/storedUploads.js";

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
app.use("/uploads", async (req, res, next) => {
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
  if (!rel || rel.includes("..") || rel.includes("\\")) {
    next();
    return;
  }
  const diskPath = path.resolve(uploadDir, rel);
  const root = path.resolve(uploadDir);
  if (diskPath !== root && !diskPath.startsWith(root + path.sep)) {
    next();
    return;
  }
  if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
    next();
    return;
  }
  try {
    const stored = await readStoredUpload(`/uploads/${rel}`);
    if (!stored) {
      next();
      return;
    }
    const body = Buffer.from(stored.data);
    res.setHeader("Content-Type", stored.mimeType);
    res.setHeader("Content-Length", body.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.send(body);
  } catch (err) {
    next(err);
  }
});
app.use("/uploads", express.static(uploadDir));

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
