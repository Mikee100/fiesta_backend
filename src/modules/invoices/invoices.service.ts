import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import PDFDocument = require('pdfkit');
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

@Injectable()
export class InvoicesService {
    private readonly logger = new Logger(InvoicesService.name);

    constructor(
        private prisma: PrismaService,
        private whatsappService: WhatsappService,
    ) { }

    async generateInvoice(bookingId: string) {
        // Check if invoice already exists for this booking
        let existingInvoice = await this.prisma.invoice.findUnique({
            where: { bookingId },
            include: { customer: true, booking: true },
        });

        if (existingInvoice) {
            // If PDF doesn't exist, generate it
            if (!existingInvoice.pdfData) {
                this.logger.log(`Invoice exists for booking ${bookingId} but PDF is missing, generating PDF`);
                // Get package details
                const pkg = await this.prisma.package.findFirst({
                    where: { name: existingInvoice.booking.service },
                });
                // Generate PDF as buffer
                const pdfBuffer = await this.generatePDF(existingInvoice, existingInvoice.booking, pkg);
                // Update invoice with PDF data
                existingInvoice = await this.prisma.invoice.update({
                    where: { id: existingInvoice.id },
                    data: { pdfData: pdfBuffer },
                    include: { customer: true, booking: true },
                });
            } else {
                this.logger.log(`Invoice already exists for booking ${bookingId}, returning existing invoice`);
            }
            return existingInvoice;
        }

        // Get booking with all details
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
            include: { customer: true },
        });

        if (!booking) throw new Error('Booking not found');

        // Get package details
        const pkg = await this.prisma.package.findFirst({
            where: { name: booking.service },
        });

        // Get payment details
        const payment = await this.prisma.payment.findFirst({
            where: { bookingId, status: 'success' },
        });

        // Calculate invoice amounts
        const subtotal = pkg?.price || 10000;
        const tax = 0; // Add tax if needed
        const discount = 0;
        const total = subtotal - discount + tax;
        const depositPaid = payment?.amount || 0;
        const balanceDue = total - depositPaid;

        // Generate invoice number
        const invoiceNumber = await this.generateInvoiceNumber();

        // Create invoice record
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

        // Generate PDF as buffer
        const pdfBuffer = await this.generatePDF(invoice, booking, pkg);

        // Update invoice with PDF data in database
        const updatedInvoice = await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { pdfData: pdfBuffer },
            include: { customer: true, booking: true },
        });

        return updatedInvoice;
    }

    private async generateInvoiceNumber(): Promise<string> {
        const year = new Date().getFullYear();
        const count = await this.prisma.invoice.count({
            where: {
                invoiceNumber: { startsWith: `INV-${year}-` },
            },
        });
        const nextNumber = (count + 1).toString().padStart(3, '0');
        return `INV-${year}-${nextNumber}`;
    }

    private async generatePDF(invoice: any, booking: any, pkg: any): Promise<Buffer> {
        const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

        // Collect PDF data in memory
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('error', (err) => {
            this.logger.error('PDF generation error:', err);
        });

        // Define Colors & Fonts
        const colors = {
            primary: '#7C3AED', // Vibrant Purple
            primaryDark: '#6D28D9', // Darker Purple
            secondary: '#64748B', // Slate Gray
            text: '#0F172A', // Very Dark Slate
            textLight: '#475569', // Light Slate
            lightBg: '#F8FAFC', // Very light gray-blue
            border: '#E2E8F0', // Light border
            white: '#FFFFFF',
            accent: '#EDE9FE', // Light purple accent
            success: '#10B981', // Green
            warning: '#F59E0B', // Amber
        };

        // Helper to draw horizontal line
        const drawLine = (y: number, color = colors.border, width = 1) => {
            doc.strokeColor(color).lineWidth(width).moveTo(50, y).lineTo(545, y).stroke();
        };

        // 1. Header Section with gradient-like effect
        let y = 0;
        // Create a subtle gradient effect with rectangles
        doc.rect(0, 0, 595, 120).fill(colors.accent);
        doc.rect(0, 0, 595, 8).fill(colors.primary);

        // Logo (left)
        try {
            const logoPath = join(process.cwd(), 'omniconnect-suite', 'public', 'fiesta-logo.png');
            doc.image(logoPath, 50, 30, { width: 65, height: 65 });
        } catch (error) {
            // Fallback: Create a circular logo placeholder
            doc.circle(82, 62, 32).fill(colors.primary);
            doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(28).text('FH', 68, 50);
        }

        // Invoice title and number (center)
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(28)
            .text('INVOICE', 0, 35, { align: 'center', width: 595 });
        doc.font('Helvetica').fontSize(13).fillColor(colors.textLight)
            .text(`#${invoice.invoiceNumber}`, 0, 68, { align: 'center', width: 595 });

        // Company Info (right) - Enhanced styling
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

        // 2. Bill To & Invoice Details (side-by-side, clear grouping)
        const col1 = 60;
        const col2 = 340;
        doc.roundedRect(40, y - 10, 515, 80, 10).fill(colors.lightBg);

        // Bill To (left column)
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(10).text('BILL TO', col1, y + 2);
        doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(12).text(invoice.customer.name, col1, y + 18);
        doc.font('Helvetica').fontSize(10).fillColor(colors.secondary)
            .text(invoice.customer.phone, col1, y + 36)
            .text(invoice.customer.email || '', col1, y + 50);

        // Invoice Dates (right column, grouped vertically)
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

        // 3. Items Table (well-structured, with grid lines)
        const tableTop = y;
        const itemCodeX = 60;
        const descriptionX = 120;
        const priceX = 380;
        const amountX = 480;

        // Table Header
        doc.fillColor(colors.primary).rect(50, tableTop, 495, 28).fill();
        doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(10)
            .text('ITEM', itemCodeX, tableTop + 8)
            .text('DESCRIPTION', descriptionX, tableTop + 8)
            .text('PRICE', priceX, tableTop + 8, { width: 80, align: 'right' })
            .text('AMOUNT', amountX, tableTop + 8, { width: 65, align: 'right' });

        y += 28;

        // Table Row (with grid lines)
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

        // 4. Totals (highlighted, well-structured)
        y += 20;
        const totalsLabelX = 350;
        const totalsValueX = 450;
        const totalsWidth = 95;

        // Card background
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
        // Divider
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
        // Balance Due Box (highlighted)
        doc.roundedRect(totalsLabelX - 10, ty - 4, 195, 28, 6).fill(colors.primary);
        doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(13);
        doc.text('Balance Due', totalsLabelX, ty, { continued: true });
        doc.text(`KSH ${invoice.balanceDue.toLocaleString()}`, totalsValueX, ty, { width: totalsWidth, align: 'right' });
        y += 130;

        // 5. Footer / Payment Info (well-structured)
        const bottomY = 700;
        // Payment Info Card
        doc.roundedRect(50, bottomY, 250, 80, 10).fill(colors.accent);
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(11)
            .text('PAYMENT DETAILS', 65, bottomY + 15);
        doc.font('Helvetica').fontSize(9).fillColor(colors.secondary)
            .text('M-Pesa Paybill: 123456', 65, bottomY + 35)
            .text('Account: Your Name', 65, bottomY + 50)
            .text('Bank: Standard Chartered', 65, bottomY + 65);

        // Notes/Terms (optional, for clarity)
        doc.font('Helvetica').fontSize(8).fillColor(colors.secondary)
            .text('Payment is due within 7 days. Please contact us for any questions regarding this invoice.', 320, bottomY + 10, { width: 220, align: 'right' });

        // Thank You Note
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(15)
            .text('Thank You!', 350, bottomY + 40, { align: 'right', width: 195 });

        // Footer Line
        doc.strokeColor(colors.primary).lineWidth(2).moveTo(50, 790).lineTo(545, 790).stroke();

        // Optional: Watermark/Accent (subtle brand mark)
        // doc.opacity(0.07).fontSize(80).fillColor(colors.primary).text('Fiesta', 100, 350, { angle: 30 });
        // doc.opacity(1);

        doc.end();

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve(pdfBuffer);
            });
            doc.on('error', reject);
        });
    }

    async sendInvoiceToCustomer(invoiceId: string) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { customer: true, booking: true },
        });

        if (!invoice) throw new Error('Invoice not found');
        if (!invoice.pdfData) throw new Error('Invoice PDF not found');

        // Create temp directory and file for WhatsApp upload
        const tempDir = join(process.cwd(), 'temp');
        mkdirSync(tempDir, { recursive: true });

        const tempFilePath = join(tempDir, `${invoice.invoiceNumber}.pdf`);
        writeFileSync(tempFilePath, invoice.pdfData);

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

            // Format phone number to international format for WhatsApp API
            let phone = invoice.customer.phone;
            if (!phone.startsWith('254')) {
                phone = `254${phone.replace(/^0+/, '')}`;
            }

            // Send WhatsApp message with PDF
            await this.whatsappService.sendDocument(
                phone,
                tempFilePath,
                `${invoice.invoiceNumber}.pdf`,
                message
            );

            // Update invoice status
            await this.prisma.invoice.update({
                where: { id: invoiceId },
                data: { status: 'sent', sentAt: new Date() },
            });

            this.logger.log(`Invoice ${invoice.invoiceNumber} sent to ${invoice.customer.phone}`);
        } finally {
            // Clean up temp file
            if (existsSync(tempFilePath)) {
                unlinkSync(tempFilePath);
                this.logger.log(`Cleaned up temp file: ${tempFilePath}`);
            }
        }
    }

    async getInvoicesByBooking(bookingId: string) {
        return this.prisma.invoice.findMany({
            where: { bookingId },
            include: { customer: true, booking: true },
        });
    }

    async getInvoicesByCustomer(customerId: string) {
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

    async getInvoiceById(invoiceId: string) {
        return this.prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { customer: true, booking: true },
        });
    }
}
