/**
 * Keep uploaded diagrams in the database and copy any files already on disk.
 * Usage: npx tsx scripts/ensure-stored-uploads.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { backfillQuestionUploads, syncUploadDirToStore } from "../src/services/storedUploads.js";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
  const saved = await syncUploadDirToStore(uploadDir);
  const resolved = await backfillQuestionUploads(uploadDir);

  const migrationName = "20260929230000_stored_uploads";
  try {
    const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
    `;
    if (existing.length === 0) {
      const sqlPath = path.join(__dirname, "../prisma/migrations/20260929230000_stored_uploads/migration.sql");
      const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
      const id = randomUUID();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
      `;
    }
  } catch {
    // _prisma_migrations may not exist in some environments
  }

  const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "StoredUpload"`;
  console.log(
    `Stored uploads ensured. Copied ${saved} new file(s). Resolved ${resolved} question image(s). ${Number(rows[0]?.n ?? 0)} in the database.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
