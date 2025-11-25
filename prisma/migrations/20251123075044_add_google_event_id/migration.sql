/*
  Warnings:

  - A unique constraint covering the columns `[googleEventId]` on the table `bookings` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "googleEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_googleEventId_key" ON "bookings"("googleEventId");
