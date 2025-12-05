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
var InvoicesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoicesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const PDFDocument = require("pdfkit");
const fs_1 = require("fs");
const path_1 = require("path");
let InvoicesService = InvoicesService_1 = class InvoicesService {
    constructor(prisma, whatsappService) {
        this.prisma = prisma;
        this.whatsappService = whatsappService;
        this.logger = new common_1.Logger(InvoicesService_1.name);
    }
    async generateInvoice(bookingId) {
        let existingInvoice = await this.prisma.invoice.findUnique({
            where: { bookingId },
            include: { customer: true, booking: true },
        });
        if (existingInvoice) {
            if (!existingInvoice.pdfData) {
                this.logger.log(`Invoice exists for booking ${bookingId} but PDF is missing, generating PDF`);
                const pkg = await this.prisma.package.findFirst({
                    where: { name: existingInvoice.booking.service },
                });
                const pdfBuffer = await this.generatePDF(existingInvoice, existingInvoice.booking, pkg);
                existingInvoice = await this.prisma.invoice.update({
                    where: { id: existingInvoice.id },
                    data: { pdfData: pdfBuffer },
                    include: { customer: true, booking: true },
                });
            }
            else {
                this.logger.log(`Invoice already exists for booking ${bookingId}, returning existing invoice`);
            }
            return existingInvoice;
        }
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: { customer: true },
        });
        if (!booking)
            throw new Error('Booking not found');
        const pkg = await this.prisma.package.findFirst({
            where: { name: booking.service },
        });
        const payment = await this.prisma.payment.findFirst({
            where: { bookingId, status: 'success' },
        });
        const subtotal = pkg?.price || 10000;
        const tax = 0;
        const discount = 0;
        const total = subtotal - discount + tax;
        const depositPaid = payment?.amount || 0;
        const balanceDue = total - depositPaid;
        const invoiceNumber = await this.generateInvoiceNumber();
        const invoice = await this.prisma.invoice.create({
            data: {
                invoiceNumber,
                bookingId,
                customerId: booking.customerId,
                subtotal,
                tax,
                discount,
                total,
                depositPaid,
                balanceDue,
                status: 'pending',
            },
            include: { customer: true, booking: true },
        });
        const pdfBuffer = await this.generatePDF(invoice, booking, pkg);
        const updatedInvoice = await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { pdfData: pdfBuffer },
            include: { customer: true, booking: true },
        });
        return updatedInvoice;
    }
    async generateInvoiceNumber() {
        const year = new Date().getFullYear();
        const count = await this.prisma.invoice.count({
            where: {
                invoiceNumber: { startsWith: `INV-${year}-` },
            },
        });
        const nextNumber = (count + 1).toString().padStart(3, '0');
        return `INV-${year}-${nextNumber}`;
    }
    async generatePDF(invoice, booking, pkg) {
        const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('error', (err) => {
            this.logger.error('PDF generation error:', err);
        });
        const colors = {
            primary: '#7C3AED',
            primaryDark: '#6D28D9',
            secondary: '#64748B',
            text: '#0F172A',
            textLight: '#475569',
            lightBg: '#F8FAFC',
            border: '#E2E8F0',
            white: '#FFFFFF',
            accent: '#EDE9FE',
            success: '#10B981',
            warning: '#F59E0B',
        };
        const drawLine = (y, color = colors.border, width = 1) => {
            doc.strokeColor(color).lineWidth(width).moveTo(50, y).lineTo(545, y).stroke();
        };
        let y = 0;
        doc.rect(0, 0, 595, 120).fill(colors.accent);
        doc.rect(0, 0, 595, 8).fill(colors.primary);
        try {
            const logoPath = (0, path_1.join)(process.cwd(), 'omniconnect-suite', 'public', 'fiesta-logo.png');
            doc.image(logoPath, 50, 30, { width: 65, height: 65 });
        }
        catch (error) {
            doc.circle(82, 62, 32).fill(colors.primary);
            doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(28).text('FH', 68, 50);
        }
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(28)
            .text('INVOICE', 0, 35, { align: 'center', width: 595 });
        doc.font('Helvetica').fontSize(13).fillColor(colors.textLight)
            .text(`#${invoice.invoiceNumber}`, 0, 68, { align: 'center', width: 595 });
        const infoX = 385;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.text)
            .text('Fiesta House Photography', infoX, 32, { align: 'left' })
            .font('Helvetica').fontSize(9).fillColor(colors.textLight)
            .text('📍 Nairobi, Kenya', infoX, 50, { align: 'left' })
            .text('📞 +254 700 000 000', infoX, 65, { align: 'left' })
            .text('✉️  info@fiestahouse.co.ke', infoX, 80, { align: 'left' });
        y = 120;
        drawLine(y, colors.primary, 2);
        y += 18;
        const col1 = 60;
        const col2 = 340;
        doc.roundedRect(40, y - 10, 515, 80, 10).fill(colors.lightBg);
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(10).text('BILL TO', col1, y + 2);
        doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(12).text(invoice.customer.name, col1, y + 18);
        doc.font('Helvetica').fontSize(10).fillColor(colors.secondary)
            .text(invoice.customer.phone, col1, y + 36)
            .text(invoice.customer.email || '', col1, y + 50);
        const dateBoxX = col2;
        const dateBoxY = y + 2;
        doc.roundedRect(dateBoxX, dateBoxY, 200, 56, 8).fill(colors.white);
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(9)
            .text('DATE', dateBoxX + 10, dateBoxY + 7)
            .text('DUE DATE', dateBoxX + 10, dateBoxY + 25)
            .text('SERVICE DATE', dateBoxX + 10, dateBoxY + 43);
        doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(10)
            .text(new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }), dateBoxX + 100, dateBoxY + 7, { width: 90, align: 'right' })
            .text(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }), dateBoxX + 100, dateBoxY + 25, { width: 90, align: 'right' })
            .text(new Date(booking.dateTime).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }), dateBoxX + 100, dateBoxY + 43, { width: 90, align: 'right' });
        y += 90;
        const tableTop = y;
        const itemCodeX = 60;
        const descriptionX = 120;
        const priceX = 380;
        const amountX = 480;
        doc.fillColor(colors.primary).rect(50, tableTop, 495, 28).fill();
        doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(10)
            .text('ITEM', itemCodeX, tableTop + 8)
            .text('DESCRIPTION', descriptionX, tableTop + 8)
            .text('PRICE', priceX, tableTop + 8, { width: 80, align: 'right' })
            .text('AMOUNT', amountX, tableTop + 8, { width: 65, align: 'right' });
        y += 28;
        doc.fillColor(colors.white).rect(50, y, 495, 28).fill();
        doc.strokeColor(colors.border).lineWidth(1).rect(50, y, 495, 28).stroke();
        doc.fillColor(colors.text).font('Helvetica').fontSize(10);
        const rowY = y + 8;
        doc.text('01', itemCodeX, rowY);
        doc.text(booking.service, descriptionX, rowY, { width: 250 });
        doc.text(invoice.subtotal.toLocaleString(), priceX, rowY, { width: 80, align: 'right' });
        doc.text(invoice.subtotal.toLocaleString(), amountX, rowY, { width: 65, align: 'right' });
        y += 28;
        drawLine(y);
        y += 20;
        const totalsLabelX = 350;
        const totalsValueX = 450;
        const totalsWidth = 95;
        doc.roundedRect(totalsLabelX - 20, y - 10, 215, 120, 10).fill(colors.lightBg);
        let ty = y;
        doc.font('Helvetica').fontSize(10).fillColor(colors.secondary);
        doc.text('Subtotal', totalsLabelX, ty);
        doc.fillColor(colors.text).text(invoice.subtotal.toLocaleString(), totalsValueX, ty, { width: totalsWidth, align: 'right' });
        ty += 18;
        if (invoice.discount > 0) {
            doc.fillColor(colors.secondary).text('Discount', totalsLabelX, ty);
            doc.fillColor('#EF4444').text(`- ${invoice.discount.toLocaleString()}`, totalsValueX, ty, { width: totalsWidth, align: 'right' });
            ty += 18;
        }
        if (invoice.tax > 0) {
            doc.fillColor(colors.secondary).text('Tax', totalsLabelX, ty);
            doc.fillColor(colors.text).text(invoice.tax.toLocaleString(), totalsValueX, ty, { width: totalsWidth, align: 'right' });
            ty += 18;
        }
        doc.strokeColor(colors.border).moveTo(totalsLabelX, ty).lineTo(545, ty).stroke();
        ty += 8;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.primary);
        doc.text('Total', totalsLabelX, ty);
        doc.text(`KSH ${invoice.total.toLocaleString()}`, totalsValueX, ty, { width: totalsWidth, align: 'right' });
        ty += 22;
        doc.font('Helvetica').fontSize(10).fillColor(colors.secondary);
        doc.text('Deposit Paid', totalsLabelX, ty);
        doc.fillColor('#10B981').text(`- ${invoice.depositPaid.toLocaleString()}`, totalsValueX, ty, { width: totalsWidth, align: 'right' });
        ty += 18;
        doc.roundedRect(totalsLabelX - 10, ty - 4, 195, 28, 6).fill(colors.primary);
        doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(13);
        doc.text('Balance Due', totalsLabelX, ty, { continued: true });
        doc.text(`KSH ${invoice.balanceDue.toLocaleString()}`, totalsValueX, ty, { width: totalsWidth, align: 'right' });
        y += 130;
        const bottomY = 700;
        doc.roundedRect(50, bottomY, 250, 80, 10).fill(colors.accent);
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(11)
            .text('PAYMENT DETAILS', 65, bottomY + 15);
        doc.font('Helvetica').fontSize(9).fillColor(colors.secondary)
            .text('M-Pesa Paybill: 123456', 65, bottomY + 35)
            .text('Account: Your Name', 65, bottomY + 50)
            .text('Bank: Standard Chartered', 65, bottomY + 65);
        doc.font('Helvetica').fontSize(8).fillColor(colors.secondary)
            .text('Payment is due within 7 days. Please contact us for any questions regarding this invoice.', 320, bottomY + 10, { width: 220, align: 'right' });
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(15)
            .text('Thank You!', 350, bottomY + 40, { align: 'right', width: 195 });
        doc.strokeColor(colors.primary).lineWidth(2).moveTo(50, 790).lineTo(545, 790).stroke();
        doc.end();
        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve(pdfBuffer);
            });
            doc.on('error', reject);
        });
    }
    async sendInvoiceToCustomer(invoiceId) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { customer: true, booking: true },
        });
        if (!invoice)
            throw new Error('Invoice not found');
        if (!invoice.pdfData)
            throw new Error('Invoice PDF not found');
        const tempDir = (0, path_1.join)(process.cwd(), 'temp');
        (0, fs_1.mkdirSync)(tempDir, { recursive: true });
        const tempFilePath = (0, path_1.join)(tempDir, `${invoice.invoiceNumber}.pdf`);
        (0, fs_1.writeFileSync)(tempFilePath, invoice.pdfData);
        try {
            const message = `
📄 *Invoice for Your Photoshoot*

Invoice Number: ${invoice.invoiceNumber}
Service: ${invoice.booking.service}
Date: ${new Date(invoice.booking.dateTime).toLocaleDateString()}

💰 *Payment Summary:*
Total Amount: KSH ${invoice.total.toLocaleString()}
Deposit Paid: KSH ${invoice.depositPaid.toLocaleString()}
*Balance Due: KSH ${invoice.balanceDue.toLocaleString()}*

Please find your invoice attached below.
Please settle the balance within 7 days.

Thank you for choosing Fiesta House! 💖
    `.trim();
            let phone = invoice.customer.phone;
            if (!phone.startsWith('254')) {
                phone = `254${phone.replace(/^0+/, '')}`;
            }
            await this.whatsappService.sendDocument(phone, tempFilePath, `${invoice.invoiceNumber}.pdf`, message);
            await this.prisma.invoice.update({
                where: { id: invoiceId },
                data: { status: 'sent', sentAt: new Date() },
            });
            this.logger.log(`Invoice ${invoice.invoiceNumber} sent to ${invoice.customer.phone}`);
        }
        finally {
            if ((0, fs_1.existsSync)(tempFilePath)) {
                (0, fs_1.unlinkSync)(tempFilePath);
                this.logger.log(`Cleaned up temp file: ${tempFilePath}`);
            }
        }
    }
    async getInvoicesByBooking(bookingId) {
        return this.prisma.invoice.findMany({
            where: { bookingId },
            include: { customer: true, booking: true },
        });
    }
    async getInvoicesByCustomer(customerId) {
        return this.prisma.invoice.findMany({
            where: { customerId },
            include: { customer: true, booking: true },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getAllInvoices() {
        return this.prisma.invoice.findMany({
            include: { customer: true, booking: true },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getInvoiceById(invoiceId) {
        return this.prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { customer: true, booking: true },
        });
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = InvoicesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService])
], InvoicesService);
//# sourceMappingURL=invoices.service.js.map