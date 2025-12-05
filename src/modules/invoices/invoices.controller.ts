import { Controller, Post, Get, Param, Res } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { Response } from 'express';

@Controller('invoices')
export class InvoicesController {
    constructor(private readonly invoicesService: InvoicesService) { }

    @Post('generate/:bookingId')
    async generateInvoice(@Param('bookingId') bookingId: string) {
        return this.invoicesService.generateInvoice(bookingId);
    }

    @Post('send/:invoiceId')
    async sendInvoice(@Param('invoiceId') invoiceId: string) {
        await this.invoicesService.sendInvoiceToCustomer(invoiceId);
        return { message: 'Invoice sent successfully' };
    }

    @Get('booking/:bookingId')
    async getInvoicesByBooking(@Param('bookingId') bookingId: string) {
        return this.invoicesService.getInvoicesByBooking(bookingId);
    }

    @Get('customer/:customerId')
    async getInvoicesByCustomer(@Param('customerId') customerId: string) {
        return this.invoicesService.getInvoicesByCustomer(customerId);
    }

    @Get()
    async getAllInvoices() {
        return this.invoicesService.getAllInvoices();
    }

    @Get('download/:invoiceId')
    async downloadInvoice(@Param('invoiceId') invoiceId: string, @Res() res: Response) {
        let invoice = await this.invoicesService.getInvoiceById(invoiceId);
        if (!invoice) {
            return res.status(404).send('Invoice not found');
        }

        // If PDF doesn't exist in database, regenerate it
        if (!invoice.pdfData) {
            try {
                invoice = await this.invoicesService.generateInvoice(invoice.bookingId);
                if (!invoice.pdfData) {
                    return res.status(500).send('Failed to generate invoice PDF');
                }
            } catch (error) {
                return res.status(500).send('Failed to generate invoice PDF');
            }
        }

        // Serve PDF from database
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
            'Content-Length': invoice.pdfData.length.toString(),
        });

        res.send(invoice.pdfData);
    }
}
