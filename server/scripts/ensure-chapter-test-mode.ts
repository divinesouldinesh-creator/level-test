/**
 * Ensures chapter-mode branches (book tests without levels).
 * Usage: npx tsx scripts/ensure-chapter-test-mode.ts
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
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "SubjectTestMode" AS ENUM ('LEVEL', 'CHAPTER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "test_mode" "SubjectTestMode" NOT NULL DEFAULT 'LEVEL'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "chapter_test_question_count" INTEGER NOT NULL DEFAULT 10`
  );

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SubjectChapter" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SubjectChapter_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "SubjectChapter_subject_id_topic_id_key" ON "SubjectChapter"("subject_id", "topic_id")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SubjectChapter_subject_id_idx" ON "SubjectChapter"("subject_id")`
  );

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "SubjectChapter" ADD CONSTRAINT "SubjectChapter_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "SubjectChapter" ADD CONSTRAINT "SubjectChapter_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ALTER COLUMN "level_id" DROP NOT NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Test" ALTER COLUMN "level_id" DROP NOT NULL`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "selected_topic_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "chapter_negative_marking" BOOLEAN NOT NULL DEFAULT false`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "chapter_wrong_penalty" DOUBLE PRECISION NOT NULL DEFAULT 0.25`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "wrong_penalty" DOUBLE PRECISION NOT NULL DEFAULT 0`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE "TestAttempt" ALTER COLUMN "score" TYPE DOUBLE PRECISION`);

  const migrationName = "20260917080000_chapter_test_mode";
  try {
    const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
    `;
    if (existing.length === 0) {
      const sqlPath = path.join(__dirname, "../prisma/migrations/20260917080000_chapter_test_mode/migration.sql");
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

  console.log("Chapter test mode (book branches without levels) ensured.");

  const negativeMigration = "20260917100000_chapter_negative_marking";
  try {
    const existingNeg = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${negativeMigration}
    `;
    if (existingNeg.length === 0) {
      const sqlPath = path.join(__dirname, "../prisma/migrations/20260917100000_chapter_negative_marking/migration.sql");
      const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
      const id = randomUUID();
      const now = new Date();
      await prisma.$executeRaw`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (${id}, ${checksum}, ${now}, ${negativeMigration}, NULL, NULL, ${now}, 1)
      `;
    }
  } catch {
    // ignore
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
