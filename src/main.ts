import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global prefix for API routes, excluding webhook routes
  app.setGlobalPrefix('api', {
    exclude: ['webhooks/whatsapp', 'webhooks/whatsapp/*', 'webhooks/instagram', 'webhooks/*']
  });

  // Enable CORS for frontend
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3001', 'http://localhost:3000'], // Vite dev server and omniconnect-suite
    credentials: true,
  });

  await app.listen(3000);
  console.log('Application started successfully');
}
bootstrap();
