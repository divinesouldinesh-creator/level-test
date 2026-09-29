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

export async function rememberQuestionImages(
  uploadDir: string,
  questions: { stemImageUrl?: string | null }[]
): Promise<void> {
  const root = path.resolve(uploadDir);
  for (const q of questions) {
    const url = q.stemImageUrl;
    if (!url || !safePublicPath(url)) continue;
    const rel = url.slice("/uploads/".length);
    if (!rel) continue;
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) continue;
    await rememberUploadFile(abs, url);
  }
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
