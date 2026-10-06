/**
 * Ensures principal support tables when `prisma migrate deploy` cannot run.
 * Usage: npx tsx scripts/ensure-principal-actions.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationName = "20261006120000_principal_actions";

async function main() {
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "SupportArea" AS ENUM ('SPEAKING', 'MATHS', 'ATTENDANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "PrincipalActionKind" AS ENUM ('SPOKE_TO_TEACHER', 'CALLED_PARENT', 'PARENT_MEETING', 'EXTRA_PRACTICE', 'ATTENDANCE_WARNING', 'RECHECK_SCHEDULED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "PrincipalActionOutcome" AS ENUM ('OPEN', 'IMPROVED', 'STILL_NEEDS_SUPPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SupportSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "speaking_max_level_order" INTEGER NOT NULL DEFAULT 0,
    "maths_below_pct" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "attendance_below_pct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "recheck_days" INTEGER NOT NULL DEFAULT 14,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportSettings_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "PrincipalAction" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "area" "SupportArea" NOT NULL,
    "action_kind" "PrincipalActionKind" NOT NULL,
    "note" TEXT,
    "snapshot_label" TEXT NOT NULL,
    "snapshot_value" DOUBLE PRECISION,
    "snapshot_date" TIMESTAMP(3),
    "recheck_on" TIMESTAMP(3) NOT NULL,
    "outcome" "PrincipalActionOutcome" NOT NULL DEFAULT 'OPEN',
    "outcome_note" TEXT,
    "outcome_value" DOUBLE PRECISION,
    "outcome_label" TEXT,
    "outcome_recorded_at" TIMESTAMP(3),
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrincipalAction_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "PrincipalAction_student_id_area_created_at_idx" ON "PrincipalAction"("student_id", "area", "created_at")`);
  await prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "PrincipalAction_recheck_on_idx" ON "PrincipalAction"("recheck_on")`);
  await prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "PrincipalAction_recorded_by_id_idx" ON "PrincipalAction"("recorded_by_id")`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "PrincipalAction" ADD CONSTRAINT "PrincipalAction_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "PrincipalAction" ADD CONSTRAINT "PrincipalAction_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
INSERT INTO "SupportSettings" ("id", "updated_at")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING`);

  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length === 0) {
    const sqlPath = path.join(__dirname, `../prisma/migrations/${migrationName}/migration.sql`);
    const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
    `;
    console.log("Recorded migration:", migrationName);
  }
  console.log("Principal action tables ready");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
