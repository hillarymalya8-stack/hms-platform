-- CreateTable
CREATE TABLE "system_secrets" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_secrets_pkey" PRIMARY KEY ("key")
);
