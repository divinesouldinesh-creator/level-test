-- CreateEnum
CREATE TYPE "CareCallFrequency" AS ENUM ('DAILY', 'SOMETIMES', 'NO');

-- CreateEnum
CREATE TYPE "CareCallExercise" AS ENUM ('REGULAR', 'SOMETIMES', 'NO');

-- CreateEnum
CREATE TYPE "CareCallPhoneTv" AS ENUM ('UNDER_1H', 'H1_2', 'H2_3', 'H3_PLUS');

-- CreateTable
CREATE TABLE "CareCall" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL,
    "daily_study" "CareCallFrequency",
    "english_mirror_practice" "CareCallFrequency",
    "exercise" "CareCallExercise",
    "phone_tv_usage" "CareCallPhoneTv",
    "parent_comment" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareCall_student_id_called_at_idx" ON "CareCall"("student_id", "called_at");

-- CreateIndex
CREATE INDEX "CareCall_recorded_by_id_idx" ON "CareCall"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "CareCall" ADD CONSTRAINT "CareCall_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareCall" ADD CONSTRAINT "CareCall_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
