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
exports.BookingsController = void 0;
const common_1 = require("@nestjs/common");
const bookings_service_1 = require("./bookings.service");
const create_booking_dto_1 = require("./dto/create-booking.dto");
let BookingsController = class BookingsController {
    constructor(bookingsService) {
        this.bookingsService = bookingsService;
    }
    async getBookingStatus(customerId) {
        const booking = await this.bookingsService.getLatestConfirmedBooking(customerId);
        if (booking) {
            return { status: 'confirmed', booking };
        }
        const draft = await this.bookingsService.getBookingDraft(customerId);
        if (draft) {
            return { status: 'pending' };
        }
        return { status: 'none' };
    }
    create(createBookingDto) {
        return this.bookingsService.createBooking(createBookingDto.customerId, {
            message: createBookingDto.message,
            service: createBookingDto.service,
            dateTime: createBookingDto.dateTime ? new Date(createBookingDto.dateTime) : undefined,
            customerName: createBookingDto.customerName,
            recipientName: createBookingDto.recipientName,
            recipientPhone: createBookingDto.recipientPhone,
        });
    }
    async findAll() {
        return this.bookingsService.getBookings();
    }
    getPackages() {
        return this.bookingsService.getPackages();
    }
    createPackage(data) {
        return this.bookingsService.createPackage(data);
    }
    updatePackage(id, data) {
        return this.bookingsService.updatePackage(id, data);
    }
    deletePackage(id) {
        return this.bookingsService.deletePackage(id);
    }
    getStudioInfo() {
        return this.bookingsService.getStudioInfo();
    }
    findByCustomer(customerId) {
        return this.bookingsService.getBookings(customerId);
    }
    confirm(id) {
        return this.bookingsService.confirmBooking(id);
    }
    cancel(id) {
        return this.bookingsService.cancelBooking(id);
    }
    completeDraft(customerId) {
        return this.bookingsService.completeBookingDraft(customerId);
    }
    async getAvailableHours(date, service) {
        const availableSlots = await this.bookingsService.getAvailableSlotsForDate(date, service);
        const { DateTime } = require('luxon');
        const day = DateTime.fromISO(date, { zone: 'Africa/Nairobi' }).startOf('day');
        const hours = [];
        for (let h = 9; h < 17; h++) {
            hours.push(day.set({ hour: h, minute: 0 }).toISO());
            hours.push(day.set({ hour: h, minute: 30 }).toISO());
        }
        const availableSet = new Set(availableSlots.map(s => DateTime.fromISO(s).toISO()));
        const result = hours.map(time => ({
            time,
            available: availableSet.has(time)
        }));
        return result;
    }
    updateDraft(customerId, updates) {
        return this.bookingsService.updateBookingDraft(customerId, updates);
    }
};
exports.BookingsController = BookingsController;
__decorate([
    (0, common_1.Get)('status/:customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BookingsController.prototype, "getBookingStatus", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_booking_dto_1.CreateBookingDto]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BookingsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('packages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "getPackages", null);
__decorate([
    (0, common_1.Post)('packages'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "createPackage", null);
__decorate([
    (0, common_1.Put)('packages/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "updatePackage", null);
__decorate([
    (0, common_1.Delete)('packages/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "deletePackage", null);
__decorate([
    (0, common_1.Get)('studio-info'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "getStudioInfo", null);
__decorate([
    (0, common_1.Get)(':customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "findByCustomer", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)('complete-draft/:customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "completeDraft", null);
__decorate([
    (0, common_1.Get)('available-hours/:date'),
    __param(0, (0, common_1.Param)('date')),
    __param(1, (0, common_1.Query)('service')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BookingsController.prototype, "getAvailableHours", null);
__decorate([
    (0, common_1.Post)('draft/:customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BookingsController.prototype, "updateDraft", null);
exports.BookingsController = BookingsController = __decorate([
    (0, common_1.Controller)('bookings'),
    __metadata("design:paramtypes", [bookings_service_1.BookingsService])
], BookingsController);
//# sourceMappingURL=bookings.controller.js.map