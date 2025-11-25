-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "deposit" INTEGER NOT NULL DEFAULT 2000;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "bookingDraftId" TEXT,
    "amount" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mpesaReceipt" TEXT,
    "checkoutRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_bookingDraftId_key" ON "payments"("bookingDraftId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingDraftId_fkey" FOREIGN KEY ("bookingDraftId") REFERENCES "booking_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
