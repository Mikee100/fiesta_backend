-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_bookingDraftId_fkey";

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingDraftId_fkey" FOREIGN KEY ("bookingDraftId") REFERENCES "booking_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
