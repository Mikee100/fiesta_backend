"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const invoices_service_1 = require("./src/modules/invoices/invoices.service");
const prisma_service_1 = require("./src/prisma/prisma.service");
const whatsapp_service_1 = require("./src/modules/whatsapp/whatsapp.service");
async function run() {
    const module = await testing_1.Test.createTestingModule({
        providers: [
            invoices_service_1.InvoicesService,
            {
                provide: prisma_service_1.PrismaService,
                useValue: {},
            },
            {
                provide: whatsapp_service_1.WhatsappService,
                useValue: {},
            },
        ],
    }).compile();
    const service = module.get(invoices_service_1.InvoicesService);
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
    const pdfPath = await service['generatePDF'](dummyInvoice, dummyBooking, dummyPkg);
    console.log(`Invoice generated at: ${pdfPath}`);
}
run().catch(console.error);
//# sourceMappingURL=test-invoice-gen.js.map