-- CreateEnum
CREATE TYPE "ClassroomAssessmentKind" AS ENUM ('MARKS', 'ORAL');

-- CreateTable
CREATE TABLE "ClassroomAssessmentSession" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "kind" "ClassroomAssessmentKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tested_level_id" TEXT,
    "scope_key" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomAssessmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomAssessmentEntry" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,
    "max_score" INTEGER,
    "percentage" DOUBLE PRECISION,
    "judged_level_id" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomAssessmentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomAssessmentSession_scope_unique" ON "ClassroomAssessmentSession"("class_id", "section_id", "subject_id", "kind", "date", "scope_key");

-- CreateIndex
CREATE INDEX "ClassroomAssessmentSession_date_idx" ON "ClassroomAssessmentSession"("date");

-- CreateIndex
CREATE INDEX "ClassroomAssessmentSession_class_id_section_id_idx" ON "ClassroomAssessmentSession"("class_id", "section_id");

-- CreateIndex
CREATE INDEX "ClassroomAssessmentSession_subject_id_kind_idx" ON "ClassroomAssessmentSession"("subject_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomAssessmentEntry_session_id_student_id_key" ON "ClassroomAssessmentEntry"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "ClassroomAssessmentEntry_student_id_idx" ON "ClassroomAssessmentEntry"("student_id");

-- CreateIndex
CREATE INDEX "ClassroomAssessmentEntry_judged_level_id_idx" ON "ClassroomAssessmentEntry"("judged_level_id");

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_tested_level_id_fkey" FOREIGN KEY ("tested_level_id") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentSession" ADD CONSTRAINT "ClassroomAssessmentSession_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentEntry" ADD CONSTRAINT "ClassroomAssessmentEntry_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassroomAssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentEntry" ADD CONSTRAINT "ClassroomAssessmentEntry_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomAssessmentEntry" ADD CONSTRAINT "ClassroomAssessmentEntry_judged_level_id_fkey" FOREIGN KEY ("judged_level_id") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;
