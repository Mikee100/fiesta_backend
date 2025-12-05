// Fix Instagram Duplicate Customers
// Merges duplicate customers and deletes the one with wrong ID

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDuplicates() {
  console.log('🔧 Fixing Instagram Duplicate Customers...\n');

  try {
    const BUSINESS_ACCOUNT_ID = '17841478614432206';
    const CORRECT_SENDER_ID = '2016354235886760';

    // Find the correct customer
    const correctCustomer = await prisma.customer.findUnique({
      where: { instagramId: CORRECT_SENDER_ID }
    });

    // Find the wrong customer
    const wrongCustomer = await prisma.customer.findUnique({
      where: { instagramId: BUSINESS_ACCOUNT_ID }
    });

    if (!correctCustomer) {
      console.log('❌ Correct customer not found!');
      return;
    }

    if (!wrongCustomer) {
      console.log('✅ No duplicate found - all good!');
      return;
    }

    console.log('Found duplicate customers:');
    console.log(`  ✅ Correct: ${correctCustomer.name} (ID: ${correctCustomer.id})`);
    console.log(`     Instagram ID: ${correctCustomer.instagramId}`);
    console.log(`  ❌ Wrong: ${wrongCustomer.name} (ID: ${wrongCustomer.id})`);
    console.log(`     Instagram ID: ${wrongCustomer.instagramId}\n`);

    // Move all messages from wrong customer to correct customer
    const movedMessages = await prisma.message.updateMany({
      where: { customerId: wrongCustomer.id },
      data: { customerId: correctCustomer.id }
    });

    console.log(`✅ Moved ${movedMessages.count} messages to correct customer`);

    // Move all bookings from wrong customer to correct customer
    const movedBookings = await prisma.booking.updateMany({
      where: { customerId: wrongCustomer.id },
      data: { customerId: correctCustomer.id }
    });

    console.log(`✅ Moved ${movedBookings.count} bookings to correct customer`);

    // Move all escalations from wrong customer to correct customer
    const movedEscalations = await prisma.escalation.updateMany({
      where: { customerId: wrongCustomer.id },
      data: { customerId: correctCustomer.id }
    });

    console.log(`✅ Moved ${movedEscalations.count} escalations to correct customer`);

    // Delete booking draft if exists
    try {
      await prisma.bookingDraft.delete({
        where: { customerId: wrongCustomer.id }
      });
      console.log(`✅ Deleted booking draft from wrong customer`);
    } catch (e) {
      // No draft to delete
    }

    // Delete the wrong customer
    await prisma.customer.delete({
      where: { id: wrongCustomer.id }
    });

    console.log(`✅ Deleted duplicate customer\n`);
    console.log('🎉 All done! Instagram messaging should work now!');
    console.log('\nTry sending an Instagram message to test it.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDuplicates();
