-- CreateTable
CREATE TABLE "customer_session_notes" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sourceMessage" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_session_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_session_notes_customerId_idx" ON "customer_session_notes"("customerId");

-- CreateIndex
CREATE INDEX "customer_session_notes_bookingId_idx" ON "customer_session_notes"("bookingId");

-- CreateIndex
CREATE INDEX "customer_session_notes_status_idx" ON "customer_session_notes"("status");

-- AddForeignKey
ALTER TABLE "customer_session_notes" ADD CONSTRAINT "customer_session_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_session_notes" ADD CONSTRAINT "customer_session_notes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
