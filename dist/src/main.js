"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api', {
        exclude: ['webhooks/whatsapp', 'webhooks/whatsapp/*', 'webhooks/instagram', 'webhooks/*']
    });
    app.enableCors({
        origin: ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3001', 'http://localhost:3000'],
        credentials: true,
    });
    await app.listen(3000);
    console.log('Application started successfully');
}
bootstrap();
//# sourceMappingURL=main.js.map