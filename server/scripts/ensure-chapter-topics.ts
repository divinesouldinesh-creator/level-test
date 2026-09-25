/**
 * Optional topics inside a book chapter.
 * Usage: npx tsx scripts/ensure-chapter-topics.ts
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
CREATE TABLE IF NOT EXISTS "ChapterTopic" (
    "id" TEXT NOT NULL,
    "subject_chapter_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChapterTopic_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChapterTopic_subject_chapter_id_name_key" ON "ChapterTopic"("subject_chapter_id", "name")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ChapterTopic_subject_chapter_id_idx" ON "ChapterTopic"("subject_chapter_id")`
  );
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "ChapterTopic" ADD CONSTRAINT "ChapterTopic_subject_chapter_id_fkey"
    FOREIGN KEY ("subject_chapter_id") REFERENCES "SubjectChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "chapter_topic_id" TEXT`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Question_chapter_topic_id_idx" ON "Question"("chapter_topic_id")`
  );
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "Question" ADD CONSTRAINT "Question_chapter_topic_id_fkey"
    FOREIGN KEY ("chapter_topic_id") REFERENCES "ChapterTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Test" ADD COLUMN IF NOT EXISTS "selected_chapter_topic_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`
  );

  const migrationName = "20260925100000_chapter_topics";
  try {
    const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
    `;
    if (existing.length === 0) {
      const sqlPath = path.join(__dirname, "../prisma/migrations/20260925100000_chapter_topics/migration.sql");
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

  console.log("Chapter topics ensured.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
