"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const calendar_service_1 = require("./src/modules/calendar/calendar.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
async function testCalendar() {
    const prisma = new prisma_service_1.PrismaService();
    const calendarService = new calendar_service_1.CalendarService(prisma);
    console.log('Testing Google Calendar connection...');
    console.log('Calendar ID:', process.env.GOOGLE_CALENDAR_ID);
    try {
        const events = await calendarService.getEvents();
        console.log('✅ Successfully connected to Google Calendar');
        console.log(`Found ${events.length} events`);
        const testBooking = {
            customer: {
                name: 'Test User',
                phone: '0700000000'
            },
            service: 'Test Service',
            dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            durationMinutes: 60,
            recipientName: 'Test User',
            recipientPhone: '0700000000'
        };
        const eventId = await calendarService.createEvent(testBooking);
        console.log('✅ Successfully created test event:', eventId);
        await calendarService.deleteEvent(eventId);
        console.log('✅ Successfully deleted test event');
        console.log('\n🎉 Google Calendar is working correctly!');
    }
    catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('404')) {
            console.error('\n⚠️  Calendar not found. Make sure:');
            console.error('1. Calendar ID is correct');
            console.error('2. Calendar is shared with:', process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY).client_email : 'service account');
        }
        else if (error.message.includes('403')) {
            console.error('\n⚠️  Permission denied. Make sure:');
            console.error('1. Calendar is shared with the service account');
            console.error('2. Permission is set to "Make changes to events"');
        }
    }
    await prisma.$disconnect();
}
testCalendar();
//# sourceMappingURL=test-calendar.js.map