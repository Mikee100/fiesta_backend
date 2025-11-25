-- AlterTable
ALTER TABLE "booking_drafts" ADD COLUMN     "dateTimeIso" TEXT,
ALTER COLUMN "date" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "durationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;
