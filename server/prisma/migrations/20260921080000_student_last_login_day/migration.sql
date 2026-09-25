-- AlterTable
ALTER TABLE "StudentEngagement" ADD COLUMN IF NOT EXISTS "last_login_day" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentEngagement_last_login_day_idx" ON "StudentEngagement"("last_login_day");
