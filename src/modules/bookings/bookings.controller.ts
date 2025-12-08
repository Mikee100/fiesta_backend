
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // Polling endpoint: check payment/booking status for a customerId
  @Get('status/:customerId')
  async getBookingStatus(@Param('customerId') customerId: string) {
    // Returns { status: 'pending' | 'confirmed' | 'none', booking?: any }
    // 1. Check for confirmed booking
    const booking = await this.bookingsService.getLatestConfirmedBooking(customerId);
    if (booking) {
      return { status: 'confirmed', booking };
    }
    // 2. Check for pending payment (draft exists, payment pending)
    const draft = await this.bookingsService.getBookingDraft(customerId);
    if (draft) {
      return { status: 'pending' };
    }
    // 3. No booking or draft
    return { status: 'none' };
  }

  @Post()
  create(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingsService.createBooking(createBookingDto.customerId, {
      message: createBookingDto.message,
      service: createBookingDto.service,
      dateTime: createBookingDto.dateTime ? new Date(createBookingDto.dateTime) : undefined,
      customerName: createBookingDto.customerName,
      recipientName: createBookingDto.recipientName,
      recipientPhone: createBookingDto.recipientPhone,
    });
  }

  @Get()
  async findAll() {
    return this.bookingsService.getBookings();
  }


  @Get('packages')
  getPackages() {
    return this.bookingsService.getPackages();
  }

  // Create a new package
  @Post('packages')
  createPackage(@Body() data: any) {
    return this.bookingsService.createPackage(data);
  }

  // Update a package
  @Put('packages/:id')
  updatePackage(@Param('id') id: string, @Body() data: any) {
    return this.bookingsService.updatePackage(id, data);
  }

  // Delete a package
  @Delete('packages/:id')
  deletePackage(@Param('id') id: string) {
    return this.bookingsService.deletePackage(id);
  }

  @Get('studio-info')
  getStudioInfo() {
    return this.bookingsService.getStudioInfo();
  }

  @Get(':customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.bookingsService.getBookings(customerId);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.bookingsService.confirmBooking(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.bookingsService.cancelBooking(id);
  }

  @Post('complete-draft/:customerId')
  completeDraft(@Param('customerId') customerId: string) {
    return this.bookingsService.completeBookingDraft(customerId);
  }

  // Get available and unavailable hours for a given date (and optional service)
  @Get('available-hours/:date')
  async getAvailableHours(
    @Param('date') date: string,
    @Query('service') service?: string
  ) {
    // Get all possible slots for the day
    const availableSlots = await this.bookingsService.getAvailableSlotsForDate(date, service);

    // Build all possible hours (9am to 5pm, every 30 min)
    const { DateTime } = require('luxon');
    const day = DateTime.fromISO(date, { zone: 'Africa/Nairobi' }).startOf('day');
    const hours = [];
    for (let h = 9; h < 17; h++) {
      hours.push(day.set({ hour: h, minute: 0 }).toISO());
      hours.push(day.set({ hour: h, minute: 30 }).toISO());
    }

    // Mark unavailable hours
    const availableSet = new Set(availableSlots.map(s => DateTime.fromISO(s).toISO()));
    const result = hours.map(time => ({
      time,
      available: availableSet.has(time)
    }));
    return result;
  }

    @Post('draft/:customerId')
  updateDraft(@Param('customerId') customerId: string, @Body() updates: any) {
    return this.bookingsService.updateBookingDraft(customerId, updates);
  }
}
