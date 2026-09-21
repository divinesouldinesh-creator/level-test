-- CreateEnum
CREATE TYPE "SaturdayHolidayRule" AS ENUM ('NONE', 'SECOND', 'ALL');

-- CreateEnum
CREATE TYPE "SchoolHolidayKind" AS ENUM ('EXTRA', 'WORKING');

-- CreateTable
CREATE TABLE "SchoolHolidaySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sundays_off" BOOLEAN NOT NULL DEFAULT true,
    "saturday_rule" "SaturdayHolidayRule" NOT NULL DEFAULT 'SECOND',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolHolidaySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolHolidayException" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "SchoolHolidayKind" NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolHolidayException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolHolidayException_date_key" ON "SchoolHolidayException"("date");
CREATE INDEX "SchoolHolidayException_date_idx" ON "SchoolHolidayException"("date");

INSERT INTO "SchoolHolidaySettings" ("id", "sundays_off", "saturday_rule", "updated_at")
VALUES ('default', true, 'SECOND', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
