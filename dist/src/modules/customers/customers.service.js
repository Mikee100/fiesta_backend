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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let CustomersService = class CustomersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(data) {
        return this.prisma.customer.create({ data });
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
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CustomersService);
//# sourceMappingURL=customers.service.js.map