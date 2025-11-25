import { DateTime } from 'luxon';

// Studio timezone
const STUDIO_TZ = 'Africa/Nairobi';

/**
 * Normalize extracted date and time strings into a structured object.
 * Handles various formats and ensures consistency.
 */
export function normalizeExtractedDateTime(extracted: { date?: string; time?: string }): {
  dateObj: Date;
  isoDate: string;
  dateOnly: string;
  timeOnly: string;
} | null {
  const { date, time } = extracted;

  if (!date && !time) return null;

  // Combine date and time for parsing
  const combined = [date, time].filter(Boolean).join(' ');

  try {
    // Use chrono-node for flexible parsing
    const chrono = require('chrono-node');
    const parsed = chrono.parseDate(combined, new Date());

    if (!parsed) return null;

    // Convert to studio timezone
    const dt = DateTime.fromJSDate(parsed).setZone(STUDIO_TZ);

    return {
      dateObj: dt.toJSDate(),
      isoDate: dt.toUTC().toISO(),
      dateOnly: dt.toFormat('yyyy-MM-dd'),
      timeOnly: dt.toFormat('HH:mm'),
    };
  } catch (error) {
    console.warn('Failed to normalize date/time:', error);
    return null;
  }
}
