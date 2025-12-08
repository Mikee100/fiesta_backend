"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const messages_service_1 = require("../src/modules/messages/messages.service");
const bookingExamples = [
    'I want to schedule an appointment',
    'Can I book a session?',
    "I'd like to reserve a slot for next week.",
    'Help me book an appointment',
    'Need to make a booking',
    'Can I get an appointment tomorrow?',
    'Set up an appointment for me',
    'Make a booking for Friday',
    'Can I come for a session?',
    'I want to book',
];
console.log('--- Booking Inquiry Test Cases ---');
for (const example of bookingExamples) {
    const intent = messages_service_1.MessagesService.classifyIntentSimple(example);
    console.log(`Input: "${example}" => Classified as: ${intent}`);
}
//# sourceMappingURL=test-intent-classification.js.map