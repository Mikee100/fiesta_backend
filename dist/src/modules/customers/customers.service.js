"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
let CustomersService = class CustomersService {
    constructor(prisma, whatsappService) {
        this.prisma = prisma;
        this.whatsappService = whatsappService;
    }
    async create(data) {
        return this.prisma.customer.create({ data });
    }
    async sendPhotoLink(customerId, link) {
        const customer = await this.findOne(customerId);
        if (!customer) {
            throw new common_1.NotFoundException(`Customer with ID ${customerId} not found`);
        }
        if (!customer.whatsappId) {
            throw new common_1.NotFoundException(`Customer with ID ${customerId} does not have a WhatsApp ID.`);
        }
        await this.prisma.photoLink.create({
            data: {
                link,
                customerId,
            },
        });
        const message = `Hello! Here are the photos from your recent photoshoot: ${link}. We hope you love them!`;
        return this.whatsappService.sendMessage(customer.whatsappId, message);
    }
    async findByWhatsappId(whatsappId) {
        return this.prisma.customer.findUnique({
            where: { whatsappId },
        });
    }
    async findByInstagramId(instagramId) {
        return this.prisma.customer.findUnique({
            where: { instagramId },
        });
    }
    async findByMessengerId(messengerId) {
        return this.prisma.customer.findUnique({
            where: { messengerId },
        });
    }
    async findByEmail(email) {
        return this.prisma.customer.findUnique({
            where: { email },
        });
    }
    async findOne(id) {
        return this.prisma.customer.findUnique({
            where: { id },
            include: { messages: true, bookings: true },
        });
    }
    async findById(id) {
        return this.findOne(id);
    }
    async updatePhone(whatsappId, phone) {
        return this.prisma.customer.update({
            where: { whatsappId },
            data: { phone },
        });
    }
    async toggleAiEnabled(customerId, enabled) {
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
    async update(id, updateCustomerDto) {
        return this.prisma.customer.update({
            where: { id },
            data: updateCustomerDto,
        });
    }
    async remove(id) {
        return this.prisma.customer.delete({
            where: { id },
        });
    }
    async createWithMessengerId(messengerId) {
        return this.prisma.customer.create({
            data: {
                messengerId,
                name: `Messenger User ${messengerId}`,
                email: `${messengerId}@messenger.local`,
            },
        });
    }
    async updateLastInstagramMessageAt(instagramId, timestamp) {
        return this.prisma.customer.update({
            where: { instagramId },
            data: { lastInstagramMessageAt: timestamp },
        });
    }
    async updateLastMessengerMessageAt(messengerId, timestamp) {
        return this.prisma.customer.update({
            where: { messengerId },
            data: { lastMessengerMessageAt: timestamp },
        });
    }
    async getPhotoLinks(customerId) {
        return this.prisma.photoLink.findMany({
            where: { customerId },
            orderBy: { sentAt: 'desc' },
        });
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => whatsapp_service_1.WhatsappService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService])
], CustomersService);
//# sourceMappingURL=customers.service.js.map