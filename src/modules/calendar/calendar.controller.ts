import { Controller, Get, Post, Put, Delete, Query, Body, Param } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('slots')
  getAvailableSlots(@Query('date') date: string, @Query('service') service?: string) {
    const dateObj = new Date(date);
    return this.calendarService.getAvailableSlots(dateObj, service);
  }

  @Post('sync')
  syncCalendar() {
    return this.calendarService.syncCalendar();
  }

  @Post('create-event')
  createEvent(@Body() booking: any) {
    return this.calendarService.createEvent(booking);
  }

  @Put('update-event/:id')
  updateEvent(@Param('id') eventId: string, @Body() booking: any) {
    return this.calendarService.updateEvent(eventId, booking);
  }

  @Delete('delete-event/:id')
  deleteEvent(@Param('id') eventId: string) {
    return this.calendarService.deleteEvent(eventId);
  }
}
