/*
  Warnings:

  - A unique constraint covering the columns `[messengerId]` on the table `customers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "messengerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_messengerId_key" ON "customers"("messengerId");
