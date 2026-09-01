-- Migrate existing Late/Leave records before narrowing enum
UPDATE "AttendanceEntry" SET "status" = 'PRESENT' WHERE "status" = 'LATE';
UPDATE "AttendanceEntry" SET "status" = 'ABSENT' WHERE "status" = 'LEAVE';

-- Replace enum (PostgreSQL cannot drop enum values in place)
CREATE TYPE "AttendanceStatus_new" AS ENUM ('PRESENT', 'ABSENT');

ALTER TABLE "AttendanceEntry"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "AttendanceStatus_new"
    USING ("status"::text::"AttendanceStatus_new");

ALTER TABLE "AttendanceEntry"
  ALTER COLUMN "status" SET DEFAULT 'PRESENT';

DROP TYPE "AttendanceStatus";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
