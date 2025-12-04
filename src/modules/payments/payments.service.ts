import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { DateTime } from 'luxon';
import { AiService } from '../ai/ai.service';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PackagesService } from '../packages/packages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
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
    private notificationsService: NotificationsService,
    private whatsappService: WhatsappService,
    @Inject(forwardRef(() => AiService)) private aiService: AiService,
    @Inject(forwardRef(() => BookingsService)) private bookingsService: BookingsService,
    @InjectQueue('aiQueue') private aiQueue: Queue,
    @InjectQueue('paymentsQueue') private paymentsQueue: Queue,
    private packagesService: PackagesService,
  ) { }

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





  async initiateSTKPush(bookingDraftId: string, phone: string, amount: number): Promise<{ checkoutRequestId: string; paymentId: string }> {
    const draft = await this.prisma.bookingDraft.findUnique({
      where: { id: bookingDraftId },
      include: { customer: true },
    });

    if (!draft || !draft.service) {
      throw new Error('No valid booking draft found');
    }

    const packageInfo = await this.packagesService.findPackageByName(draft.service);
    if (!packageInfo) {
      throw new Error('Package not found');
    }

    // Check for existing payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: { bookingDraftId },
    });

    let payment;

    if (existingPayment) {
      if (existingPayment.status === 'success') {
        throw new Error('Payment already completed for this booking draft');
      }
      if (existingPayment.status === 'pending' && existingPayment.checkoutRequestId) {
        // Check if it's stale (> 1 minute)
        const now = new Date();
        const paymentTime = new Date(existingPayment.updatedAt);
        const diffMs = now.getTime() - paymentTime.getTime();

        if (diffMs > 60000) {
          this.logger.warn(`Found stale pending payment ${existingPayment.id} (> 1 min), marking as failed`);
          await this.prisma.payment.update({
            where: { id: existingPayment.id },
            data: { status: 'failed' },
          });
          // Proceed to create/reset payment below (fall through to next if block or logic)
          // We need to make sure we don't return here.
          // Since we updated it to failed, the next check (status === 'failed') will catch it if we re-fetch or just let it fall through.
          // However, existingPayment object is stale now. Let's update the local object status.
          existingPayment.status = 'failed';
        } else {
          this.logger.log(`Reusing existing pending payment ${existingPayment.id}, CheckoutRequestID: ${existingPayment.checkoutRequestId}`);
          return { checkoutRequestId: existingPayment.checkoutRequestId, paymentId: existingPayment.id };
        }
      }
      // If failed or pending without CheckoutRequestID, reset and reuse the existing payment
      if (existingPayment.status === 'failed' || (existingPayment.status === 'pending' && !existingPayment.checkoutRequestId)) {
        payment = await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: 'pending',
            checkoutRequestId: null,
            amount,
            phone: phone.startsWith('254') ? phone : `254${phone.substring(1)}`,
          },
        });
        this.logger.log(`Reset old payment ${existingPayment.id} for draft ${bookingDraftId}`);
      } else {
        // Fallback: reuse existing payment as-is
        payment = existingPayment;
      }
    } else {
      // Create new pending payment only if none exists
      payment = await this.prisma.payment.create({
        data: {
          bookingDraftId,
          amount,
          phone: phone.startsWith('254') ? phone : `254${phone.substring(1)}`, // Format to 254...
          status: 'pending',
        },
      });
    }

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
      AccountReference: 'Fiesta House',
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

      // Schedule timeout job for 60 seconds
      await this.paymentsQueue.add(
        'timeoutPayment',
        { paymentId: payment.id },
        {
          delay: 60000, // 60 seconds
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.logger.log(`Scheduled timeout for payment ${payment.id} in 60s`);

      return { checkoutRequestId: data.CheckoutRequestID, paymentId: payment.id };
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
      return;
    }

    if (ResultCode === 0 || ResultCode === '0') {
      // Success
      let receipt = '';
      if (CallbackMetadata && CallbackMetadata.Item) {
        const item = CallbackMetadata.Item.find((i: any) => i.Name === 'MpesaReceiptNumber');
        if (item) receipt = item.Value;
      }
      await this.confirmPayment(payment, receipt);
    } else {
      // Failed
      await this.handlePaymentFailure(payment, ResultDesc, ResultCode);
    }
  }

  async handlePaymentWebhook(checkoutRequestId: string, status: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { checkoutRequestId },
      include: { bookingDraft: { include: { customer: true } } },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for webhook CheckoutRequestID: ${checkoutRequestId}`);
      return;
    }

    if (status === 'success') {
      // For webhook, we might not have the receipt, so we use a placeholder or generic one
      await this.confirmPayment(payment, 'ConfirmedViaWebhook');
    } else {
      await this.handlePaymentFailure(payment, 'Failed via webhook update');
    }
  }

  private async confirmPayment(payment: any, receipt: string) {
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
          recipientName: draft.recipientName || draft.customer.name, // Fallback to customer name
          recipientPhone: draft.recipientPhone || draft.customer.phone, // Fallback to customer phone
        },
        include: { customer: true }, // Include customer for confirmation message
      });

      // Delete the draft
      await this.prisma.bookingDraft.delete({
        where: { id: draft.id },
      });

      // SCHEDULE REMINDERS
      const bookingDate = DateTime.fromJSDate(booking.dateTime);
      const scheduledReminders: Array<{ days: number; dateTime: DateTime }> = [];
      const reminderConfigs = [
        { days: 2, label: '2' },
        { days: 1, label: '1' },
      ];

      for (const { days, label } of reminderConfigs) {
        const reminderTime = bookingDate.minus({ days });
        const delay = reminderTime.diffNow().as('milliseconds');
        if (delay > 0) {
          scheduledReminders.push({ days, dateTime: reminderTime });
        }
      }

      // Format and send comprehensive confirmation message
      const confirmationMessage = await this.bookingsService.formatBookingConfirmationMessage(
        booking,
        receipt,
        scheduledReminders,
      );

      // Send directly via WhatsApp (not via sendOutboundMessage which doesn't actually send)
      if (draft.customer?.whatsappId) {
        await this.whatsappService.sendMessage(draft.customer.whatsappId, confirmationMessage);
        this.logger.log(`Booking confirmation sent to WhatsApp: ${draft.customer.whatsappId}`);
      } else {
        this.logger.warn(`No WhatsApp ID found for customer ${draft.customerId}, confirmation not sent`);
      }

      // Actually schedule the reminder jobs
      for (const { days, dateTime } of scheduledReminders) {
        const delay = dateTime.diffNow().as('milliseconds');
        await this.aiQueue.add(
          'sendReminder',
          {
            customerId: draft.customerId,
            bookingId: booking.id,
            date: draft.date,
            time: draft.time,
            recipientName: draft.recipientName || draft.name,
            daysBefore: days.toString(),
          },
          {
            delay,
            removeOnComplete: true,
            removeOnFail: true,
          }
        );
        this.logger.log(`Reminder scheduled for: ${dateTime.toISO()} (${days} days before)`);
      }

      // Create notifications
      try {
        await this.notificationsService.createNotification({
          type: 'payment',
          title: `Payment Received - KSH ${payment.amount}`,
          message: `Deposit of KSH ${payment.amount.toLocaleString()} received from ${draft.customer.name || 'Customer'} (Receipt: ${receipt})`,
          metadata: {
            amount: payment.amount,
            receipt: receipt,
            customerName: draft.customer.name,
            customerId: draft.customerId,
            bookingId: booking.id,
          },
        });

        const bookingDateTime = DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
        await this.notificationsService.createNotification({
          type: 'booking',
          title: `New Booking - ${draft.service}`,
          message: `${draft.customer.name || 'Customer'} booked ${draft.service} on ${bookingDateTime.toFormat('LLL dd, yyyy')} at ${bookingDateTime.toFormat('h:mm a')}`,
          metadata: {
            bookingId: booking.id,
            customerId: draft.customerId,
            customerName: draft.customer.name,
            service: draft.service,
            dateTime: booking.dateTime.toISOString(),
            recipientName: draft.recipientName,
            recipientPhone: draft.recipientPhone,
          },
        });
      } catch (notifError) {
        this.logger.error(`Failed to create notifications for booking ${booking.id}`, notifError);
      }

      this.logger.log(`Booking ${booking.id} confirmed from draft ${draft.id}`);
    }

    this.logger.log(`Payment ${payment.id} confirmed: ${receipt}`);
  }

  private async handlePaymentFailure(payment: any, reason: string, resultCode?: number | string) {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    });
    this.logger.error(`Payment failed for ${payment.id}: ${reason}`);

    // Notify user about failure
    if (payment.bookingDraft) {
      let userMessage = "We couldn't process your payment. Please try again.";

      if (resultCode) {
        if (resultCode === 11 || resultCode === '11') {
          userMessage = "It seems your payment failed because of a pending transaction on your phone. Please check your phone for any open M-Pesa prompts, cancel them if needed, and then try again. 📲";
        } else if (resultCode === 1032 || resultCode === '1032') {
          userMessage = "You cancelled the payment request. If this was a mistake, you can try again anytime! 💖";
        } else if (resultCode === 1 || resultCode === '1') {
          userMessage = "The balance was insufficient for the transaction. Please top up and try again. 💰";
        } else {
          userMessage = `Payment failed: ${reason}. Please try again.`;
        }
      } else {
        userMessage = `Payment failed: ${reason}. Please try again.`;
      }

      await this.messagesService.sendOutboundMessage(
        payment.bookingDraft.customerId,
        userMessage,
        'whatsapp'
      );
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
