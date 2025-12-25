import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

/**
 * Create a fresh booking from conversation data
 * Usage: 
 *   npx ts-node scripts/create-fresh-booking.ts [packageName] [date] [time]
 *   Example: npx ts-node scripts/create-fresh-booking.ts "Gold Package" "2025-12-20" "14:00"
 */
async function main() {
  // Extract arguments
  const packageName = process.argv[2] || null;
  const bookingDate = process.argv[3] || null;
  const bookingTime = process.argv[4] || null;

  // Conversation data from the provided log
  const phoneNumber = '+15556742404'; // +1 (555) 674-2404
  const customerName = 'Customer'; // Default name since not specified in conversation
  const whatsappId = phoneNumber.replace(/[^0-9]/g, ''); // Remove non-digits for WhatsApp ID

  // Conversation messages from the log
  const conversation: Array<{ timestamp: string; sender: string; content: string }> = [
    {
      timestamp: '2025-12-13T21:04:00',
      sender: 'customer',
      content: 'hello, lets create a new fresh booking',
    },
    {
      timestamp: '2025-12-13T21:04:00',
      sender: 'assistant',
      content: 'Thank you for contacting Fiesta House Maternity, Kenya\'s leading luxury photo studio specializing in maternity photography. We provide an all-inclusive experience in a world-class luxury studio, featuring world-class sets, professional makeup, and a curated selection of luxury gowns. We\'re here to ensure your maternity shoot is an elegant, memorable, and stress-free experience.',
    },
    {
      timestamp: '2025-12-13T21:04:00',
      sender: 'customer',
      content: 'what packages do you have?',
    },
    {
      timestamp: '2025-12-13T21:04:00',
      sender: 'assistant',
      content: 'Oh, my dear, I\'m so delighted to share our studio packages with you! Each one is thoughtfully crafted to beautifully capture this precious time in your life. Here they are:\n\n📦 Standard Package - KES 10000\n\n📦 Economy Package - KES 15000\n\n📦 Executive Package - KES 20000\n\n📦 Gold Package - KES 30000\n\n📦 Platinum Package - KES 35000\n\n📦 VIP Package - KES 45000\n\n📦 VVIP Package - KES 50000\n\nIf you\'d like to know more about any specific package, just ask! \n\n💡 Once you\'ve chosen a package, I can help you book your preferred date right away! 📅',
    },
    {
      timestamp: '2025-12-13T21:05:00',
      sender: 'assistant',
      content: 'Payment failed: Payment confirmation timed out (no callback received). Reply \'resend\' to try again, or contact us at 0720 111928 if the issue persists. 💖',
    },
  ];

  try {
    console.log('📥 Creating fresh booking from conversation...');
    console.log(`Customer Phone: ${phoneNumber}`);
    console.log(`WhatsApp ID: ${whatsappId}`);

    // Find or create customer
    let customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { whatsappId },
          { phone: phoneNumber },
          { phone: whatsappId },
        ],
      },
    });

    if (!customer) {
      console.log('Creating new customer...');
      customer = await prisma.customer.create({
        data: {
          name: customerName,
          phone: phoneNumber,
          whatsappId,
          email: `${whatsappId}@whatsapp.local`,
        },
      });
      console.log(`✅ Created customer: ${customer.id} (${customer.name})`);
    } else {
      console.log(`✅ Found existing customer: ${customer.id} (${customer.name})`);
    }

    // Import conversation messages
    console.log('\n📨 Importing conversation messages...');
    let messageCount = 0;
    const baseTimestamp = Date.now();
    for (const msg of conversation) {
      const direction = msg.sender === 'customer' ? 'inbound' : 'outbound';
      const externalId = `fresh_booking_${baseTimestamp}_${messageCount}`;

      // Check if message already exists
      const existing = await prisma.message.findUnique({
        where: { externalId },
      });

      if (!existing) {
        await prisma.message.create({
          data: {
            content: msg.content,
            platform: 'whatsapp',
            direction,
            customerId: customer.id,
            externalId,
            createdAt: new Date(msg.timestamp),
          },
        });
        messageCount++;
      }
    }
    console.log(`✅ Imported ${messageCount} messages`);

    // Get or validate package
    let selectedService = packageName;
    if (!selectedService) {
      const packages = await prisma.package.findMany({
        orderBy: { price: 'asc' },
      });
      if (packages.length === 0) {
        throw new Error('No packages found in database. Please seed packages first.');
      }
      // Use Gold Package as default (most popular)
      selectedService = packages.find(p => p.name === 'Gold Package')?.name || packages[0].name;
      console.log(`\n⚠️  No package specified. Using default: ${selectedService}`);
      console.log(`Available packages: ${packages.map(p => `${p.name} (KES ${p.price})`).join(', ')}`);
      console.log(`To specify a package, run: npx ts-node scripts/create-fresh-booking.ts "Package Name" [date] [time]`);
    } else {
      // Verify service exists
      const packageExists = await prisma.package.findUnique({
        where: { name: selectedService },
      });
      if (!packageExists) {
        const packages = await prisma.package.findMany();
        throw new Error(
          `Package "${selectedService}" not found. Available packages: ${packages.map(p => p.name).join(', ')}`
        );
      }
      console.log(`\n✅ Using package: ${selectedService}`);
    }

    // Get package info for duration
    const packageInfo = await prisma.package.findUnique({
      where: { name: selectedService },
    });

    if (!packageInfo) {
      throw new Error(`Package "${selectedService}" not found`);
    }

    // Handle date/time
    let bookingDateTime: Date;
    if (bookingDate && bookingTime) {
      // Create booking date/time in Africa/Nairobi timezone
      const STUDIO_TZ = 'Africa/Nairobi';
      const bookingDateTimeLocal = DateTime.fromISO(`${bookingDate}T${bookingTime}`, {
        zone: STUDIO_TZ,
      });
      
      if (!bookingDateTimeLocal.isValid) {
        throw new Error(`Invalid date/time: ${bookingDate} ${bookingTime}`);
      }
      
      // Convert to UTC for database storage
      bookingDateTime = new Date(bookingDateTimeLocal.toUTC().toISO());
      console.log(`\n📅 Booking date/time: ${bookingDateTimeLocal.toFormat('yyyy-MM-dd HH:mm')} (${STUDIO_TZ})`);
    } else {
      // Default to tomorrow at 2pm if not specified
      const STUDIO_TZ = 'Africa/Nairobi';
      const tomorrow = DateTime.now().setZone(STUDIO_TZ).plus({ days: 1 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
      bookingDateTime = new Date(tomorrow.toUTC().toISO());
      console.log(`\n⚠️  No date/time specified. Using default: ${tomorrow.toFormat('yyyy-MM-dd HH:mm')} (${STUDIO_TZ})`);
      console.log(`To specify date/time, run: npx ts-node scripts/create-fresh-booking.ts "${selectedService}" "2025-12-20" "14:00"`);
    }

    // Parse duration using same logic as BookingsService.parseDurationToMinutes
    function parseDurationToMinutes(duration: string | null | undefined): number {
      if (!duration) return 60; // default
      const hrMatch = duration.match(/(\d+)\s*hr/i);
      const minMatch = duration.match(/(\d+)\s*min/i);
      let mins = 0;
      if (hrMatch) mins += parseInt(hrMatch[1], 10) * 60;
      if (minMatch) mins += parseInt(minMatch[1], 10);
      return mins || 60; // default to 60 if parsing fails
    }
    
    const durationMinutes = parseDurationToMinutes(packageInfo.duration);

    // Check for conflicts
    const bookingStart = new Date(bookingDateTime);
    const bookingEnd = new Date(bookingDateTime.getTime() + durationMinutes * 60000);

    const conflicts = await prisma.booking.findMany({
      where: {
        status: 'confirmed',
        AND: [
          { dateTime: { gte: bookingStart } },
          { dateTime: { lt: bookingEnd } },
        ],
      },
    });

    if (conflicts.length > 0) {
      console.log(`\n⚠️  Warning: Found ${conflicts.length} conflicting booking(s) at this time.`);
      console.log('Creating booking with status: provisional (will need confirmation)...');
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        customerId: customer.id,
        service: selectedService,
        dateTime: bookingDateTime,
        status: 'provisional',
        durationMinutes,
      },
    });

    console.log(`\n✅ Fresh booking created successfully!`);
    console.log(`   Booking ID: ${booking.id}`);
    console.log(`   Customer: ${customer.name} (${customer.phone || customer.whatsappId})`);
    console.log(`   Service: ${selectedService} (KES ${packageInfo.price})`);
    console.log(`   Date/Time: ${DateTime.fromJSDate(bookingDateTime).setZone('Africa/Nairobi').toFormat('yyyy-MM-dd HH:mm')} (Africa/Nairobi)`);
    console.log(`   Duration: ${packageInfo.duration}`);
    console.log(`   Status: ${booking.status}`);
    console.log(`\n📋 Summary:`);
    console.log(`   Messages imported: ${messageCount}`);
    console.log(`   Booking created: ${booking.id}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   - The booking is in 'provisional' status`);
    console.log(`   - You may need to confirm the booking and process payment`);
    console.log(`   - Update customer name if needed: ${customer.id}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });




