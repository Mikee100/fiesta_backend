import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

interface ConversationMessage {
  timestamp: string;
  sender: string;
  content: string;
}

/**
 * Import conversation and create booking
 * Usage: npx ts-node scripts/import-conversation-booking.ts [serviceName]
 */
async function main() {
  const serviceName = process.argv[2] || null; // Optional service name argument

  // Conversation data
  const phoneNumber = '+15556742404'; // +1 (555) 674-2404
  const customerName = 'Joyce';
  const bookingDate = '2025-12-15';
  const bookingTime = '12:00'; // 12pm
  const whatsappId = phoneNumber.replace(/[^0-9]/g, ''); // Remove non-digits for WhatsApp ID

  const conversation: ConversationMessage[] = [
    {
      timestamp: '2025-09-12T13:05:00',
      sender: 'customer',
      content: 'i want to book that one',
    },
    {
      timestamp: '2025-09-12T13:05:00',
      sender: 'assistant',
      content: "Wonderful choice, Jpyce! Now, let's find the perfect date for your photoshoot. When were you thinking of having it? Just let me know a date that works for you! 🌸",
    },
    {
      timestamp: '2025-09-12T13:05:00',
      sender: 'customer',
      content: '15th',
    },
    {
      timestamp: '2025-09-12T13:05:00',
      sender: 'assistant',
      content: "Perfect! We've got the date set for December 15th, 2025. Now, could you please let me know what time works best for you on that day? We have slots available in the morning (9am-12pm) and the afternoon (2pm-5pm). 😊",
    },
    {
      timestamp: '2025-09-12T13:05:00',
      sender: 'customer',
      content: '12pm',
    },
    {
      timestamp: '2025-09-12T13:05:00',
      sender: 'assistant',
      content: "Now, could you kindly share your name with me? It's so important to have everything perfect for you. 😊",
    },
    {
      timestamp: '2025-09-12T13:06:00',
      sender: 'customer',
      content: 'Joyce',
    },
  ];

  try {
    console.log('📥 Importing conversation and creating booking...');
    console.log(`Customer: ${customerName}`);
    console.log(`Phone: ${phoneNumber}`);
    console.log(`Date: ${bookingDate} at ${bookingTime}`);

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
      console.log(`✅ Created customer: ${customer.id}`);
    } else {
      // Update customer name if different
      if (customer.name !== customerName) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { name: customerName },
        });
        console.log(`✅ Updated customer name to: ${customerName}`);
      }
      console.log(`✅ Found existing customer: ${customer.id}`);
    }

    // Import conversation messages
    console.log('\n📨 Importing conversation messages...');
    let messageCount = 0;
    const baseTimestamp = Date.now();
    for (const msg of conversation) {
      const direction = msg.sender === 'customer' ? 'inbound' : 'outbound';
      const externalId = `import_${baseTimestamp}_${messageCount}`;

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

    // Get available packages if service name not provided
    let selectedService = serviceName;
    if (!selectedService) {
      const packages = await prisma.package.findMany();
      if (packages.length === 0) {
        throw new Error('No packages found in database. Please seed packages first or specify a service name.');
      }
      // Use first package as default
      selectedService = packages[0].name;
      console.log(`\n⚠️  No service specified. Using default: ${selectedService}`);
      console.log(`Available packages: ${packages.map(p => p.name).join(', ')}`);
      console.log(`To specify a different service, run: npx ts-node scripts/import-conversation-booking.ts "Package Name"`);
    } else {
      // Verify service exists
      const packageExists = await prisma.package.findUnique({
        where: { name: selectedService },
      });
      if (!packageExists) {
        const packages = await prisma.package.findMany();
        throw new Error(
          `Service "${selectedService}" not found. Available packages: ${packages.map(p => p.name).join(', ')}`
        );
      }
      console.log(`\n✅ Using service: ${selectedService}`);
    }

    // Create booking date/time in Africa/Nairobi timezone
    const STUDIO_TZ = 'Africa/Nairobi';
    const bookingDateTimeLocal = DateTime.fromISO(`${bookingDate}T${bookingTime}`, {
      zone: STUDIO_TZ,
    });
    
    if (!bookingDateTimeLocal.isValid) {
      throw new Error(`Invalid date/time: ${bookingDate} ${bookingTime}`);
    }
    
    // Convert to UTC for database storage (as per bookings.service.ts pattern)
    const bookingDateTime = new Date(bookingDateTimeLocal.toUTC().toISO());

    // Check for conflicts
    const packageInfo = await prisma.package.findUnique({
      where: { name: selectedService },
    });

    if (!packageInfo) {
      throw new Error(`Package "${selectedService}" not found`);
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
      console.log('Creating booking anyway (status: provisional)...');
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

    console.log(`\n✅ Booking created successfully!`);
    console.log(`   Booking ID: ${booking.id}`);
    console.log(`   Service: ${selectedService}`);
    console.log(`   Date/Time: ${bookingDateTime.toLocaleString()}`);
    console.log(`   Status: ${booking.status}`);
    console.log(`\n📋 Summary:`);
    console.log(`   Customer: ${customerName} (${phoneNumber})`);
    console.log(`   Booking: ${selectedService} on ${bookingDate} at ${bookingTime}`);
    console.log(`   Messages imported: ${messageCount}`);

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

