import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WhatsappService)) private whatsappService: WhatsappService,
  ) { }

  async create(data: any) {
    return this.prisma.customer.create({ data });
  }

  async sendPhotoLink(customerId: string, link: string) {
    const customer = await this.findOne(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    if (!customer.whatsappId) {
      throw new NotFoundException(
        `Customer with ID ${customerId} does not have a WhatsApp ID.`,
      );
    }

    // Save the photo link
    await this.prisma.photoLink.create({
      data: {
        link,
        customerId,
      },
    });

    const message = `Hello! Here are the photos from your recent photoshoot: ${link}. We hope you love them!`;

    return this.whatsappService.sendMessage(customer.whatsappId, message);
  }

  async findByWhatsappId(whatsappId: string) {
    return this.prisma.customer.findUnique({
      where: { whatsappId },
    });
  }

  async findByInstagramId(instagramId: string) {
    return this.prisma.customer.findUnique({
      where: { instagramId },
    });
  }

  async findByMessengerId(messengerId: string) {
    return this.prisma.customer.findUnique({
      where: { messengerId },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.customer.findUnique({
      where: { email },
    });
  }

  async findOne(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: { messages: true, bookings: true },
    });
  }

  async findById(id: string) {
    return this.findOne(id);
  }

  async updatePhone(whatsappId: string, phone: string) {
    return this.prisma.customer.update({
      where: { whatsappId },
      data: { phone },
    });
  }

  async toggleAiEnabled(customerId: string, enabled: boolean) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { aiEnabled: enabled },
    });
  }

  async getAll() {
    return this.prisma.customer.findMany({
      include: { messages: true, bookings: true },
    });
  }

  async findAll() {
    return this.getAll();
  }

  async update(id: string, updateCustomerDto: Partial<any>) {
    return this.prisma.customer.update({
      where: { id },
      data: updateCustomerDto,
    });
  }

  async remove(id: string) {
    return this.prisma.customer.delete({
      where: { id },
    });
  }

  async createWithMessengerId(messengerId: string) {
    return this.prisma.customer.create({
      data: {
        messengerId,
        name: `Messenger User ${messengerId}`,
        email: `${messengerId}@messenger.local`, // Placeholder email
      },
    });
  }

  async updateLastInstagramMessageAt(instagramId: string, timestamp: Date) {
    return this.prisma.customer.update({
      where: { instagramId },
      data: { lastInstagramMessageAt: timestamp },
    });
  }

  async updateLastMessengerMessageAt(messengerId: string, timestamp: Date) {
    return this.prisma.customer.update({
      where: { messengerId },
      data: { lastMessengerMessageAt: timestamp },
    });
  }

  async getPhotoLinks(customerId: string) {
    return this.prisma.photoLink.findMany({
      where: { customerId },
      orderBy: { sentAt: 'desc' },
    });
  }
}
