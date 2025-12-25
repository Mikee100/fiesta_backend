"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const helmet_1 = require("helmet");
const express = require("express");
async function bootstrap() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[UNHANDLED REJECTION]', reason);
        console.error('[UNHANDLED REJECTION] Stack:', reason instanceof Error ? reason.stack : 'No stack trace');
    });
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
        crossOriginEmbedderPolicy: false,
        frameguard: { action: 'sameorigin' },
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));
    const { ConditionalValidationPipe } = await Promise.resolve().then(() => require('./common/pipes/conditional-validation.pipe'));
    app.useGlobalPipes(new ConditionalValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
        disableErrorMessages: process.env.NODE_ENV === 'production',
        skipMissingProperties: false,
    }));
    app.setGlobalPrefix('api', {
        exclude: [
            '',
            '/',
            'webhooks/whatsapp',
            'webhooks/whatsapp/*',
            'webhooks/instagram',
            'webhooks/messenger',
            'webhooks/*',
            'admin/queues',
            'admin/queues/*',
        ]
    });
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }
            const allowedOrigins = [
                'http://localhost:5173',
                'http://localhost:5000',
                'http://localhost:8080',
                'http://localhost:3001',
                'http://localhost:3000',
                'https://fiestahouse.vercel.app',
                'https://fiesta-house-maternity.vercel.app',
                'https://fiesta-house.duckdns.org',
            ];
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else {
                callback(null, true);
            }
        },
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
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    try {
        await app.listen(port);
        console.log(`✅ Application started successfully on port ${port}`);
        console.log(JSON.stringify({ message: 'Fiesta House APIs is running 🚀', port }));
    }
    catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${port} is already in use. Please:`);
            console.error(`   1. Stop the existing process using port ${port}`);
            console.error(`   2. Or set PORT environment variable to use a different port`);
            console.error(`   3. On Windows, find the process: netstat -ano | findstr :${port}`);
            process.exit(1);
        }
        else {
            throw error;
        }
    }
}
bootstrap();
//# sourceMappingURL=main.js.map