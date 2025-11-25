"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeExtractedDateTime = normalizeExtractedDateTime;
const luxon_1 = require("luxon");
const STUDIO_TZ = 'Africa/Nairobi';
function normalizeExtractedDateTime(extracted) {
    const { date, time } = extracted;
    if (!date && !time)
        return null;
    const combined = [date, time].filter(Boolean).join(' ');
    try {
        const chrono = require('chrono-node');
        const parsed = chrono.parseDate(combined, new Date());
        if (!parsed)
            return null;
        const dt = luxon_1.DateTime.fromJSDate(parsed).setZone(STUDIO_TZ);
        return {
            dateObj: dt.toJSDate(),
            isoDate: dt.toUTC().toISO(),
            dateOnly: dt.toFormat('yyyy-MM-dd'),
            timeOnly: dt.toFormat('HH:mm'),
        };
    }
    catch (error) {
        console.warn('Failed to normalize date/time:', error);
        return null;
    }
}
//# sourceMappingURL=booking.js.map