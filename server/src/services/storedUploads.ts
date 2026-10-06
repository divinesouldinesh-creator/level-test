import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma.js";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

let tableReady: Promise<void> | null = null;

type StoredRow = { mime_type: string; data: Uint8Array };

export function mimeForUploadPath(publicPath: string): string {
  const ext = publicPath.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

export function ensureStoredUploadsTable(): Promise<void> {
  tableReady ??= prisma
    .$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "StoredUpload" (
        "path" TEXT NOT NULL,
        "mime_type" TEXT NOT NULL,
        "data" BYTEA NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "StoredUpload_pkey" PRIMARY KEY ("path")
      )
    `)
    .then(() => undefined);
  return tableReady;
}

function safePublicPath(publicPath: string): boolean {
  return publicPath.startsWith("/uploads/") && !publicPath.includes("..");
}

export async function rememberUpload(publicPath: string, data: Buffer): Promise<void> {
  if (!safePublicPath(publicPath)) return;
  await ensureStoredUploadsTable();
  const mimeType = mimeForUploadPath(publicPath);
  await prisma.$executeRaw`
    INSERT INTO "StoredUpload" ("path", "mime_type", "data", "created_at")
    VALUES (${publicPath}, ${mimeType}, ${data}, NOW())
    ON CONFLICT ("path") DO UPDATE SET
      "mime_type" = EXCLUDED."mime_type",
      "data" = EXCLUDED."data"
  `;
}

export async function rememberUploadFile(absPath: string, publicPath: string): Promise<void> {
  if (!fs.existsSync(absPath)) return;
  await rememberUpload(publicPath, fs.readFileSync(absPath));
}

function diskPathFor(uploadDir: string, publicPath: string): string | null {
  const root = path.resolve(uploadDir);
  const rel = publicPath.replace(/^\/uploads\/?/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export async function writeUploadToDisk(uploadDir: string, publicPath: string, data: Buffer): Promise<void> {
  const abs = diskPathFor(uploadDir, publicPath);
  if (!abs) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
}

export async function rememberQuestionImages(
  uploadDir: string,
  questions: {
    stemImageUrl?: string | null;
    optionImageA?: string | null;
    optionImageB?: string | null;
    optionImageC?: string | null;
    optionImageD?: string | null;
  }[]
): Promise<void> {
  const urls = questions.flatMap((q) => [
    q.stemImageUrl,
    q.optionImageA,
    q.optionImageB,
    q.optionImageC,
    q.optionImageD,
  ]);
  for (const url of urls) {
    if (!url || !safePublicPath(url)) continue;
    const abs = diskPathFor(uploadDir, url);
    if (!abs) continue;
    await rememberUploadFile(abs, url);
  }
}

function fallbackOrigin(): string {
  return (process.env.UPLOAD_FALLBACK_ORIGIN ?? "").trim().replace(/\/$/, "");
}

export async function fetchAndRememberUpload(
  publicPath: string,
  uploadDir?: string
): Promise<{ mimeType: string; data: Buffer } | null> {
  if (!safePublicPath(publicPath)) return null;
  const origin = fallbackOrigin();
  if (!origin) return null;
  const res = await fetch(`${origin}${publicPath}`);
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (type && !type.startsWith("image/") && type !== "application/octet-stream") return null;
  const data = Buffer.from(await res.arrayBuffer());
  if (!data.length) return null;
  await rememberUpload(publicPath, data);
  if (uploadDir) await writeUploadToDisk(uploadDir, publicPath, data);
  return { mimeType: mimeForUploadPath(publicPath), data };
}

export async function resolveUpload(
  publicPath: string,
  uploadDir: string
): Promise<{ mimeType: string; data: Buffer } | null> {
  if (!safePublicPath(publicPath)) return null;
  const abs = diskPathFor(uploadDir, publicPath);
  if (abs && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    const data = fs.readFileSync(abs);
    void rememberUpload(publicPath, data).catch((err) => {
      console.error("remember upload failed", publicPath, err);
    });
    return { mimeType: mimeForUploadPath(publicPath), data };
  }
  const stored = await readStoredUpload(publicPath);
  if (stored) {
    const data = Buffer.from(stored.data);
    if (abs) await writeUploadToDisk(uploadDir, publicPath, data);
    return { mimeType: stored.mimeType, data };
  }
  return fetchAndRememberUpload(publicPath, uploadDir);
}

export async function backfillQuestionUploads(uploadDir: string): Promise<number> {
  await ensureStoredUploadsTable();
  const questions = await prisma.question.findMany({
    where: {
      OR: [
        { stemImageUrl: { not: null } },
        { optionImageA: { not: null } },
        { optionImageB: { not: null } },
        { optionImageC: { not: null } },
        { optionImageD: { not: null } },
      ],
    },
    select: {
      stemImageUrl: true,
      optionImageA: true,
      optionImageB: true,
      optionImageC: true,
      optionImageD: true,
    },
  });
  const urls = [
    ...new Set(
      questions.flatMap((q) => [q.stemImageUrl, q.optionImageA, q.optionImageB, q.optionImageC, q.optionImageD]).filter((u): u is string => Boolean(u && safePublicPath(u)))
    ),
  ];
  let saved = 0;
  for (const url of urls) {
    const got = await resolveUpload(url, uploadDir);
    if (got) saved += 1;
  }
  return saved;
}

export async function readStoredUpload(publicPath: string): Promise<{ mimeType: string; data: Uint8Array } | null> {
  if (!safePublicPath(publicPath)) return null;
  await ensureStoredUploadsTable();
  const rows = await prisma.$queryRaw<StoredRow[]>`
    SELECT "mime_type", "data" FROM "StoredUpload" WHERE "path" = ${publicPath}
  `;
  const row = rows[0];
  if (!row) return null;
  return { mimeType: row.mime_type, data: row.data };
}

const MAX_INLINE_BYTES = 1_500_000;

export async function inlineMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:") || /^https?:\/\//i.test(url) || url.startsWith("blob:")) return url;
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
  const resolved = await resolveUpload(url, uploadDir);
  if (!resolved || resolved.data.length === 0 || resolved.data.length > MAX_INLINE_BYTES) return url;
  return `data:${resolved.mimeType};base64,${resolved.data.toString("base64")}`;
}

export async function forgetUpload(publicPath: string | null | undefined): Promise<void> {
  if (!publicPath || !safePublicPath(publicPath)) return;
  await ensureStoredUploadsTable();
  await prisma.$executeRaw`DELETE FROM "StoredUpload" WHERE "path" = ${publicPath}`;
}

export async function syncUploadDirToStore(uploadDir: string): Promise<number> {
  await ensureStoredUploadsTable();
  const root = path.resolve(uploadDir);
  let saved = 0;
  for (const folder of ["questions", "school"]) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      const publicPath = `/uploads/${folder}/${name}`;
      const existing = await prisma.$queryRaw<{ path: string }[]>`
        SELECT "path" FROM "StoredUpload" WHERE "path" = ${publicPath}
      `;
      if (existing.length) continue;
      await rememberUpload(publicPath, fs.readFileSync(abs));
      saved += 1;
    }
  }
  return saved;
}
