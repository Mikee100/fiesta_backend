import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable()
export class ExternalServicesHealthIndicator extends HealthIndicator {
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    super();
  }

  async checkWhatsApp(key: string): Promise<HealthIndicatorResult> {
    try {
      const phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
      const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
      const apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION', 'v21.0');

      if (!phoneNumberId || !accessToken) {
        return this.getStatus(key, false, {
          message: 'WhatsApp credentials not configured',
          configured: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Test WhatsApp API connectivity
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { access_token: accessToken },
          timeout: 5000,
        }).pipe(
          timeout(5000),
          catchError(() => of({ status: 500, data: null })),
        ),
      );

      const isHealthy = response.status === 200;
      return this.getStatus(key, isHealthy, {
        message: isHealthy ? 'WhatsApp API is accessible' : 'WhatsApp API check failed',
        configured: true,
        status: response.status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return this.getStatus(key, false, {
        message: 'WhatsApp API check failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async checkOpenAI(key: string): Promise<HealthIndicatorResult> {
    try {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');

      if (!apiKey) {
        return this.getStatus(key, false, {
          message: 'OpenAI API key not configured',
          configured: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Test OpenAI API with a simple models request
      const response = await firstValueFrom(
        this.httpService.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 5000,
        }).pipe(
          timeout(5000),
          catchError(() => of({ status: 500, data: null })),
        ),
      );

      const isHealthy = response.status === 200;
      return this.getStatus(key, isHealthy, {
        message: isHealthy ? 'OpenAI API is accessible' : 'OpenAI API check failed',
        configured: true,
        status: response.status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return this.getStatus(key, false, {
        message: 'OpenAI API check failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async checkGoogleCalendar(key: string): Promise<HealthIndicatorResult> {
    try {
      const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const googleClientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

      if (!googleClientId || !googleClientSecret) {
        // Return as "up" but with configured: false - this is not a failure, just not configured
        return this.getStatus(key, true, {
          message: 'Google Calendar credentials not configured (optional)',
          configured: false,
          optional: true,
          timestamp: new Date().toISOString(),
        });
      }

      // Google Calendar is accessible if credentials are configured
      // Actual connectivity would require OAuth token
      return this.getStatus(key, true, {
        message: 'Google Calendar credentials configured',
        configured: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Even on error, mark as "up" since it's optional
      return this.getStatus(key, true, {
        message: 'Google Calendar check failed (optional service)',
        error: error.message,
        optional: true,
        timestamp: new Date().toISOString(),
      });
    }
  }
}



