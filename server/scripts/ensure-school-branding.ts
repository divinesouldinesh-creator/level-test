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
CREATE TABLE IF NOT EXISTS "SchoolBranding" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "school_name" TEXT NOT NULL DEFAULT 'Your School',
    "logo_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolBranding_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
INSERT INTO "SchoolBranding" ("id", "school_name", "updated_at")
VALUES ('default', 'Your School', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING`);

  const migrationName = "20260901150000_school_branding";
  const existing = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${migrationName}
  `;
  if (existing.length === 0) {
    const sqlPath = path.join(__dirname, "../prisma/migrations/20260901150000_school_branding/migration.sql");
    const checksum = createHash("sha256").update(fs.readFileSync(sqlPath, "utf8")).digest("hex");
    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (${id}, ${checksum}, ${now}, ${migrationName}, NULL, NULL, ${now}, 1)
    `;
    console.log("Recorded migration:", migrationName);
  }

  const rows = await prisma.$queryRaw<{ id: string; school_name: string }[]>`
    SELECT id, school_name FROM "SchoolBranding"
  `;
  console.log("SchoolBranding table ready:", rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
