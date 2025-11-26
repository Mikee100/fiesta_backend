"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api', {
        exclude: [
            'webhooks/whatsapp',
            'webhooks/whatsapp/*',
            'webhooks/instagram',
            'webhooks/*',
            'admin/queues',
            'admin/queues/*',
        ]
    });
    app.enableCors({
        origin: ['http://localhost:5173', 'http://localhost:5000', 'http://localhost:8080', 'http://localhost:3001', 'http://localhost:3000'],
        credentials: true,
    });
    try {
        const { setupBullBoard } = await Promise.resolve().then(() => require('./bull-board'));
        setupBullBoard(app);
        console.log('Bull Board dashboard available at /admin/queues');
    }
    catch (err) {
        console.warn('Bull Board dashboard setup failed:', err);
    }
    await app.listen(3000);
    console.log('Application started successfully');
}
bootstrap();
//# sourceMappingURL=main.js.map