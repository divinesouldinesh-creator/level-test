-- CreateIndex
CREATE INDEX "Student_class_id_section_id_idx" ON "Student"("class_id", "section_id");

-- CreateIndex
CREATE INDEX "Test_student_id_status_completed_at_idx" ON "Test"("student_id", "status", "completed_at");

-- CreateIndex
CREATE INDEX "Test_started_at_idx" ON "Test"("started_at");

-- CreateIndex
CREATE INDEX "Test_subject_id_level_id_idx" ON "Test"("subject_id", "level_id");
