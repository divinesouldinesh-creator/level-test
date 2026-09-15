-- CreateEnum
CREATE TYPE "CareCallYesNo" AS ENUM ('YES', 'NO');

-- AlterTable
ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "daily_study";
ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "exercise";
ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "phone_tv_usage";
ALTER TABLE "CareCall" DROP COLUMN IF EXISTS "parent_comment";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CareCall' AND column_name = 'english_mirror_practice'
      AND udt_name = 'CareCallFrequency'
  ) THEN
    ALTER TABLE "CareCall" DROP COLUMN "english_mirror_practice";
  END IF;
END $$;

ALTER TABLE "CareCall" ADD COLUMN IF NOT EXISTS "english_mirror_practice" "CareCallYesNo";
ALTER TABLE "CareCall" ADD COLUMN IF NOT EXISTS "heavy_phone_tv" "CareCallYesNo";
