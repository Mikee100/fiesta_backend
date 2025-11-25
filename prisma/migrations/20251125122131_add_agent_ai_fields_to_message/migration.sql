-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "handledBy" TEXT,
ADD COLUMN     "isEscalated" BOOLEAN,
ADD COLUMN     "isResolved" BOOLEAN;
