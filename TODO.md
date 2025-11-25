# TODO: Update AI Social Media System for Maternity Photoshop Business

## Tasks
- [ ] Update timezone references from "salonTz" to "studioTz" in ai.service.ts, bookings.service.ts, message-queue.processor.ts, utils/booking.ts
- [ ] Change extractor prompt in ai.service.ts to "maternity photoshoot bookings"
- [ ] Enhance AI prompts for more emotional, human-friendly language, increase temperature for dynamism
- [ ] Replace hardcoded salon services in message-queue.processor.ts with dynamic package fetching and listing
- [ ] Update any remaining salon references to maternity/studio

## Followup Steps
- [ ] Run database migrations if needed
- [ ] Test the AI responses for emotional tone and dynamic behavior
- [ ] Verify package listing works correctly
