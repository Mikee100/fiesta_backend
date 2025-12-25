import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as express from 'express';

async function bootstrap() {
  // Handle unhandled promise rejections to prevent crashes
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('[UNHANDLED REJECTION]', reason);
    console.error('[UNHANDLED REJECTION] Stack:', reason instanceof Error ? reason.stack : 'No stack trace');
    // Don't exit - log and continue
  });

  // Limit NestJS internal logging to only important levels
  // This hides verbose module/router initialization logs
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // ============================================
  // SECURITY: Helmet.js - Security Headers
  // Disable some Helmet features for webhook routes
  // ============================================
  // Middleware block removed due to noise

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for webhooks
    // Disable frameguard for webhooks (Meta might need this)
    frameguard: { action: 'sameorigin' },
  }));

  // ============================================
  // SECURITY: Request Size Limits
  // ============================================
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // ============================================
  // SECURITY: Global Input Validation
  // Skip validation for webhook routes to allow Meta's payloads
  // ============================================
  const { ConditionalValidationPipe } = await import('./common/pipes/conditional-validation.pipe');
  app.useGlobalPipes(
    new ConditionalValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: false, // Disable to allow webhook payloads through - ConditionalValidationPipe handles validation
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Allow implicit type conversion
      },
      disableErrorMessages: process.env.NODE_ENV === 'production', // Hide error details in production
      skipMissingProperties: false,
      // ConditionalValidationPipe will handle validation for DTOs and skip for webhooks
    }),
  );

  // Set global prefix for API routes, excluding webhook routes
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

  // Enable CORS for frontend and webhooks
  // Webhooks from Meta don't send Origin headers, so we allow all origins for webhook paths
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like webhooks from Meta)
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
      } else {
        callback(null, true); // Allow all origins for webhook compatibility
      }
    },
    credentials: true,
  });

  // Setup Bull Board dashboard
  try {
    const { setupBullBoard } = await import('./bull-board');
    setupBullBoard(app);
    console.log('Bull Board dashboard available at /admin/queues');
  } catch (err) {
    console.warn('Bull Board dashboard setup failed:', err);
  }

  // Get port from environment variable or default to 3000
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  try {
    await app.listen(port);
    console.log(`✅ Application started successfully on port ${port}`);
    console.log(JSON.stringify({ message: 'Fiesta House APIs is running 🚀', port }));
  } catch (error: any) {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Please:`);
      console.error(`   1. Stop the existing process using port ${port}`);
      console.error(`   2. Or set PORT environment variable to use a different port`);
      console.error(`   3. On Windows, find the process: netstat -ano | findstr :${port}`);
      process.exit(1);
    } else {
      throw error;
    }
  }
}
bootstrap();
