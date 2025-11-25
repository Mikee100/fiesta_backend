-- CreateTable
CREATE TABLE "ai_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);
