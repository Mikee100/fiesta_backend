import { Injectable } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { CustomersService } from '../customers/customers.service';
import { AiService } from '../ai/ai.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WebsocketGateway } from '../../websockets/websocket.gateway';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { InstagramService } from '../instagram/instagram.service';
import { MessengerSendService } from './messenger-send.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DateTime } from 'luxon';

@Injectable()
export class WebhooksService {
  constructor(
    private messagesService: MessagesService,
    private customersService: CustomersService,
    private aiService: AiService,
    private aiSettingsService: AiSettingsService,
    private bookingsService: BookingsService,
    private paymentsService: PaymentsService,
    private whatsappService: WhatsappService,
    private instagramService: InstagramService,
    private messengerSendService: MessengerSendService,
    @InjectQueue('messageQueue') private messageQueue: Queue,
    private websocketGateway: WebsocketGateway,
    private notificationsService?: NotificationsService,
  ) { }
  async handleWhatsAppWebhook(body: any) {
    if (body.object !== 'whatsapp_business_account') {
      return { status: 'ignored' };
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {

        const value = change.value;

        // PROCESS ONLY IF THERE ARE MESSAGE OBJECTS INSIDE
        if (value?.messages && value.messages.length > 0) {
          await this.processWhatsAppMessage(value);
        }
      }
    }

    return { status: 'ok' };
  }

  async processWhatsAppMessage(value: any) {
    console.log('[AI DEBUG] processWhatsAppMessage called', JSON.stringify(value));
    const messages = value?.messages;
    if (!messages || messages.length === 0) {
      console.log('No messages in webhook payload - ignoring');
      return;
    }

    const message = messages[0];
    const from = message.from;
    const text = message.text?.body;
    const messageId = message.id;

    // Ignore echo/bot messages (sent by the bot itself)
    if (message.type === 'system' || message.from === 'whatsapp_bot' || message.is_echo) {
      console.log('Ignoring echo/bot message (sent by bot)');
      return;
    }

    console.log('Message type:', message.type, 'ID:', message.id);

    if (!text) {
      console.log("Ignoring non-text message");
      return;
    }


    // Find or create customer (and debug log)
    let customer = await this.customersService.findByWhatsappId(from);
    if (customer) {
      console.log(`[AI DEBUG] WhatsApp: customerId=${customer.id}, aiEnabled=${customer.aiEnabled}`);
    } else {
      console.log(`[AI DEBUG] WhatsApp: customer not found for from=${from}`);
      console.log("Creating customer:", from);
      customer = await this.customersService.create({
        name: `WhatsApp User ${from}`,
        whatsappId: from,
        phone: from,
        email: `${from}@whatsapp.local`,
      });
    }

    console.log('Received text message from', from, ':', text);

    // Check duplicates
    const existing = await this.messagesService.findByExternalId(messageId);
    if (existing) {
      console.log("Duplicate inbound message ignored");
      return;
    }

    // Save inbound message
    const created = await this.messagesService.create({
      content: text,
      platform: 'whatsapp',
      direction: 'inbound',
      customerId: customer.id,
      externalId: messageId,
    });

    console.log("Message saved:", created.id);

    // WebSocket
    this.websocketGateway.emitNewMessage('whatsapp', {
      id: created.id,
      from,
      to: '',
      content: text,
      timestamp: created.createdAt.toISOString(),
      direction: 'inbound',
      customerId: customer.id,
            // Removed check for booking.awaitingRescheduleTime (property does not exist)
    });

    // Automated reschedule flow for WhatsApp
    const intent = await this.messagesService.classifyIntent(text);
    if (intent === 'reschedule') {
      // Step 2: Find active booking(s)
      const bookings = await this.bookingsService.getActiveBookings(customer.id);
      if (!bookings || bookings.length === 0) {
        await this.whatsappService.sendMessage(from, `I couldn't find an active booking for you. Would you like to start a new booking?`);
        return;
      }
      // If multiple, ask which one
      let booking = bookings[0];
      if (bookings.length > 1) {
        await this.whatsappService.sendMessage(from, `You have multiple active bookings. Please reply with the date or service of the booking you want to reschedule.`);
        await this.bookingsService.setAwaitingRescheduleSelection(customer.id, true);
        return;
      }
      // Step 3: Check eligibility
      const now = new Date();
      const bookingTime = new Date(booking.dateTime);
      const hoursDiff = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (booking.status === 'completed' || booking.status === 'cancelled') {
        await this.whatsappService.sendMessage(from, `Your booking cannot be rescheduled as it is already completed or cancelled.`);
        return;
      }
      if (hoursDiff < 72) {
        // Create admin alert for reschedule request within 72 hours
        const bookingDt = DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
        if (this.notificationsService) {
          await this.notificationsService.createNotification({
            type: 'reschedule_request',
            title: 'Reschedule Request - Within 72 Hours',
            message: `Customer ${customer.name || customer.phone || from} requested to reschedule booking "${booking.service}" scheduled for ${bookingDt.toFormat('MMMM dd, yyyy')} at ${bookingDt.toFormat('h:mm a')}. Only ${Math.round(hoursDiff)} hours until booking.`,
            metadata: {
              customerId: customer.id,
              customerName: customer.name,
              customerPhone: customer.phone || from,
              bookingId: booking.id,
              hoursUntilBooking: Math.round(hoursDiff),
              originalDateTime: booking.dateTime,
              platform: 'whatsapp',
            },
          });
        }
        await this.whatsappService.sendMessage(from, `Rescheduling is only allowed at least 72 hours before your booking. Please contact support for urgent changes.`);
        return;
      }
      // Step 4: Prompt for new date/time or handle reschedule flow
      const isAwaitingRescheduleTime = await this.bookingsService.isAwaitingRescheduleTime(booking.id);
      if (!isAwaitingRescheduleTime) {
        await this.whatsappService.sendMessage(from, `Sure! Please reply with your new preferred date and time for your booking (e.g. '12th Dec, 3pm').`);
        await this.bookingsService.setAwaitingRescheduleTime(booking.id, true);
        return;
      } else {
        // Step 5: Validate new date/time
        const newTime = await this.aiService.extractDateTime(text);
        if (!newTime) {
          await this.whatsappService.sendMessage(from, `Sorry, I couldn't understand the new date/time. Please reply with your preferred date and time (e.g. '12th Dec, 3pm').`);
          return;
        }
        // Step 6: Check for conflicts
        const conflict = await this.bookingsService.checkTimeConflict(newTime);
        if (conflict) {
          await this.whatsappService.sendMessage(from, `That time is not available. Please choose another date and time.`);
          return;
        }
        // Step 7: Update booking
        await this.bookingsService.updateBookingTime(booking.id, newTime);
        await this.bookingsService.setAwaitingRescheduleTime(booking.id, false);
        await this.whatsappService.sendMessage(from, `Your booking has been rescheduled to ${newTime}. If you need further changes, let us know!`);
        // Step 8: End flow
        return;
      }
    }

    // Check if the user sent a phone number (Kenyan format)
    const phoneMatch = text.match(/0\d{9}/); // Matches 0721840961
    if (phoneMatch) {
      const newPhone = phoneMatch[0];
      console.log(`User provided new phone number: ${newPhone}`);

      // Update customer's phone
      await this.customersService.updatePhone(from, newPhone);

      // Check if there's a pending booking draft
      const draft = await this.bookingsService.getBookingDraft(customer.id);
      if (draft) {
        const depositAmount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;

        // Get package details for full price
        const packages = await this.aiService.getCachedPackages();
        const selectedPackage = packages.find(p => p.name === draft.service);
        const fullPrice = selectedPackage?.price || 0;

        // Send deposit confirmation message with all policies (don't initiate payment yet!)
        const confirmationMessage = `Perfect! I have your phone number: ${newPhone} 📱

📦 *${draft.service}*
💰 Full Price: KSH ${fullPrice.toLocaleString()}
💳 Deposit Required: KSH ${depositAmount.toLocaleString()}

📋 *Important Policies:*

💵 *Payment:*
• Remaining balance is due after the shoot

📸 *Photo Delivery:*
• Edited photos delivered in *10 working days*

⏰ *Cancellation/Rescheduling:*
• Must be made at least *72 hours* before your shoot time
• Changes within 72 hours are non-refundable
• Session fee will be forfeited for late cancellations

To confirm your booking and accept these terms, please reply with *"CONFIRM"* and I'll send the M-PESA payment prompt to your phone.

Or reply *"CANCEL"* if you'd like to make changes. 💖`;

        // Send directly via WhatsApp (not via sendOutboundMessage which doesn't actually send)
        await this.whatsappService.sendMessage(from, confirmationMessage);

        console.log(`Deposit confirmation sent to ${newPhone}. Waiting for user confirmation.`);
      }
    } else if (text.toLowerCase() === 'confirm') {
      // User confirmed deposit - now initiate payment
      const draft = await this.bookingsService.getBookingDraft(customer.id);
      if (draft) {
        const customerData = await this.customersService.findOne(customer.id);
        if (customerData?.phone) {
          const amount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;

          try {
            const checkoutId = await this.paymentsService.initiateSTKPush(draft.id, customerData.phone, amount);

            await this.whatsappService.sendMessage(
              from,
              `Payment request sent! Please check your phone and enter your M-PESA PIN to complete the deposit payment. 💳✨`
            );

            console.log(`STK Push initiated for ${customerData.phone}, CheckoutRequestID: ${checkoutId}`);
          } catch (error) {
            console.error('STK Push failed:', error);
            await this.whatsappService.sendMessage(
              from,
              `Sorry, there was an issue initiating payment. Please try again or contact us at ${process.env.CUSTOMER_CARE_PHONE || '0720 111928'}. 💖`
            );
          }
        } else {
          await this.whatsappService.sendMessage(
            from,
            `I don't have your phone number yet. Please share it so I can send the payment request. 📱`
          );
        }
      } else {
        await this.whatsappService.sendMessage(
          from,
          `I don't see a pending booking. Would you like to start a new booking? 💖`
        );
      }
    } else if (text.toLowerCase() === 'cancel') {
      // User wants to cancel/modify
      await this.whatsappService.sendMessage(
        from,
        `No problem! What would you like to change? You can:
• Choose a different package
• Pick a different date/time
• Start over

Just let me know! 💖`
      );
    } else {
      // Check both global AI and customer-specific AI before queuing
      const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
      const customerAiEnabled = customer.aiEnabled ?? true; // Default to true if not set

      if (globalAiEnabled && customerAiEnabled) {
        console.log("Queueing message for AI...");
        try {
          const job = await this.messageQueue.add("processMessage", { messageId: created.id });
          console.log(`[QUEUE DEBUG] Job added successfully: ${job.id}, messageId: ${created.id}`);
        } catch (error) {
          console.error('[QUEUE ERROR] Failed to add job to queue:', error);
          throw error;
        }
      } else {
        console.log('AI disabled (global or customer-specific) - message not queued');
      }
    }
  }


  async handleInstagramWebhook(data: any) {
    console.log('Processing Instagram webhook:', JSON.stringify(data, null, 2));

    if (!data.entry || data.entry.length === 0) {
      console.log('No entry in Instagram webhook payload');
      return; // No entries to process
    }

    const entry = data.entry[0];
    if (!entry.messaging || entry.messaging.length === 0) {
      console.log('No messaging in Instagram webhook entry');
      return; // No messages to process
    }

    const message = entry.messaging[0];
    console.log('Instagram message type:', message.message?.text ? 'text' : 'other');

    // Ignore echo messages (messages sent by the bot itself)
    if (message.message?.is_echo) {
      console.log('Ignoring echo message (sent by bot)');
      return;
    }

    if (message.message?.text) {
      const from = message.sender.id;
      const text = message.message.text;
      console.log('Received Instagram text message from', from, ':', text);

      // Find or create customer
      let customer = await this.customersService.findByInstagramId(from);
      if (!customer) {
        console.log('Creating new customer for Instagram ID:', from);
        customer = await this.customersService.create({
          name: `Instagram User ${from}`,
          email: `${from}@instagram.local`,
          instagramId: from,
        });
      }

      console.log('Customer found/created:', customer.id);

      // Update lastInstagramMessageAt for 24hr window tracking
      await this.customersService.updateLastInstagramMessageAt(from, new Date());
      console.log('✅ Updated lastInstagramMessageAt for 24-hour window tracking');

      // Create inbound message
      const createdMessage = await this.messagesService.create({
        content: text,
        platform: 'instagram',
        direction: 'inbound',
        customerId: customer.id,
      });

      console.log('Instagram message created in database:', createdMessage.id);

      // Emit real-time update via WebSocket for inbound message
      this.websocketGateway.emitNewMessage('instagram', {
        id: createdMessage.id,
        from: from,
        to: '',
        content: text,
        timestamp: createdMessage.createdAt.toISOString(),
        direction: 'inbound',
        customerId: customer.id,
        customerName: customer.name,
      });

        // Automated reschedule flow
          const intent = await this.messagesService.classifyIntent(text);
          if (intent === 'reschedule') {
            // Step 2: Find active booking(s)
            const bookings = await this.bookingsService.getActiveBookings(customer.id);
            if (!bookings || bookings.length === 0) {
              await this.instagramService.sendMessage(from, `I couldn’t find an active booking for you. Would you like to start a new booking?`);
              return;
            }
            // If multiple, ask which one
            let booking = bookings[0];
            if (bookings.length > 1) {
              await this.instagramService.sendMessage(from, `You have multiple active bookings. Please reply with the date or service of the booking you want to reschedule.`);
              await this.bookingsService.setAwaitingRescheduleSelection(customer.id, true);
              return;
            }
            // Step 3: Check eligibility
            const now = new Date();
            const bookingTime = new Date(booking.dateTime);
            const hoursDiff = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (booking.status === 'completed' || booking.status === 'cancelled') {
              await this.instagramService.sendMessage(from, `Your booking cannot be rescheduled as it is already completed or cancelled.`);
              return;
            }
                if (hoursDiff < 72) {
                    // Create admin alert for reschedule request within 72 hours
                    const bookingDt = DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
                    if (this.notificationsService) {
                        await this.notificationsService.createNotification({
                            type: 'reschedule_request',
                            title: 'Reschedule Request - Within 72 Hours',
                            message: `Customer ${customer.name || customer.phone || from} requested to reschedule booking "${booking.service}" scheduled for ${bookingDt.toFormat('MMMM dd, yyyy')} at ${bookingDt.toFormat('h:mm a')}. Only ${Math.round(hoursDiff)} hours until booking.`,
                            metadata: {
                                customerId: customer.id,
                                customerName: customer.name,
                                customerPhone: customer.phone || from,
                                bookingId: booking.id,
                                hoursUntilBooking: Math.round(hoursDiff),
                                originalDateTime: booking.dateTime,
                                platform: 'instagram',
                            },
                        });
                    }
                    await this.instagramService.sendMessage(from, `Rescheduling is only allowed at least 72 hours before your booking. Please contact support for urgent changes.`);
                    return;
                }
            // Step 4: Prompt for new date/time or handle reschedule flow
            const isAwaitingRescheduleTime = await this.bookingsService.isAwaitingRescheduleTime(booking.id);
            if (!isAwaitingRescheduleTime) {
              await this.instagramService.sendMessage(from, `Sure! Please reply with your new preferred date and time for your booking (e.g. '12th Dec, 3pm').`);
              await this.bookingsService.setAwaitingRescheduleTime(booking.id, true);
              return;
            } else {
              // Step 5: Validate new date/time
              const newTime = await this.aiService.extractDateTime(text);
              if (!newTime) {
                await this.instagramService.sendMessage(from, `Sorry, I couldn’t understand the new date/time. Please reply with your preferred date and time (e.g. '12th Dec, 3pm').`);
                return;
              }
              // Step 6: Check for conflicts
              const conflict = await this.bookingsService.checkTimeConflict(newTime);
              if (conflict) {
                await this.instagramService.sendMessage(from, `That time is not available. Please choose another date and time.`);
                return;
              }
              // Step 7: Update booking
              await this.bookingsService.updateBookingTime(booking.id, newTime);
              await this.bookingsService.setAwaitingRescheduleTime(booking.id, false);
              await this.instagramService.sendMessage(from, `Your booking has been rescheduled to ${newTime}. If you need further changes, let us know!`);
              // Step 8: End flow
              return;
            }
          }
      // Check both global AI and customer-specific AI before queuing
      const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
      const customerAiEnabled = customer.aiEnabled;

      // Debug: Log customerId and aiEnabled before AI queueing
      console.log(`[AI DEBUG] Instagram: customerId=${customer.id}, aiEnabled=${customer.aiEnabled}`);

      if (globalAiEnabled && customerAiEnabled) {
        // Queue the message for AI processing
        console.log('Adding Instagram message to queue for processing...');
        await this.messageQueue.add('processMessage', {
          messageId: createdMessage.id,
        });
        console.log('Instagram message added to queue successfully');
      } else {
        console.log('AI disabled (global or customer-specific) - Instagram message not queued');
      }
    }
  }

  async verifyInstagramWebhook(mode: string, challenge: string, token: string) {
    if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
      return challenge;
    }
    return 'ERROR';
  }

  async handleMessengerWebhook(data: any) {
    console.log('Processing Messenger webhook:', JSON.stringify(data, null, 2));

    if (!data.object || data.object !== 'page' || !Array.isArray(data.entry)) {
      console.log('No valid page object or entries in Messenger webhook payload');
      return;
    }

    for (const entry of data.entry) {
      if (!Array.isArray(entry.messaging)) continue;

      for (const event of entry.messaging) {
        const senderId = event.sender?.id;
        const message = event.message;

        // Ignore echo messages (messages sent by the bot itself)
        if (message?.is_echo) {
          console.log('Ignoring echo message (sent by bot)');
          continue;
        }

        if (!senderId || !message || !message.mid || !message.text) {
          console.log("Ignoring non-text message or missing data");
          continue;
        }

        const text = message.text;
        console.log('Received Messenger text message from', senderId, ':', text);

        // Find or create customer
        let customer = await this.customersService.findByMessengerId(senderId);
        if (!customer) {
          console.log('Creating new customer for Messenger ID:', senderId);
          customer = await this.customersService.create({
            name: `Messenger User ${senderId}`,
            email: `${senderId}@messenger.local`,
            messengerId: senderId,
          });
        }

        console.log('Customer found/created:', customer.id);

        // Update lastMessengerMessageAt for 24hr window tracking
        await this.customersService.updateLastMessengerMessageAt(senderId, new Date());
        console.log('✅ Updated lastMessengerMessageAt for 24-hour window tracking');

        // Check duplicates
        const existing = await this.messagesService.findByExternalId(message.mid);
        if (existing) {
          console.log("Duplicate inbound message ignored");
          return;
        }

        // Save inbound message
        const createdMessage = await this.messagesService.create({
          content: text,
          platform: 'messenger',
          direction: 'inbound',
          customerId: customer.id,
          externalId: message.mid,
        });

        console.log('Messenger message created in database:', createdMessage.id);

        // Emit real-time update via WebSocket for inbound message
        this.websocketGateway.emitNewMessage('messenger', {
          id: createdMessage.id,
          from: senderId,
          to: '',
          content: text,
          timestamp: createdMessage.createdAt.toISOString(),
          direction: 'inbound',
          customerId: customer.id,
          customerName: customer.name,
        });

        // Automated reschedule flow for Messenger
        const intent = await this.messagesService.classifyIntent(text);
        if (intent === 'reschedule') {
          // Step 2: Find active booking(s)
          const bookings = await this.bookingsService.getActiveBookings(customer.id);
          if (!bookings || bookings.length === 0) {
            await this.messengerSendService.sendMessage(senderId, `I couldn't find an active booking for you. Would you like to start a new booking?`);
            return;
          }
          // If multiple, ask which one
          let booking = bookings[0];
          if (bookings.length > 1) {
            await this.messengerSendService.sendMessage(senderId, `You have multiple active bookings. Please reply with the date or service of the booking you want to reschedule.`);
            await this.bookingsService.setAwaitingRescheduleSelection(customer.id, true);
            return;
          }
          // Step 3: Check eligibility
          const now = new Date();
          const bookingTime = new Date(booking.dateTime);
          const hoursDiff = (bookingTime.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (booking.status === 'completed' || booking.status === 'cancelled') {
            await this.messengerSendService.sendMessage(senderId, `Your booking cannot be rescheduled as it is already completed or cancelled.`);
            return;
          }
          if (hoursDiff < 72) {
            // Create admin alert for reschedule request within 72 hours
            const bookingDt = DateTime.fromJSDate(booking.dateTime).setZone('Africa/Nairobi');
            if (this.notificationsService) {
                await this.notificationsService.createNotification({
                    type: 'reschedule_request',
                    title: 'Reschedule Request - Within 72 Hours',
                    message: `Customer ${customer.name || customer.phone || senderId} requested to reschedule booking "${booking.service}" scheduled for ${bookingDt.toFormat('MMMM dd, yyyy')} at ${bookingDt.toFormat('h:mm a')}. Only ${Math.round(hoursDiff)} hours until booking.`,
                    metadata: {
                        customerId: customer.id,
                        customerName: customer.name,
                        customerPhone: customer.phone || senderId,
                        bookingId: booking.id,
                        hoursUntilBooking: Math.round(hoursDiff),
                        originalDateTime: booking.dateTime,
                        platform: 'messenger',
                    },
                });
            }
            await this.messengerSendService.sendMessage(senderId, `Rescheduling is only allowed at least 72 hours before your booking. Please contact support for urgent changes.`);
            return;
          }
          // Step 4: Prompt for new date/time or handle reschedule flow
          const isAwaitingRescheduleTime = await this.bookingsService.isAwaitingRescheduleTime(booking.id);
          if (!isAwaitingRescheduleTime) {
            await this.messengerSendService.sendMessage(senderId, `Sure! Please reply with your new preferred date and time for your booking (e.g. '12th Dec, 3pm').`);
            await this.bookingsService.setAwaitingRescheduleTime(booking.id, true);
            return;
          } else {
            // Step 5: Validate new date/time
            const newTime = await this.aiService.extractDateTime(text);
            if (!newTime) {
              await this.messengerSendService.sendMessage(senderId, `Sorry, I couldn't understand the new date/time. Please reply with your preferred date and time (e.g. '12th Dec, 3pm').`);
              return;
            }
            // Step 6: Check for conflicts
            const conflict = await this.bookingsService.checkTimeConflict(newTime);
            if (conflict) {
              await this.messengerSendService.sendMessage(senderId, `That time is not available. Please choose another date and time.`);
              return;
            }
            // Step 7: Update booking
            await this.bookingsService.updateBookingTime(booking.id, newTime);
            await this.bookingsService.setAwaitingRescheduleTime(booking.id, false);
            await this.messengerSendService.sendMessage(senderId, `Your booking has been rescheduled to ${newTime}. If you need further changes, let us know!`);
            // Step 8: End flow
            return;
          }
        }

        // Check if the user sent a phone number (Kenyan format)
        const phoneMatch = text.match(/0\d{9}/); // Matches 0721840961
        if (phoneMatch) {
          const newPhone = phoneMatch[0];
          console.log(`User provided new phone number: ${newPhone}`);

          // Update customer's phone
          await this.customersService.updatePhoneByMessengerId(senderId, newPhone);

          // Check if there's a pending booking draft
          const draft = await this.bookingsService.getBookingDraft(customer.id);
          if (draft) {
            const depositAmount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;

            // Get package details for full price
            const packages = await this.aiService.getCachedPackages();
            const selectedPackage = packages.find(p => p.name === draft.service);
            const fullPrice = selectedPackage?.price || 0;

            // Send deposit confirmation message with all policies (don't initiate payment yet!)
            const confirmationMessage = `Perfect! I have your phone number: ${newPhone} 📱

📦 *${draft.service}*
💰 Full Price: KSH ${fullPrice.toLocaleString()}
💳 Deposit Required: KSH ${depositAmount.toLocaleString()}

📋 *Important Policies:*

💵 *Payment:*
• Remaining balance is due after the shoot

📸 *Photo Delivery:*
• Edited photos delivered in *10 working days*

⏰ *Cancellation/Rescheduling:*
• Must be made at least *72 hours* before your shoot time
• Changes within 72 hours are non-refundable
• Session fee will be forfeited for late cancellations

To confirm your booking and accept these terms, please reply with *"CONFIRM"* and I'll send the M-PESA payment prompt to your phone.

Or reply *"CANCEL"* if you'd like to make changes. 💖`;

            // Send directly via Messenger
            await this.messengerSendService.sendMessage(senderId, confirmationMessage);

            console.log(`Deposit confirmation sent to ${newPhone}. Waiting for user confirmation.`);
          }
        } else if (text.toLowerCase() === 'confirm') {
          // User confirmed deposit - now initiate payment
          const draft = await this.bookingsService.getBookingDraft(customer.id);
          if (draft) {
            const customerData = await this.customersService.findOne(customer.id);
            if (customerData?.phone) {
              const amount = await this.bookingsService.getDepositForDraft(customer.id) || 2000;

              try {
                const checkoutId = await this.paymentsService.initiateSTKPush(draft.id, customerData.phone, amount);

                await this.messengerSendService.sendMessage(
                  senderId,
                  `Payment request sent! Please check your phone and enter your M-PESA PIN to complete the deposit payment. 💳✨`
                );

                console.log(`STK Push initiated for ${customerData.phone}, CheckoutRequestID: ${checkoutId}`);
              } catch (error) {
                console.error('STK Push failed:', error);
                await this.messengerSendService.sendMessage(
                  senderId,
                  `Sorry, there was an issue initiating payment. Please try again or contact us at ${process.env.CUSTOMER_CARE_PHONE || '0720 111928'}. 💖`
                );
              }
            } else {
              await this.messengerSendService.sendMessage(
                senderId,
                `I don't have your phone number yet. Please share it so I can send the payment request. 📱`
              );
            }
          } else {
            await this.messengerSendService.sendMessage(
              senderId,
              `I don't see a pending booking. Would you like to start a new booking? 💖`
            );
          }
        } else if (text.toLowerCase() === 'cancel') {
          // User wants to cancel/modify
          await this.messengerSendService.sendMessage(
            senderId,
            `No problem! What would you like to change? You can:
• Choose a different package
• Pick a different date/time
• Start over

Just let me know! 💖`
          );
        } else {
          // Check both global AI and customer-specific AI before queuing
          const globalAiEnabled = await this.aiSettingsService.isAiEnabled();
          const customerAiEnabled = customer.aiEnabled ?? true; // Default to true if not set

          if (globalAiEnabled && customerAiEnabled) {
            console.log("Queueing Messenger message for AI...");
            await this.messageQueue.add("processMessage", { messageId: createdMessage.id });
          } else {
            console.log('AI disabled (global or customer-specific) - Messenger message not queued');
          }
        }
      }
    }

    return { status: 'ok' };
  }

  async handleTelegramWebhook(data: any) {
    // Similar
    const message = data.message;
    const from = message.from.id;
    const text = message.text;

    let customer = await this.customersService.findByEmail(`${from}@telegram.org`);
    if (!customer) {
      customer = await this.customersService.create({
        name: `Telegram User ${from}`,
        email: `${from}@telegram.org`,
      });
    }

    await this.messagesService.create({
      content: text,
      platform: 'telegram',
      direction: 'inbound',
      customerId: customer.id,
    });

    const intent = await this.messagesService.classifyIntent(text);
    if (intent === 'faq') {
      const answer = await this.aiService.answerFaq(text);
      console.log('Send Telegram response:', answer);
    }
  }
}
