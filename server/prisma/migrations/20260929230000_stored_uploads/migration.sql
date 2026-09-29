CREATE TABLE IF NOT EXISTS "StoredUpload" (
    "path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredUpload_pkey" PRIMARY KEY ("path")
);
