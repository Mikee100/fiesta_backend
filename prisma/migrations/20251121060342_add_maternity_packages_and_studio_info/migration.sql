/*
  Warnings:

  - Added the required column `category` to the `knowledge_base` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "knowledge_base" ADD COLUMN     "category" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "duration" TEXT NOT NULL,
    "images" INTEGER NOT NULL,
    "makeup" BOOLEAN NOT NULL,
    "outfits" INTEGER NOT NULL,
    "styling" BOOLEAN NOT NULL,
    "photobook" BOOLEAN NOT NULL,
    "photobookSize" TEXT,
    "mount" BOOLEAN NOT NULL,
    "balloonBackdrop" BOOLEAN NOT NULL,
    "wig" BOOLEAN NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_info" (
    "id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_info_pkey" PRIMARY KEY ("id")
);
