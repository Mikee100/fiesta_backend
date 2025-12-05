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
exports.InvoicesController = void 0;
const common_1 = require("@nestjs/common");
const invoices_service_1 = require("./invoices.service");
let InvoicesController = class InvoicesController {
    constructor(invoicesService) {
        this.invoicesService = invoicesService;
    }
    async generateInvoice(bookingId) {
        return this.invoicesService.generateInvoice(bookingId);
    }
    async sendInvoice(invoiceId) {
        await this.invoicesService.sendInvoiceToCustomer(invoiceId);
        return { message: 'Invoice sent successfully' };
    }
    async getInvoicesByBooking(bookingId) {
        return this.invoicesService.getInvoicesByBooking(bookingId);
    }
    async getInvoicesByCustomer(customerId) {
        return this.invoicesService.getInvoicesByCustomer(customerId);
    }
    async getAllInvoices() {
        return this.invoicesService.getAllInvoices();
    }
    async downloadInvoice(invoiceId, res) {
        let invoice = await this.invoicesService.getInvoiceById(invoiceId);
        if (!invoice) {
            return res.status(404).send('Invoice not found');
        }
        if (!invoice.pdfData) {
            try {
                invoice = await this.invoicesService.generateInvoice(invoice.bookingId);
                if (!invoice.pdfData) {
                    return res.status(500).send('Failed to generate invoice PDF');
                }
            }
            catch (error) {
                return res.status(500).send('Failed to generate invoice PDF');
            }
        }
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
            'Content-Length': invoice.pdfData.length.toString(),
        });
        res.send(invoice.pdfData);
    }
};
exports.InvoicesController = InvoicesController;
__decorate([
    (0, common_1.Post)('generate/:bookingId'),
    __param(0, (0, common_1.Param)('bookingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "generateInvoice", null);
__decorate([
    (0, common_1.Post)('send/:invoiceId'),
    __param(0, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "sendInvoice", null);
__decorate([
    (0, common_1.Get)('booking/:bookingId'),
    __param(0, (0, common_1.Param)('bookingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "getInvoicesByBooking", null);
__decorate([
    (0, common_1.Get)('customer/:customerId'),
    __param(0, (0, common_1.Param)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "getInvoicesByCustomer", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "getAllInvoices", null);
__decorate([
    (0, common_1.Get)('download/:invoiceId'),
    __param(0, (0, common_1.Param)('invoiceId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InvoicesController.prototype, "downloadInvoice", null);
exports.InvoicesController = InvoicesController = __decorate([
    (0, common_1.Controller)('invoices'),
    __metadata("design:paramtypes", [invoices_service_1.InvoicesService])
], InvoicesController);
//# sourceMappingURL=invoices.controller.js.map