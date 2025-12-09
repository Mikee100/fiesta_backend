import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCustomerDto: Partial<CreateCustomerDto>) {
    return this.customersService.update(id, updateCustomerDto);
  }

  @Post(':id/send-photo-link')
  sendPhotoLink(@Param('id') id: string, @Body('link') link: string) {
    return this.customersService.sendPhotoLink(id, link);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Patch(':id/toggle-ai')
  toggleAi(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    return this.customersService.toggleAiEnabled(id, enabled);
  }

  @Get(':id/photo-links')
  getPhotoLinks(@Param('id') id: string) {
    return this.customersService.getPhotoLinks(id);
  }

  @Get(':id/session-notes')
  getSessionNotes(@Param('id') id: string) {
    return this.customersService.getSessionNotes(id);
  }

  @Patch('session-notes/:noteId')
  updateSessionNote(@Param('noteId') noteId: string, @Body() data: { status?: string; adminNotes?: string; reviewedBy?: string }) {
    return this.customersService.updateSessionNote(noteId, data);
  }
}
