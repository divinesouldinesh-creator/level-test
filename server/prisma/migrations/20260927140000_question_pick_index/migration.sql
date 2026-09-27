CREATE INDEX IF NOT EXISTS "Level_order_idx" ON "Level" ("order");
CREATE INDEX IF NOT EXISTS "Question_topic_id_level_id_idx" ON "Question" ("topic_id", "level_id");
CREATE INDEX IF NOT EXISTS "StudentAnswer_question_id_idx" ON "StudentAnswer" ("question_id");
