-- CreateTable
CREATE TABLE "SchoolBranding" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "school_name" TEXT NOT NULL DEFAULT 'Your School',
    "logo_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolBranding_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SchoolBranding" ("id", "school_name", "updated_at")
VALUES ('default', 'Your School', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
