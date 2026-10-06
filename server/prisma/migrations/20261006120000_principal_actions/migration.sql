-- CreateEnum
CREATE TYPE "SupportArea" AS ENUM ('SPEAKING', 'MATHS', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "PrincipalActionKind" AS ENUM ('SPOKE_TO_TEACHER', 'CALLED_PARENT', 'PARENT_MEETING', 'EXTRA_PRACTICE', 'ATTENDANCE_WARNING', 'RECHECK_SCHEDULED');

-- CreateEnum
CREATE TYPE "PrincipalActionOutcome" AS ENUM ('OPEN', 'IMPROVED', 'STILL_NEEDS_SUPPORT');

-- CreateTable
CREATE TABLE "SupportSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "speaking_max_level_order" INTEGER NOT NULL DEFAULT 0,
    "maths_below_pct" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "attendance_below_pct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "recheck_days" INTEGER NOT NULL DEFAULT 14,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalAction" (
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
);

-- CreateIndex
CREATE INDEX "PrincipalAction_student_id_area_created_at_idx" ON "PrincipalAction"("student_id", "area", "created_at");

-- CreateIndex
CREATE INDEX "PrincipalAction_recheck_on_idx" ON "PrincipalAction"("recheck_on");

-- CreateIndex
CREATE INDEX "PrincipalAction_recorded_by_id_idx" ON "PrincipalAction"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "PrincipalAction" ADD CONSTRAINT "PrincipalAction_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrincipalAction" ADD CONSTRAINT "PrincipalAction_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SupportSettings" ("id", "updated_at")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
