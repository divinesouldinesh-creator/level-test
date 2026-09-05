/**
 * Ensures SubjectArea table + Maths/English defaults, assigns existing subjects.
 * Usage: npx tsx scripts/ensure-subject-areas.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isEnglish(name: string, code: string | null): boolean {
  const hay = `${name} ${code ?? ""}`.toLowerCase();
  return (
    /\benglish\b/.test(hay) ||
    /\beng\b/.test(hay) ||
    /\blanguage\b/.test(hay) ||
    /\bgrammar\b/.test(hay) ||
    /\breading\b/.test(hay)
  );
}

async function main() {
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "SubjectArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SubjectArea_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "SubjectArea_name_key" ON "SubjectArea"("name")`
  );

  // Add column if missing
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "Subject" ADD COLUMN "area_id" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Subject_area_id_idx" ON "Subject"("area_id")`
  );

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "Subject" ADD CONSTRAINT "Subject_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "SubjectArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  const maths = await prisma.subjectArea.upsert({
    where: { name: "Maths" },
    create: { id: "area-maths", name: "Maths", code: "MATHS", sortOrder: 0 },
    update: { code: "MATHS", sortOrder: 0 },
  });
  const english = await prisma.subjectArea.upsert({
    where: { name: "English" },
    create: { id: "area-english", name: "English", code: "ENG", sortOrder: 1 },
    update: { code: "ENG", sortOrder: 1 },
  });

  const subjects = await prisma.subject.findMany({ select: { id: true, name: true, code: true, areaId: true } });
  for (const s of subjects) {
    if (s.areaId) continue;
    const areaId = isEnglish(s.name, s.code) ? english.id : maths.id;
    await prisma.subject.update({ where: { id: s.id }, data: { areaId } });
  }

  const migrationName = "20260904100000_subject_areas";
  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length === 0) {
    const sqlPath = path.join(__dirname, "../prisma/migrations/20260904100000_subject_areas/migration.sql");
    const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
    `;
    console.log("Recorded migration:", migrationName);
  }

  console.log("Subject areas ready. Maths:", maths.id, "English:", english.id, "Subjects:", subjects.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
