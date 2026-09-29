-- CreateEnum
CREATE TYPE "FeeBillingMode" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterEnum
ALTER TYPE "FeeChargeKind" ADD VALUE 'YEARLY';
ALTER TYPE "FeeChargeKind" ADD VALUE 'REGISTRATION';

-- AlterTable
ALTER TABLE "FeeAccount" ADD COLUMN "billing_mode" "FeeBillingMode" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "FeeAccount" ADD COLUMN "monthly_discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeeAccount" ADD COLUMN "annual_discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeeAccount" ADD COLUMN "registration_discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeeAccount" ADD COLUMN "admission_discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeeAccount" ADD COLUMN "exam_discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeeAccount" ADD COLUMN "waive_annual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FeeAccount" ADD COLUMN "waive_registration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FeeAccount" ADD COLUMN "waive_admission" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FeeAccount" ADD COLUMN "waive_exam" BOOLEAN NOT NULL DEFAULT false;
