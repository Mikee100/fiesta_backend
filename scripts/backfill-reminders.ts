import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();
const STUDIO_TZ = 'Africa/Nairobi';

/**
 * Backfill reminders for existing confirmed bookings
 * This script schedules reminders for all confirmed bookings that don't have reminders yet
 * 
 * Usage: 
 *   npx ts-node scripts/backfill-reminders.ts
 * 
 * Options:
 *   --dry-run    Show what would be scheduled without actually scheduling
 *   --force     Schedule reminders even if the reminder time has passed
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  console.log('🔍 Finding confirmed bookings without reminders...\n');

  // Find all confirmed bookings
  const confirmedBookings = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
    },
    include: {
      customer: true,
      reminders: true,
    },
    orderBy: {
      dateTime: 'asc',
    },
  });

  console.log(`Found ${confirmedBookings.length} confirmed bookings\n`);

  // Filter bookings that don't have reminders or have incomplete reminders
  const bookingsNeedingReminders = confirmedBookings.filter((booking) => {
    const has48hr = booking.reminders.some((r) => r.type === '48hr');
    const has24hr = booking.reminders.some((r) => r.type === '24hr');
    return !has48hr || !has24hr;
  });

  console.log(`${bookingsNeedingReminders.length} bookings need reminders scheduled\n`);

  if (bookingsNeedingReminders.length === 0) {
    console.log('✅ All bookings already have reminders scheduled!');
    await prisma.$disconnect();
    return;
  }

  // Initialize Bull queue (using Redis URL from env or default)
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const Queue = require('bull');
  const remindersQueue = new Queue('remindersQueue', redisUrl);

  let scheduled = 0;
  let skipped = 0;
  let errors = 0;

  for (const booking of bookingsNeedingReminders) {
    try {
      const bookingDateTime = DateTime.fromJSDate(booking.dateTime).setZone(STUDIO_TZ);
      const now = DateTime.now().setZone(STUDIO_TZ);

      // Calculate reminder times
      const reminder48hr = bookingDateTime.minus({ hours: 48 });
      const reminder24hr = bookingDateTime.minus({ hours: 24 });

      const remindersToSchedule: Array<{ type: string; scheduledFor: DateTime }> = [];

      // Check if 48hr reminder is needed and valid
      const has48hr = booking.reminders.some((r) => r.type === '48hr');
      if (!has48hr) {
        if (reminder48hr > now || force) {
          remindersToSchedule.push({ type: '48hr', scheduledFor: reminder48hr });
        }
      }

      // Check if 24hr reminder is needed and valid
      const has24hr = booking.reminders.some((r) => r.type === '24hr');
      if (!has24hr) {
        if (reminder24hr > now || force) {
          remindersToSchedule.push({ type: '24hr', scheduledFor: reminder24hr });
        }
      }

      if (remindersToSchedule.length === 0) {
        const bookingDateStr = bookingDateTime.toFormat('LLL dd, yyyy HH:mm');
        console.log(`⏭️  Skipping booking ${booking.id} (${bookingDateStr}) - reminder times have passed`);
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`\n📅 Booking: ${booking.id}`);
        console.log(`   Service: ${booking.service}`);
        console.log(`   Date: ${bookingDateTime.toFormat('LLL dd, yyyy HH:mm')}`);
        console.log(`   Customer: ${booking.customer.name}`);
        remindersToSchedule.forEach((r) => {
          const status = r.scheduledFor > now ? '✅ Will schedule' : '⚠️  Past time (would skip)';
          console.log(`   ${r.type} reminder: ${r.scheduledFor.toFormat('LLL dd, yyyy HH:mm')} ${status}`);
        });
        scheduled += remindersToSchedule.length;
        continue;
      }

      // Create reminder records and queue jobs
      for (const reminder of remindersToSchedule) {
        // Skip if time has passed (unless force is used)
        if (reminder.scheduledFor <= now && !force) {
          continue;
        }

        // Create reminder record
        const reminderRecord = await prisma.bookingReminder.create({
          data: {
            bookingId: booking.id,
            type: reminder.type,
            scheduledFor: reminder.scheduledFor.toJSDate(),
            status: 'pending',
          },
        });

        // Calculate delay in milliseconds
        const delay = Math.max(0, reminder.scheduledFor.diff(now).milliseconds);

        // Queue the job
        await remindersQueue.add(
          'send-reminder',
          { reminderId: reminderRecord.id },
          { delay },
        );

        const reminderTimeStr = reminder.scheduledFor.toFormat('LLL dd, yyyy HH:mm');
        const bookingTimeStr = bookingDateTime.toFormat('LLL dd, yyyy HH:mm');
        console.log(
          `✅ Scheduled ${reminder.type} reminder for booking ${booking.id} (${bookingTimeStr}) - will send at ${reminderTimeStr}`,
        );
      }

      scheduled += remindersToSchedule.length;
    } catch (error) {
      console.error(`❌ Error processing booking ${booking.id}:`, error);
      errors++;
    }
  }

  // Close queue connection
  await remindersQueue.close();

  console.log('\n📊 Summary:');
  console.log(`   Scheduled: ${scheduled} reminders`);
  console.log(`   Skipped: ${skipped} bookings (reminder times passed)`);
  console.log(`   Errors: ${errors} bookings`);

  if (dryRun) {
    console.log('\n⚠️  This was a dry run. Use without --dry-run to actually schedule reminders.');
  } else {
    console.log('\n✅ Backfill complete!');
  }

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });



