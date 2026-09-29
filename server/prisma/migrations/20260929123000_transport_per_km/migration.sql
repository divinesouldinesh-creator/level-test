-- AlterTable
ALTER TABLE "FeeAccountMember" ADD COLUMN "transport_km" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FeeYearSetting" (
    "academic_year" TEXT NOT NULL,
    "transport_rate_per_km" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeYearSetting_pkey" PRIMARY KEY ("academic_year")
);
