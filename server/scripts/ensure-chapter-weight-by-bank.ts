/**
 * Optional chapter-test weightage by question-bank size.
 * Usage: npx tsx scripts/ensure-chapter-weight-by-bank.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "chapter_weight_by_bank" BOOLEAN NOT NULL DEFAULT false`
  );

  const migrationName = "20260925140000_chapter_weight_by_bank";
  try {
    const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
    `;
    if (existing.length === 0) {
      const sqlPath = path.join(__dirname, "../prisma/migrations/20260925140000_chapter_weight_by_bank/migration.sql");
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

  console.log("Chapter weight-by-bank ensured.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
