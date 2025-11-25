import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

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
}
