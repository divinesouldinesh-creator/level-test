/**
 * Ensures office fee tables (family ledger, class structure, charges, payments).
 * Usage: npx tsx scripts/ensure-office-fees.ts
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260918120000_office_fees";

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
  CREATE TYPE "FeeChargeKind" AS ENUM ('MONTHLY', 'ANNUAL', 'ADMISSION', 'EXAM', 'OTHER', 'OPENING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "FeePaymentMode" AS ENUM ('CASH', 'UPI', 'BANK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "FeeAccount" (
    "id" TEXT NOT NULL,
    "parent_name" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeAccount_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "FeeAccountMember" (
    "id" TEXT NOT NULL,
    "fee_account_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "uses_transport" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeAccountMember_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "FeeStructure" (
    "id" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "tuition_amount" INTEGER NOT NULL DEFAULT 0,
    "transport_amount" INTEGER NOT NULL DEFAULT 0,
    "annual_amount" INTEGER NOT NULL DEFAULT 0,
    "admission_amount" INTEGER NOT NULL DEFAULT 0,
    "registration_amount" INTEGER NOT NULL DEFAULT 0,
    "exam_amount" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "FeeCharge" (
    "id" TEXT NOT NULL,
    "fee_account_id" TEXT NOT NULL,
    "kind" "FeeChargeKind" NOT NULL,
    "period_key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "detail_json" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeCharge_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "FeePayment" (
    "id" TEXT NOT NULL,
    "fee_account_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" "FeePaymentMode" NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "paid_on" TEXT NOT NULL,
    "note" TEXT,
    "recorded_against_student_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "FeeReceiptSeq" (
    "academic_year" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FeeReceiptSeq_pkey" PRIMARY KEY ("academic_year")
)`);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "FeeAccountMember_student_id_key" ON "FeeAccountMember"("student_id")`,
    `CREATE INDEX IF NOT EXISTS "FeeAccountMember_fee_account_id_idx" ON "FeeAccountMember"("fee_account_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "FeeStructure_academic_year_class_id_key" ON "FeeStructure"("academic_year", "class_id")`,
    `CREATE INDEX IF NOT EXISTS "FeeStructure_academic_year_idx" ON "FeeStructure"("academic_year")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "FeeCharge_fee_account_id_kind_period_key_key" ON "FeeCharge"("fee_account_id", "kind", "period_key")`,
    `CREATE INDEX IF NOT EXISTS "FeeCharge_fee_account_id_idx" ON "FeeCharge"("fee_account_id")`,
    `CREATE INDEX IF NOT EXISTS "FeeCharge_kind_period_key_idx" ON "FeeCharge"("kind", "period_key")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "FeePayment_receipt_no_key" ON "FeePayment"("receipt_no")`,
    `CREATE INDEX IF NOT EXISTS "FeePayment_fee_account_id_idx" ON "FeePayment"("fee_account_id")`,
    `CREATE INDEX IF NOT EXISTS "FeePayment_paid_on_idx" ON "FeePayment"("paid_on")`,
  ];
  for (const sql of indexes) {
    await prisma.$executeRawUnsafe(sql);
  }

  const fks = [
    `ALTER TABLE "FeeAccountMember" ADD CONSTRAINT "FeeAccountMember_fee_account_id_fkey" FOREIGN KEY ("fee_account_id") REFERENCES "FeeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "FeeAccountMember" ADD CONSTRAINT "FeeAccountMember_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "FeeCharge" ADD CONSTRAINT "FeeCharge_fee_account_id_fkey" FOREIGN KEY ("fee_account_id") REFERENCES "FeeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "FeeCharge" ADD CONSTRAINT "FeeCharge_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_fee_account_id_fkey" FOREIGN KEY ("fee_account_id") REFERENCES "FeeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_recorded_against_student_id_fkey" FOREIGN KEY ("recorded_against_student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ];
  for (const sql of fks) {
    await prisma.$executeRawUnsafe(`DO $$ BEGIN ${sql}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "FeeStructure" ADD COLUMN IF NOT EXISTS "registration_amount" INTEGER NOT NULL DEFAULT 0`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "FeeAccountMember" ADD COLUMN IF NOT EXISTS "transport_km" INTEGER NOT NULL DEFAULT 0`
  );
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "FeeYearSetting" (
    "academic_year" TEXT NOT NULL,
    "transport_rate_per_km" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeYearSetting_pkey" PRIMARY KEY ("academic_year")
)`);

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "FeeBillingMode" AS ENUM ('MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "FeeChargeKind" ADD VALUE IF NOT EXISTS 'YEARLY'`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "FeeChargeKind" ADD VALUE IF NOT EXISTS 'REGISTRATION'`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "billing_mode" "FeeBillingMode" NOT NULL DEFAULT 'MONTHLY'`
  );
  for (const column of [
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "monthly_discount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "annual_discount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "registration_discount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "admission_discount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "exam_discount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "waive_annual" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "waive_registration" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "waive_admission" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "waive_exam" BOOLEAN NOT NULL DEFAULT false`,
  ]) {
    await prisma.$executeRawUnsafe(column);
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "FeeAccount" ADD COLUMN IF NOT EXISTS "discount_effective_from" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "FeeAccountMember" ADD COLUMN IF NOT EXISTS "transport_rupees" INTEGER NOT NULL DEFAULT 0`
  );

  await recordMigration(MIGRATION_NAME);
  await recordMigration("20260929120000_fee_registration");
  await recordMigration("20260929123000_transport_per_km");
  await recordMigration("20260929140000_family_billing");
  await recordMigration("20260929150000_discount_effective_from");
  await recordMigration("20260929160000_transport_rupees");

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Bus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_no" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Bus_vehicle_no_key" ON "Bus"("vehicle_no")`);
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "DieselFill" (
    "id" TEXT NOT NULL,
    "bus_id" TEXT NOT NULL,
    "filled_on" TEXT NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DieselFill_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DieselFill_bus_id_filled_on_idx" ON "DieselFill"("bus_id", "filled_on")`
  );
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DieselFill_filled_on_idx" ON "DieselFill"("filled_on")`);
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "DieselFill" ADD CONSTRAINT "DieselFill_bus_id_fkey"
    FOREIGN KEY ("bus_id") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await recordMigration("20260929180000_bus_diesel");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "DieselFill" ADD COLUMN IF NOT EXISTS "odometer_km" INTEGER NOT NULL DEFAULT 0`
  );
  await recordMigration("20260929190000_diesel_odometer");
  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  CREATE TYPE "TransportUnitKind" AS ENUM ('BUS', 'GENERATOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Bus" ADD COLUMN IF NOT EXISTS "kind" "TransportUnitKind" NOT NULL DEFAULT 'BUS'`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE "DieselFill" ALTER COLUMN "odometer_km" DROP NOT NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "DieselFill" ALTER COLUMN "odometer_km" DROP DEFAULT`);
  await recordMigration("20260929200000_transport_generator");
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "DieselFill" ADD COLUMN IF NOT EXISTS "amount_rupees" INTEGER NOT NULL DEFAULT 0`
  );
  await recordMigration("20260929210000_diesel_amount");
  await prisma.$executeRawUnsafe(`ALTER TYPE "TransportUnitKind" ADD VALUE IF NOT EXISTS 'MAGIC'`);
  await recordMigration("20260929220000_transport_magic");
}

async function main() {
  await ensureTables();
  console.log("Office fees ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
