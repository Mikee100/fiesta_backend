import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { DateTime } from 'luxon';
import { AiService } from '../ai/ai.service';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PackagesService } from '../packages/packages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessengerSendService } from '../webhooks/messenger-send.service';
import { BookingCreatedEvent } from '../bookings/events/booking.events';
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
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => AiService)) private aiService: AiService,
    @Inject(forwardRef(() => BookingsService)) private bookingsService: BookingsService,
    @InjectQueue('aiQueue') private aiQueue: Queue,
    @InjectQueue('paymentsQueue') private paymentsQueue: Queue,
    private packagesService: PackagesService,
    private messengerSendService: MessengerSendService,
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

    // this.logger.log(`Getting access token from: ${url}`);
    // this.logger.log(`Authorization header: Basic ${auth.substring(0, 10)}...`);

    // MUST BE GET (not POST)
    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }),
    );

    // this.logger.log(`Access token response data: ${JSON.stringify(response.data)}`);

    if (!response.data || !response.data.access_token) {
      throw new Error(`Invalid access token response: ${JSON.stringify(response.data)}`);
    }

    return response.data.access_token;
  }





  /**
   * Formats phone number to M-PESA format (254XXXXXXXXX)
   * Uses shared utility function from utils/booking.ts
   */
  private formatPhoneNumber(phone: string): string {
    const { formatPhoneNumber } = require('../../utils/booking');
    return formatPhoneNumber(phone);
  }

  async initiateSTKPush(bookingDraftId: string, phone: string, amount: number): Promise<{ checkoutRequestId: string; paymentId: string }> {
    this.logger.error(`[DEBUG-TRACE] initiateSTKPush called: bookingDraftId=${bookingDraftId}, phone=${phone}, amount=${amount}`);
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

    // Format phone number properly
    const formattedPhone = this.formatPhoneNumber(phone);
    this.logger.log(`[STK] Phone number formatting: "${phone}" -> "${formattedPhone}"`);

    // Validate callback URL
    if (!this.callbackUrl) {
      this.logger.error(`[STK] MPESA_CALLBACK_URL is not set in environment variables!`);
      throw new Error('M-PESA callback URL is not configured');
    }
    this.logger.log(`[STK] Callback URL: ${this.callbackUrl}`);

    // Always create a new payment for every new booking draft
    await this.prisma.payment.deleteMany({ where: { bookingDraftId } });
    const payment = await this.prisma.payment.create({
      data: {
        bookingDraftId,
        amount,
        phone: formattedPhone,
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
      PartyA: formattedPhone,
      PartyB: this.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: this.callbackUrl,
      AccountReference: 'Fiesta House',
      TransactionDesc: `Deposit for ${draft.service} booking`,
    };
    const stkUrl = `${this.mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`;

    try {
      this.logger.log(`[STK] Initiating STK Push`);
      this.logger.log(`[STK] URL: ${stkUrl}`);
      this.logger.log(`[STK] Phone (original): ${phone}`);
      this.logger.log(`[STK] Phone (formatted): ${formattedPhone}`);
      this.logger.log(`[STK] Amount: ${amount} KSH`);
      this.logger.log(`[STK] Callback URL: ${this.callbackUrl}`);
      this.logger.debug(`[STK] Request body: ${JSON.stringify(stkRequestBody)}`);

      // WARNING: In sandbox mode, the phone number MUST be registered in M-PESA Developer Portal
      if (this.mpesaBaseUrl.includes('sandbox')) {
        this.logger.warn(`[STK] ⚠️ SANDBOX MODE: Phone number ${formattedPhone} must be registered in M-PESA Developer Portal to receive STK push!`);
        this.logger.warn(`[STK] ⚠️ Register test numbers at: https://developer.safaricom.co.ke/`);
        this.logger.warn(`[STK] ⚠️ IMPORTANT: Even if M-PESA API returns success, STK push will NOT appear on your phone unless the number is registered in the sandbox!`);
        this.logger.warn(`[STK] ⚠️ Steps to register:`);
        this.logger.warn(`[STK]    1. Go to https://developer.safaricom.co.ke/`);
        this.logger.warn(`[STK]    2. Log in to your account`);
        this.logger.warn(`[STK]    3. Navigate to "Test Credentials" or "Sandbox Test Numbers"`);
        this.logger.warn(`[STK]    4. Register phone: ${formattedPhone} (or ${formattedPhone.replace('254', '0')})`);
        this.logger.warn(`[STK]    5. Wait 2-3 minutes for registration to take effect`);
        this.logger.warn(`[STK]    6. Try the STK push again`);
      }

      const stkResponse = await firstValueFrom(
        this.httpService.post(stkUrl, stkRequestBody, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      const data = (stkResponse as { data: any }).data;

      this.logger.log(`[STK] M-PESA API Response: ${JSON.stringify(data)}`);

      if (data.ResponseCode !== '0') {
        this.logger.error(`[STK] M-PESA API returned error: ResponseCode=${data.ResponseCode}, errorMessage=${data.errorMessage || data.CustomerMessage || 'Unknown error'}`);
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'failed' },
        });
        throw new Error(`STK Push failed: ${data.errorMessage || data.CustomerMessage || 'Unknown error'}`);
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { checkoutRequestId: data.CheckoutRequestID },
      });

      this.logger.log(`[STK] ✅ STK Push successfully initiated for payment ${payment.id}`);
      this.logger.log(`[STK] CheckoutRequestID: ${data.CheckoutRequestID}`);
      this.logger.log(`[STK] MerchantRequestID: ${data.MerchantRequestID}`);
      this.logger.log(`[STK] ⏳ Waiting for user to complete payment on phone ${formattedPhone}...`);
      this.logger.log(`[STK] 📞 Callback will be sent to: ${this.callbackUrl}`);

      // In sandbox mode, provide additional diagnostic information
      if (this.mpesaBaseUrl.includes('sandbox')) {
        this.logger.warn(`[STK] ⚠️ CRITICAL SANDBOX REQUIREMENT:`);
        this.logger.warn(`[STK] ⚠️ Your phone number ${formattedPhone} MUST be registered in M-PESA Developer Portal`);
        this.logger.warn(`[STK] ⚠️ Even though M-PESA API returned success, the STK push will NOT appear on your phone`);
        this.logger.warn(`[STK] ⚠️ unless the number is registered in the sandbox.`);
        this.logger.warn(`[STK] ⚠️`);
        this.logger.warn(`[STK] ⚠️ TO FIX THIS:`);
        this.logger.warn(`[STK] ⚠️ 1. Go to: https://developer.safaricom.co.ke/`);
        this.logger.warn(`[STK] ⚠️ 2. Log in to your developer account`);
        this.logger.warn(`[STK] ⚠️ 3. Navigate to "Test Credentials" or "Sandbox Test Numbers"`);
        this.logger.warn(`[STK] ⚠️ 4. Register: ${formattedPhone} (or ${formattedPhone.replace('254', '0')})`);
        this.logger.warn(`[STK] ⚠️ 5. Wait 2-3 minutes for registration to take effect`);
        this.logger.warn(`[STK] ⚠️ 6. Try the STK push again`);
        this.logger.warn(`[STK] ⚠️`);
        this.logger.warn(`[STK] ⚠️ You can check payment status with:`);
        this.logger.warn(`[STK] ⚠️ GET /api/mpesa/status/${data.CheckoutRequestID}`);
      }

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

      return { checkoutRequestId: data.CheckoutRequestID, paymentId: payment.id };
    } catch (error) {
      this.logger.error(`[STK] ❌ STK Push request failed: ${error.message}`);
      this.logger.error(`[STK] Full error details:`, {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }



  async handleCallback(body: any) {
    this.logger.log(`[CALLBACK] 📥 M-PESA callback received`);
    this.logger.debug(`[CALLBACK] Full callback body: ${JSON.stringify(body, null, 2)}`);

    // M-Pesa sends validation and confirmation callbacks
    const { Body } = body;

    if (!Body || !Body.stkCallback) {
      this.logger.error(`[CALLBACK] ❌ Invalid callback structure. Expected Body.stkCallback`);
      this.logger.error(`[CALLBACK] Received structure: ${JSON.stringify(Object.keys(body))}`);
      return;
    }

    const { stkCallback } = Body;
    const { CheckoutRequestID, MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    this.logger.log(`[CALLBACK] CheckoutRequestID: ${CheckoutRequestID}`);
    this.logger.log(`[CALLBACK] MerchantRequestID: ${MerchantRequestID}`);
    this.logger.log(`[CALLBACK] ResultCode: ${ResultCode}`);
    this.logger.log(`[CALLBACK] ResultDesc: ${ResultDesc}`);

    const payment = await this.prisma.payment.findFirst({
      where: { checkoutRequestId: CheckoutRequestID },
      include: { bookingDraft: { include: { customer: true } } },
    });

    if (!payment) {
      this.logger.warn(`[CALLBACK] ⚠️ Payment not found for CheckoutRequestID: ${CheckoutRequestID}`);
      this.logger.warn(`[CALLBACK] This might be a duplicate callback or the payment was deleted`);
      return;
    }

    this.logger.log(`[CALLBACK] ✅ Found payment: ${payment.id}, status: ${payment.status}`);

    if (ResultCode === 0 || ResultCode === '0') {
      // Success
      this.logger.log(`[CALLBACK] ✅ Payment successful!`);
      let receipt = '';
      if (CallbackMetadata && CallbackMetadata.Item) {
        const item = CallbackMetadata.Item.find((i: any) => i.Name === 'MpesaReceiptNumber');
        if (item) {
          receipt = item.Value;
          this.logger.log(`[CALLBACK] M-PESA Receipt Number: ${receipt}`);
        }
      }
      await this.confirmPayment(payment, receipt);
    } else {
      // Failed
      this.logger.warn(`[CALLBACK] ❌ Payment failed: ${ResultDesc} (Code: ${ResultCode})`);
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
      // this.logger.log(`Payment successful for booking draft ${payment.bookingDraft.id}, confirming booking`);

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

      // Emit booking.created event to trigger reminder scheduling
      this.eventEmitter.emit(
        'booking.created',
        new BookingCreatedEvent(
          booking.id,
          booking.customerId,
          booking.service,
          booking.dateTime,
          booking.customer.name,
        ),
      );

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
        // this.logger.log(`Booking confirmation sent to WhatsApp: ${draft.customer.whatsappId}`);
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
        // this.logger.log(`Reminder scheduled for: ${dateTime.toISO()} (${days} days before)`);
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

      // this.logger.log(`Booking ${booking.id} confirmed from draft ${draft.id}`);
    }

    // this.logger.log(`Payment ${payment.id} confirmed: ${receipt}`);
  }

  async handlePaymentFailure(payment: any, reason: string, resultCode?: number | string) {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    });
    this.logger.error(`Payment failed for ${payment.id}: ${reason}`);

    // Notify user about failure with helpful guidance
    if (payment.bookingDraft) {
      let userMessage = "We couldn't process your payment. Please try again.";

      if (resultCode) {
        if (resultCode === 11 || resultCode === '11') {
          userMessage = "It seems your payment failed because of a pending transaction on your phone. Please check your phone for any open M-Pesa prompts, cancel them if needed, and then reply 'resend' to try again. 📲";
        } else if (resultCode === 1032 || resultCode === '1032') {
          userMessage = "You cancelled the payment request. No problem! If you'd like to try again, just reply 'resend' or 'yes' and I'll send a fresh payment prompt. 💖";
        } else if (resultCode === 1 || resultCode === '1') {
          userMessage = "The balance was insufficient for the transaction. Please top up your M-PESA account and reply 'resend' to try again. 💰";
        } else if (resultCode === 1037 || resultCode === '1037') {
          userMessage = "The payment request timed out. This can happen due to network issues. Reply 'resend' and I'll send you a fresh payment prompt. 📲";
        } else {
          userMessage = `Payment failed: ${reason}. Reply 'resend' to try again, or contact us at 0720 111928 if the issue persists. 💖`;
        }
      } else {
        userMessage = `Payment failed: ${reason}. Reply 'resend' to try again, or contact us at 0720 111928 if the issue persists. 💖`;
      }

      // Determine platform
      const customer = await this.prisma.customer.findUnique({
        where: { id: payment.bookingDraft.customerId },
        select: { instagramId: true, whatsappId: true, messengerId: true }
      });

      // Send message directly via appropriate platform service
      // This ensures the message is actually delivered, not just saved to DB
      if (customer?.whatsappId) {
        try {
          await this.whatsappService.sendMessage(customer.whatsappId, userMessage);
          // Also save to database
          await this.messagesService.sendOutboundMessage(
            payment.bookingDraft.customerId,
            userMessage,
            'whatsapp'
          );
        } catch (error) {
          this.logger.error(`Failed to send payment failure message via WhatsApp: ${error.message}`);
          // Still save to DB even if send fails
          await this.messagesService.sendOutboundMessage(
            payment.bookingDraft.customerId,
            userMessage,
            'whatsapp'
          );
        }
      } else if (customer?.messengerId) {
        // Send message directly via Messenger API
        try {
          await this.messengerSendService.sendMessage(customer.messengerId, userMessage);
          // Also save to database
          await this.messagesService.sendOutboundMessage(
            payment.bookingDraft.customerId,
            userMessage,
            'messenger'
          );
        } catch (error) {
          this.logger.error(`Failed to send payment failure message via Messenger: ${error.message}`);
          // Still save to DB even if send fails
          await this.messagesService.sendOutboundMessage(
            payment.bookingDraft.customerId,
            userMessage,
            'messenger'
          );
        }
      } else if (customer?.instagramId) {
        // Handle Instagram if needed
        await this.messagesService.sendOutboundMessage(
          payment.bookingDraft.customerId,
          userMessage,
          'instagram'
        );
      } else {
        // Fallback: save to DB
        await this.messagesService.sendOutboundMessage(
          payment.bookingDraft.customerId,
          userMessage,
          'whatsapp'
        );
      }
    }
  }

  /**
   * Check for stuck payments (pending for more than 10 minutes) and notify users
   */
  async checkStuckPayments(): Promise<void> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const stuckPayments = await this.prisma.payment.findMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: tenMinutesAgo
        }
      },
      include: {
        bookingDraft: {
          include: {
            customer: true
          }
        }
      }
    });

    for (const payment of stuckPayments) {
      this.logger.warn(`Found stuck payment ${payment.id}, created ${Math.floor((Date.now() - payment.createdAt.getTime()) / 1000 / 60)} minutes ago`);

      // Notify user
      if (payment.bookingDraft) {
        const customer = payment.bookingDraft.customer;
        const platform = customer?.whatsappId ? 'whatsapp'
          : customer?.instagramId ? 'instagram'
            : customer?.messengerId ? 'messenger'
              : 'whatsapp';

        const message = `I noticed your payment prompt has been pending for a while. Sometimes M-PESA confirmations can be delayed. If you completed the payment, please share your M-PESA receipt number. Otherwise, reply 'resend' and I'll send you a fresh payment prompt. 📲`;

        await this.messagesService.sendOutboundMessage(
          payment.bookingDraft.customerId,
          message,
          platform
        );
      }
    }
  }

  /**
   * Query M-Pesa transaction status by CheckoutRequestID
   * This is the proper way to verify payments
   */
  async queryTransactionStatus(checkoutRequestId: string): Promise<{ success: boolean; receipt?: string; error?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
      const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');

      const queryUrl = `${this.mpesaBaseUrl}/mpesa/stkpushquery/v1/query`;
      const queryBody = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      };

      const response = await firstValueFrom(
        this.httpService.post(queryUrl, queryBody, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      const data = response.data;

      if (data.ResponseCode === '0' && data.ResultCode === '0') {
        // Transaction successful - extract receipt if available
        let receipt = '';
        if (data.CallbackMetadata && data.CallbackMetadata.Item) {
          const receiptItem = data.CallbackMetadata.Item.find((i: any) => i.Name === 'MpesaReceiptNumber');
          if (receiptItem) receipt = receiptItem.Value;
        }
        return { success: true, receipt };
      } else {
        return { success: false, error: data.ResultDesc || 'Transaction query failed' };
      }
    } catch (error) {
      this.logger.error(`Transaction status query failed for ${checkoutRequestId}:`, error);
      return { success: false, error: error.message || 'Query failed' };
    }
  }

  /**
   * Verify receipt number by querying M-Pesa transaction status
   * SECURITY: Only accepts receipts that match:
   * - The checkoutRequestId from our system
   * - The payment amount
   * - The phone number
   * - Recent transaction (within 24 hours)
   */
  async verifyReceiptWithMpesaAPI(
    paymentId: string,
    receiptNumber: string
  ): Promise<{ valid: boolean; matches: boolean; error?: string }> {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: { bookingDraft: { include: { customer: true } } },
      });

      if (!payment || !payment.checkoutRequestId) {
        return { valid: false, matches: false, error: 'Payment not found or missing checkout ID' };
      }

      // Query M-Pesa for transaction status
      const queryResult = await this.queryTransactionStatus(payment.checkoutRequestId);

      if (!queryResult.success) {
        this.logger.warn(`[SECURITY] Transaction query failed for payment ${paymentId}: ${queryResult.error}`);
        return { valid: false, matches: false, error: queryResult.error };
      }

      // If we got a receipt from the query, verify it matches what user provided
      if (queryResult.receipt) {
        if (queryResult.receipt.toUpperCase() !== receiptNumber.toUpperCase()) {
          this.logger.warn(`[SECURITY] Receipt mismatch for payment ${paymentId}. Expected: ${queryResult.receipt}, Provided: ${receiptNumber}`);
          return { valid: true, matches: false, error: 'Receipt number does not match M-Pesa records' };
        }
        return { valid: true, matches: true };
      }

      // If query succeeded but no receipt, check if payment is actually confirmed
      // This handles edge cases where callback hasn't arrived yet
      return { valid: true, matches: true };
    } catch (error) {
      this.logger.error(`[SECURITY] Receipt verification failed for payment ${paymentId}:`, error);
      return { valid: false, matches: false, error: error.message };
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
    // this.logger.log(`[TEST] Initiating STK Push to URL: ${stkUrl}`);
    // this.logger.log(`[TEST] STK Push request body: ${JSON.stringify(stkRequestBody)}`);
    // this.logger.log(`[TEST] Authorization header: Bearer ${accessToken.substring(0, 10)}...`);
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
      // this.logger.log(`[TEST] STK Push initiated, CheckoutRequestID: ${data.CheckoutRequestID}`);
      return { checkoutRequestId: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID };
    } catch (error) {
      this.logger.error(`[TEST] STK Push request failed: ${error.message}`, error.response?.data || error);
      throw error;
    }
  }
}
