-- CreateTable
CREATE TABLE "AiPrediction" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input" TEXT NOT NULL,
    "prediction" TEXT NOT NULL,
    "actual" TEXT,
    "confidence" DOUBLE PRECISION,
    "responseTime" INTEGER NOT NULL,
    "error" TEXT,
    "userFeedback" INTEGER,
    "modelVersion" TEXT,

    CONSTRAINT "AiPrediction_pkey" PRIMARY KEY ("id")
);
