import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './src/modules/invoices/invoices.service';
import { PrismaService } from './src/prisma/prisma.service';
import { WhatsappService } from './src/modules/whatsapp/whatsapp.service';
import { join } from 'path';

async function run() {
    const module: TestingModule = await Test.createTestingModule({
        providers: [
            InvoicesService,
            {
                provide: PrismaService,
                useValue: {},
            },
            {
                provide: WhatsappService,
                useValue: {},
            },
        ],
    }).compile();

    const service = module.get<InvoicesService>(InvoicesService);

    const dummyInvoice = {
        invoiceNumber: 'INV-2024-001',
        subtotal: 15000,
        tax: 0,
        discount: 0,
        total: 15000,
        depositPaid: 5000,
        balanceDue: 10000,
        customer: {
            name: 'John Doe',
            phone: '+254712345678',
            email: 'john@example.com',
        },
    };

    const dummyBooking = {
        service: 'Gold Package',
        dateTime: new Date(),
    };

    const dummyPkg = {
        price: 15000,
    };

    console.log('Generating test invoice...');
    // Access private method using array notation
    const pdfPath = await service['generatePDF'](dummyInvoice, dummyBooking, dummyPkg);
    console.log(`Invoice generated at: ${pdfPath}`);
}

run().catch(console.error);
