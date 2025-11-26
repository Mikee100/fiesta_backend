import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { DateTime } from 'luxon';
import { AiService } from '../ai/ai.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly mpesaBaseUrl = 'https://sandbox.safaricom.co.ke'; // Sandbox URL for testing
  private readonly consumerKey = process.env.MPESA_CONSUMER_KEY;
  private readonly consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  private readonly shortcode = process.env.MPESA_SHORTCODE;
  private readonly passkey = process.env.MPESA_PASSKEY;
  private readonly callbackUrl = process.env.MPESA_CALLBACK_URL;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private messagesService: MessagesService,
    @Inject(forwardRef(() => AiService)) private aiService: AiService,
    @InjectQueue('aiQueue') private aiQueue: Queue,
  ) {}

  async getPaymentByCheckoutRequestId(checkoutRequestId: string) {
    return this.prisma.payment.findFirst({
      where: { checkoutRequestId },
    });
  }

async getAccessToken(): Promise<string> {
  if (!this.consumerKey || !this.consumerSecret) {
    throw new Error('MPesa credentials not configured.');
  }

  const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
  const url = `${this.mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`;

  this.logger.log(`Getting access token from: ${url}`);
  this.logger.log(`Authorization header: Basic ${auth.substring(0, 10)}...`);

  // MUST BE GET (not POST)
  const response = await firstValueFrom(
    this.httpService.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }),
  );

  this.logger.log(`Access token response data: ${JSON.stringify(response.data)}`);

  if (!response.data || !response.data.access_token) {
    throw new Error(`Invalid access token response: ${JSON.stringify(response.data)}`);
  }

  return response.data.access_token;
}



  async initiateSTKPush(bookingDraftId: string, phone: string, amount: number): Promise<string> {
    const draft = await this.prisma.bookingDraft.findUnique({
      where: { id: bookingDraftId },
      include: { customer: true },
    });

    if (!draft || !draft.service) {
      throw new Error('No valid booking draft found');
    }

    const packageInfo = await this.prisma.package.findFirst({ where: { name: draft.service } });
    if (!packageInfo) {
      throw new Error('Package not found');
    }

    // Check for existing payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: { bookingDraftId },
    });

    if (existingPayment) {
      if (existingPayment.status === 'success') {
        throw new Error('Payment already completed for this booking draft');
      }
      if (existingPayment.status === 'pending' && existingPayment.checkoutRequestId) {
        this.logger.log(`Reusing existing pending payment ${existingPayment.id}, CheckoutRequestID: ${existingPayment.checkoutRequestId}`);
        return existingPayment.checkoutRequestId;
      }
      // If failed or pending without CheckoutRequestID, just update the existing payment to pending and reuse it
      if (existingPayment.status === 'failed' || (existingPayment.status === 'pending' && !existingPayment.checkoutRequestId)) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: { status: 'pending', checkoutRequestId: null },
        });
        this.logger.log(`Reset old payment ${existingPayment.id} for draft ${bookingDraftId}`);
      }
    }

    // Create pending payment
    const payment = await this.prisma.payment.create({
      data: {
        bookingDraftId,
        amount,
        phone: phone.startsWith('254') ? phone : `254${phone.substring(1)}`, // Format to 254...
        status: 'pending',
      },
    });

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');

    const accessToken = await this.getAccessToken();

    const stkRequestBody = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
      PartyB: this.shortcode,
      PhoneNumber: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
      CallBackURL: this.callbackUrl,
      AccountReference: `BookingDeposit-${draft.id}`,
      TransactionDesc: `Deposit for ${draft.service} booking`,
    };
    const stkUrl = `${this.mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`;
    this.logger.log(`Initiating STK Push to URL: ${stkUrl}`);
    this.logger.log(`STK Push request body: ${JSON.stringify(stkRequestBody)}`);
    this.logger.log(`Authorization header: Bearer ${accessToken.substring(0, 10)}...`);

    try {
      const stkResponse = await firstValueFrom(
        this.httpService.post(stkUrl, stkRequestBody, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      const data = (stkResponse as { data: any }).data;
      if (data.ResponseCode !== '0') {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'failed' },
        });
        throw new Error(`STK Push failed: ${data.errorMessage}`);
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { checkoutRequestId: data.CheckoutRequestID },
      });

      this.logger.log(`STK Push initiated for payment ${payment.id}, CheckoutRequestID: ${data.CheckoutRequestID}`);
      return data.CheckoutRequestID;
    } catch (error) {
      this.logger.error(`STK Push request failed: ${error.message}`, error.response?.data || error);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  async handleCallback(body: any) {
    // M-Pesa sends validation and confirmation callbacks
    const { Body } = body;
    const { stkCallback } = Body;
    const { CheckoutRequestID } = stkCallback;
    const { ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    const payment = await this.prisma.payment.findFirst({
      where: { checkoutRequestId: CheckoutRequestID },
      include: { bookingDraft: { include: { customer: true } } },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for CheckoutRequestID: ${CheckoutRequestID}`);
      // Do not delete or clear any payment record, just return
      return;
    }

    if (ResultCode === 0 || ResultCode === '0') {
      // Success
      let receipt = '';
      if (CallbackMetadata && CallbackMetadata.Item) {
        const item = CallbackMetadata.Item.find((i: any) => i.Name === 'MpesaReceiptNumber');
        if (item) receipt = item.Value;
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'success',
          mpesaReceipt: receipt,
        },
      });

      // Confirm booking if payment success
      if (payment.bookingDraft) {
        this.logger.log(`Payment successful for booking draft ${payment.bookingDraft.id}, confirming booking`);

        // Create confirmed booking from draft
        const draft = payment.bookingDraft;
        const booking = await this.prisma.booking.create({
          data: {
            customerId: draft.customerId,
            service: draft.service,
            dateTime: new Date(draft.dateTimeIso),
            status: 'confirmed',
            // Add other fields from draft if available, e.g., recipientName, recipientPhone
          },
        });

        // Delete the draft
        await this.prisma.bookingDraft.delete({
          where: { id: draft.id },
        });

        // Send confirmation message to customer (WhatsApp)
        await this.messagesService.sendOutboundMessage(
          draft.customerId,
          "Payment successful! Your maternity photoshoot booking is now confirmed. We'll send you a reminder closer to the date. 💖",
          'whatsapp'
        );

        // Send confirmation message to customer (AI chat)
            try {
              const bookingDate = booking.dateTime;
              const tz = 'Africa/Nairobi';
              const { DateTime } = require('luxon');
              const dt = DateTime.fromJSDate(bookingDate).setZone(tz);
              const formattedDate = dt.toFormat("MMMM d 'at' h:mm a");
              const confirmMsg = `Payment received! Your booking is now confirmed for ${formattedDate}. We'll send you a reminder closer to the date. 💖`;
              await this.aiService.generateGeneralResponse(
                confirmMsg,
                draft.customerId,
                null,
                []
              );
            } catch (err) {
              this.logger.warn('Failed to send AI chat confirmation after payment', err);
            }


        // SCHEDULE REMINDERS 2 DAYS AND 1 DAY BEFORE
        const bookingDate = DateTime.fromJSDate(booking.dateTime);
        const reminderTimes = [
          { days: 2, label: '2' },
          { days: 1, label: '1' },
        ];
        for (const { days, label } of reminderTimes) {
          const reminderTime = bookingDate.minus({ days });
          const delay = reminderTime.diffNow().as('milliseconds');
          if (delay > 0) {
            await this.aiQueue.add(
              'sendReminder',
              {
                customerId: draft.customerId,
                bookingId: booking.id,
                date: draft.date,
                time: draft.time,
                recipientName: draft.recipientName || draft.name,
                daysBefore: label,
              },
              {
                delay,
                removeOnComplete: true,
                removeOnFail: true,
              }
            );
            this.logger.log(`Reminder scheduled for: ${reminderTime.toISO()} (${label} days before)`);
          } else {
            this.logger.warn(`Reminder delay negative for bookingId=${booking.id}, skipping ${label}-day reminder`);
          }
        }

        this.logger.log(`Booking ${booking.id} confirmed from draft ${draft.id}`);
      }

      this.logger.log(`Payment ${payment.id} confirmed: ${receipt}`);
    } else {
      // Failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      this.logger.error(`STK Push failed for ${payment.id}: ${ResultDesc}`);
    }
  }

    // TEST endpoint for STK Push, not tied to a booking draft
  async testStkPush(phone: string, amount: number) {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
    const accessToken = await this.getAccessToken();
    const stkRequestBody = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
      PartyB: this.shortcode,
      PhoneNumber: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
      CallBackURL: this.callbackUrl,
      AccountReference: `TestSTKPush`,
      TransactionDesc: `Test STK Push`,
    };
    const stkUrl = `${this.mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`;
    this.logger.log(`[TEST] Initiating STK Push to URL: ${stkUrl}`);
    this.logger.log(`[TEST] STK Push request body: ${JSON.stringify(stkRequestBody)}`);
    this.logger.log(`[TEST] Authorization header: Bearer ${accessToken.substring(0, 10)}...`);
    try {
      const stkResponse = await firstValueFrom(
        this.httpService.post(stkUrl, stkRequestBody, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      const data = (stkResponse as { data: any }).data;
      if (data.ResponseCode !== '0') {
        throw new Error(`STK Push failed: ${data.errorMessage}`);
      }
      this.logger.log(`[TEST] STK Push initiated, CheckoutRequestID: ${data.CheckoutRequestID}`);
      return { checkoutRequestId: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID };
    } catch (error) {
      this.logger.error(`[TEST] STK Push request failed: ${error.message}`, error.response?.data || error);
      throw error;
    }
  }
}
