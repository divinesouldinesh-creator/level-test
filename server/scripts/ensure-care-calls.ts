/**
 * Ensures CareCall tables (English practice + heavy phone/TV yes/no).
 * Usage: npx tsx scripts/ensure-care-calls.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function recordMigration(migrationName: string) {
  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length > 0) return;
  const sqlPath = path.join(__dirname, `../prisma/migrations/${migrationName}/migration.sql`);
  if (!fs.existsSync(sqlPath)) return;
  const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
  const id = randomUUID();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
  `;
  console.log("Recorded migration:", migrationName);
}

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "CareCallYesNo" AS ENUM ('YES', 'NO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "CareCallFrequency" AS ENUM ('DAILY', 'SOMETIMES', 'NO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "CareCallExercise" AS ENUM ('REGULAR', 'SOMETIMES', 'NO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "CareCallPhoneTv" AS ENUM ('UNDER_1H', 'H1_2', 'H2_3', 'H3_PLUS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "CareCall" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL,
    "english_mirror_practice" "CareCallYesNo",
    "heavy_phone_tv" "CareCallYesNo",
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareCall_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(`ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "daily_study"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "exercise"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "phone_tv_usage"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "parent_comment"`);
  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CareCall' AND column_name = 'english_mirror_practice'
      AND udt_name = 'CareCallFrequency'
  ) THEN
    ALTER TABLE "CareCall" DROP COLUMN "english_mirror_practice";
  END IF;
END $$`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "CareCall" ADD COLUMN IF NOT EXISTS "english_mirror_practice" "CareCallYesNo"`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "CareCall" ADD COLUMN IF NOT EXISTS "heavy_phone_tv" "CareCallYesNo"`
  );

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CareCall_student_id_called_at_idx" ON "CareCall"("student_id", "called_at")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CareCall_recorded_by_id_idx" ON "CareCall"("recorded_by_id")`
  );

  const fks = [
    `ALTER TABLE "CareCall" ADD CONSTRAINT "CareCall_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "CareCall" ADD CONSTRAINT "CareCall_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ];
  for (const sql of fks) {
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ${sql}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  }

  await recordMigration("20260915180000_care_calls");
  await recordMigration("20260915190000_care_calls_yes_no");
}

async function main() {
  await ensureTables();
  console.log("Care calls ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
