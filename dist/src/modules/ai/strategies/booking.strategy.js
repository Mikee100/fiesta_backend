"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingStrategy = void 0;
class BookingStrategy {
    constructor() {
        this.priority = 10;
    }
    canHandle(intent, context) {
        const { hasDraft, message } = context;
        const wantsToRetryPayment = /^(resend|retry|try.*again|send.*again)$/i.test(message.trim()) ||
            /(resend|retry|try.*again|try.*payment|retry.*payment|lets.*retry|let.*retry|want.*retry|need.*retry|can.*retry).*(payment|prompt|mpesa)/i.test(message) ||
            /(payment|prompt|mpesa).*(resend|retry|try.*again)/i.test(message);
        if (wantsToRetryPayment) {
            return true;
        }
        const isRescheduleIntent = /\b(reschedul\w*)\b/i.test(message) ||
            /(i want to|i'd like to|i need to|can i|can we).*reschedule/i.test(message) ||
            /(change|move|modify).*(booking|appointment|date|time)/i.test(message);
        if (isRescheduleIntent) {
            return false;
        }
        const wantsToStartBooking = /(how.*(do|can).*(make|book|start|get|schedule).*(booking|appointment)|(i want|i'd like|i need|can i|please).*(to book|booking|appointment|make.*booking|schedule)|let.*book|start.*booking)/i.test(message);
        return hasDraft || intent === 'booking' || wantsToStartBooking;
    }
    async generateResponse(message, context) {
        const { aiService, logger, history, historyLimit, customerId, bookingsService, hasDraft, prisma } = context;
        const { DateTime } = require('luxon');
        let draft = await aiService.getOrCreateDraft(customerId);
        const wantsToRetryPayment = /^(resend|retry|try.*again|send.*again)$/i.test(message.trim()) ||
            /(resend|retry|try.*again|try.*payment|retry.*payment|lets.*retry|let.*retry|want.*retry|need.*retry|can.*retry).*(payment|prompt|mpesa)/i.test(message) ||
            /(payment|prompt|mpesa).*(resend|retry|try.*again)/i.test(message);
        if (draft && !wantsToRetryPayment) {
            const wasStale = await bookingsService.cleanupStaleDraft(customerId);
            if (wasStale) {
                logger.debug(`[STRATEGY] Stale draft detected and cleaned up for customer ${customerId}`);
                draft = null;
            }
        }
        if (draft && bookingsService) {
            const hasFailed = await bookingsService.hasFailedPayment(customerId);
            if (hasFailed) {
                const lower = message.toLowerCase();
                const isBookingRelated = /(how.*(do|can).*(make|book|start|get|schedule).*(booking|appointment)|(i want|i'd like|i need|can i|please).*(to book|booking|appointment|make.*booking|schedule)|let.*book|start.*booking)/i.test(message) ||
                    /(resend|retry|try.*again|try.*payment|retry.*payment|lets.*retry|let.*retry|want.*retry|need.*retry|can.*retry).*(payment|prompt|mpesa)/i.test(message) ||
                    /(payment|prompt|mpesa|deposit|confirm|booking|appointment|book|schedule|date|time|package)/i.test(lower);
                if (!isBookingRelated) {
                    logger.debug(`[STRATEGY] Draft has failed payment and message is not booking-related, skipping booking strategy`);
                    return null;
                }
            }
        }
        if (draft && (draft.step === 'reschedule' || draft.step === 'reschedule_confirm')) {
            logger.debug(`[STRATEGY] Draft is in reschedule mode (step: ${draft.step}), skipping booking strategy`);
            return null;
        }
        const lowerMessage = message.toLowerCase().trim();
        const isResendRequest = /^(resend|retry|try.*again|send.*again)$/i.test(message.trim()) ||
            /(resend|retry|try.*again|try.*payment|retry.*payment|lets.*retry|let.*retry|want.*retry|need.*retry|can.*retry).*(payment|prompt|mpesa)/i.test(message) ||
            /(payment|prompt|mpesa).*(resend|retry|try.*again)/i.test(message);
        if (isResendRequest) {
            logger.debug(`[PAYMENT] User requesting to resend payment prompt - handling immediately`);
            const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
            if (latestPayment && (latestPayment.status === 'failed' || latestPayment.status === 'pending')) {
                logger.debug(`[PAYMENT] Found ${latestPayment.status} payment, resending prompt`);
                const result = await bookingsService.resendPaymentPrompt(customerId);
                return {
                    response: result.message,
                    draft: draft || null,
                    updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: result.message }]
                };
            }
            else if (!latestPayment) {
                if (!draft) {
                    return {
                        response: "I don't see any pending payment to retry. Would you like to start a new booking? Just let me know what package you're interested in! 💖",
                        draft: null,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I don't see any pending payment to retry. Would you like to start a new booking? Just let me know what package you're interested in! 💖" }]
                    };
                }
                else {
                    logger.debug(`[PAYMENT] No payment found but draft exists, checking if ready for payment`);
                }
            }
        }
        const isPaymentQuery = /(payment|pay|mpesa|prompt|sent|received|money|paid|transaction|deposit|checkout|check.*payment|payment.*status|didn.*receive|not.*receive|haven.*receive|wrong.*number|change.*number|resend|send.*again|retry|try.*again|try.*payment|retry.*payment|cancel.*payment|payment.*cancel|stuck|frozen|not.*working|payment.*issue|problem.*payment|help.*payment|payment.*help)/i.test(message);
        if (isPaymentQuery && draft) {
            if (/(didn.*receive|not.*receive|haven.*receive|no.*prompt|didn.*get|not.*get|haven.*get|where.*prompt|when.*prompt|prompt.*not|still.*waiting)/i.test(message)) {
                logger.debug(`[PAYMENT] User reports not receiving prompt`);
                const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
                const hasRecentPrompt = await bookingsService.hasRecentPaymentPrompt(customerId);
                if (!latestPayment) {
                    if (draft.step === 'confirm') {
                        try {
                            const pkg = await bookingsService.packagesService.findPackageByName(draft.service);
                            const depositAmount = pkg?.deposit || 2000;
                            const phone = draft.recipientPhone;
                            if (!phone) {
                                return {
                                    response: "I need your phone number to send the payment prompt. What's your M-PESA registered phone number? 📱",
                                    draft,
                                    updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I need your phone number to send the payment prompt. What's your M-PESA registered phone number? 📱" }]
                                };
                            }
                            const normalized = aiService.normalizeDateTime(draft.date, draft.time);
                            if (normalized) {
                                const dateObj = new Date(normalized.isoUtc);
                                await bookingsService.completeBookingDraft(customerId, dateObj);
                                return {
                                    response: `I'm sending the payment prompt now! 📲\n\nYou should receive it on ${phone} within the next 10 seconds. Please have your M-PESA PIN ready! 💳\n\nIf you don't receive it, let me know and I can resend it.`,
                                    draft: null,
                                    updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `I'm sending the payment prompt now! 📲\n\nYou should receive it on ${phone} within the next 10 seconds. Please have your M-PESA PIN ready! 💳\n\nIf you don't receive it, let me know and I can resend it.` }]
                                };
                            }
                        }
                        catch (error) {
                            logger.error('Error initiating payment:', error);
                        }
                    }
                    else {
                        return {
                            response: "I haven't sent a payment prompt yet. Let's complete your booking details first, then I'll send the payment request! 📋",
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I haven't sent a payment prompt yet. Let's complete your booking details first, then I'll send the payment request! 📋" }]
                        };
                    }
                }
                else if (latestPayment.status === 'pending') {
                    const phone = latestPayment.phone || draft.recipientPhone;
                    const timeSinceSent = Math.floor((Date.now() - new Date(latestPayment.createdAt).getTime()) / 1000 / 60);
                    if (timeSinceSent < 2) {
                        return {
                            response: `The payment prompt was just sent ${timeSinceSent === 0 ? 'a moment ago' : `${timeSinceSent} minute${timeSinceSent > 1 ? 's' : ''} ago`} to ${phone}. It may take up to 30 seconds to arrive. Please check your phone! 📲\n\nIf you still don't see it after 30 seconds, just say "resend" and I'll send it again.`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `The payment prompt was just sent ${timeSinceSent === 0 ? 'a moment ago' : `${timeSinceSent} minute${timeSinceSent > 1 ? 's' : ''} ago`} to ${phone}. It may take up to 30 seconds to arrive. Please check your phone! 📲\n\nIf you still don't see it after 30 seconds, just say "resend" and I'll send it again.` }]
                        };
                    }
                    else if (timeSinceSent < 5) {
                        return {
                            response: `I see the payment prompt was sent ${timeSinceSent} minute${timeSinceSent > 1 ? 's' : ''} ago to ${phone}. Sometimes M-PESA prompts can be delayed. Would you like me to resend it? Just reply "resend" or "yes". 📲`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `I see the payment prompt was sent ${timeSinceSent} minute${timeSinceSent > 1 ? 's' : ''} ago to ${phone}. Sometimes M-PESA prompts can be delayed. Would you like me to resend it? Just reply "resend" or "yes". 📲` }]
                        };
                    }
                    else {
                        logger.debug(`[PAYMENT] Payment prompt sent ${timeSinceSent} minutes ago, automatically resending`);
                        const result = await bookingsService.resendPaymentPrompt(customerId);
                        return {
                            response: `I see the payment prompt was sent ${timeSinceSent} minutes ago and you haven't received it. ${result.message}`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `I see the payment prompt was sent ${timeSinceSent} minutes ago and you haven't received it. ${result.message}` }]
                        };
                    }
                }
                else if (latestPayment.status === 'success') {
                    return {
                        response: "Great news! Your payment was already successful! ✅ Your booking is confirmed. You should have received a confirmation message. If you didn't, let me know!",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "Great news! Your payment was already successful! ✅ Your booking is confirmed. You should have received a confirmation message. If you didn't, let me know!" }]
                    };
                }
            }
            if (/(resend|send.*again|send.*another|retry|try.*again|try.*payment|retry.*payment|lets.*retry|let.*retry|want.*retry|need.*retry|can.*retry|send.*prompt|resend.*payment)/i.test(message)) {
                logger.debug(`[PAYMENT] User requesting to resend payment prompt`);
                const result = await bookingsService.resendPaymentPrompt(customerId);
                return {
                    response: result.message,
                    draft,
                    updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: result.message }]
                };
            }
            if (/(wrong.*number|incorrect.*number|wrong.*phone|change.*number|update.*number|different.*number|new.*number|correct.*number)/i.test(message)) {
                logger.debug(`[PAYMENT] User wants to change phone number`);
                const phoneMatch = message.match(/(?:0|254)?[17]\d{8}/);
                if (phoneMatch) {
                    const newPhone = phoneMatch[0];
                    const result = await bookingsService.resendPaymentPrompt(customerId, newPhone);
                    return {
                        response: `Got it! I've updated your phone number to ${newPhone}. ${result.message}`,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `Got it! I've updated your phone number to ${newPhone}. ${result.message}` }]
                    };
                }
                else {
                    return {
                        response: "No problem! What's the correct phone number? Please share it and I'll update it and resend the payment prompt. 📱",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "No problem! What's the correct phone number? Please share it and I'll update it and resend the payment prompt. 📱" }]
                    };
                }
            }
            if (/(paid|sent|money.*sent|already.*paid|i.*paid|payment.*done|transaction.*complete|money.*sent|sent.*money|completed.*payment)/i.test(message)) {
                logger.debug(`[PAYMENT] User claims payment was made`);
                const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
                if (!latestPayment) {
                    return {
                        response: "I don't see a payment record. Let me send you the payment prompt now. Please complete it on your phone. 📲",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I don't see a payment record. Let me send you the payment prompt now. Please complete it on your phone. 📲" }]
                    };
                }
                if (latestPayment.status === 'success') {
                    return {
                        response: "Perfect! I can confirm your payment was received successfully! ✅ Your booking is confirmed. You should have received a confirmation with all the details. If you need anything else, just let me know! 💖",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "Perfect! I can confirm your payment was received successfully! ✅ Your booking is confirmed. You should have received a confirmation with all the details. If you need anything else, just let me know! 💖" }]
                    };
                }
                else if (latestPayment.status === 'pending') {
                    const timeSinceSent = Math.floor((Date.now() - new Date(latestPayment.createdAt).getTime()) / 1000 / 60);
                    if (timeSinceSent > 5) {
                        return {
                            response: `I see the payment has been pending for ${timeSinceSent} minutes. Sometimes M-PESA confirmations can be delayed. Do you have the M-PESA receipt number? If so, please share it and I'll verify your payment immediately! Otherwise, I can resend a fresh payment prompt. 📲`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `I see the payment has been pending for ${timeSinceSent} minutes. Sometimes M-PESA confirmations can be delayed. Do you have the M-PESA receipt number? If so, please share it and I'll verify your payment immediately! Otherwise, I can resend a fresh payment prompt. 📲` }]
                        };
                    }
                    else {
                        return {
                            response: "I see the payment is still processing. Sometimes it takes a few minutes for M-PESA to confirm. Please wait 2-3 minutes and I'll check again automatically. If you have the M-PESA receipt number, you can share it with me and I'll verify it immediately! 📲",
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I see the payment is still processing. Sometimes it takes a few minutes for M-PESA to confirm. Please wait 2-3 minutes and I'll check again automatically. If you have the M-PESA receipt number, you can share it with me and I'll verify it immediately! 📲" }]
                        };
                    }
                }
                else if (latestPayment.status === 'failed') {
                    logger.debug(`[PAYMENT] Previous payment failed, automatically resending`);
                    const result = await bookingsService.resendPaymentPrompt(customerId);
                    return {
                        response: `I see the previous payment attempt failed. ${result.message}\n\nPlease make sure:\n• Your phone has network connection\n• You have sufficient M-PESA balance\n• You enter your PIN correctly`,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `I see the previous payment attempt failed. ${result.message}\n\nPlease make sure:\n• Your phone has network connection\n• You have sufficient M-PESA balance\n• You enter your PIN correctly` }]
                    };
                }
            }
            if (/(cancel.*payment|payment.*cancel|cancelled.*prompt|prompt.*cancel|declined|rejected|didn.*accept|didn.*complete)/i.test(message)) {
                logger.debug(`[PAYMENT] User cancelled payment`);
                const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
                if (latestPayment && latestPayment.status === 'pending') {
                    await prisma.payment.update({
                        where: { id: latestPayment.id },
                        data: { status: 'failed' }
                    });
                    return {
                        response: "No problem! I've cancelled that payment request. Would you like me to send it again? Just reply 'yes' or 'resend' and I'll send a fresh payment prompt. 💖",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "No problem! I've cancelled that payment request. Would you like me to send it again? Just reply 'yes' or 'resend' and I'll send a fresh payment prompt. 💖" }]
                    };
                }
                else {
                    return {
                        response: "That's okay! If you'd like to try the payment again, just let me know and I'll send a fresh payment prompt. Or if you'd like to cancel the booking entirely, just say 'cancel booking'. 💖",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "That's okay! If you'd like to try the payment again, just let me know and I'll send a fresh payment prompt. Or if you'd like to cancel the booking entirely, just say 'cancel booking'. 💖" }]
                    };
                }
            }
            if (/(receipt|confirmation.*code|mpesa.*receipt|transaction.*code|code.*is|receipt.*number|receipt.*is)/i.test(message)) {
                logger.debug(`[PAYMENT] User provided receipt number`);
                const receiptMatch = message.match(/\b([A-Z0-9]{8,12})\b/);
                if (receiptMatch) {
                    const receiptNumber = receiptMatch[1];
                    const result = await bookingsService.verifyPaymentByReceipt(customerId, receiptNumber);
                    return {
                        response: result.message,
                        draft: result.success ? null : draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: result.message }]
                    };
                }
                else {
                    return {
                        response: "I'd like to verify your payment! Could you please share your M-PESA receipt number? It's usually a 10-character code like 'ABC123XYZ9'. 📲",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I'd like to verify your payment! Could you please share your M-PESA receipt number? It's usually a 10-character code like 'ABC123XYZ9'. 📲" }]
                    };
                }
            }
            if (/(check.*payment|payment.*status|status.*payment|did.*payment|payment.*received|payment.*go|where.*payment)/i.test(message)) {
                logger.debug(`[PAYMENT] User checking payment status`);
                const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
                if (!latestPayment) {
                    return {
                        response: "I don't see any payment record yet. Would you like me to send the payment prompt now? Just reply 'yes' or 'send payment'. 📲",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I don't see any payment record yet. Would you like me to send the payment prompt now? Just reply 'yes' or 'send payment'. 📲" }]
                    };
                }
                const pkg = await bookingsService.packagesService.findPackageByName(draft.service);
                const depositAmount = pkg?.deposit || 2000;
                if (latestPayment.status === 'success') {
                    return {
                        response: `✅ Payment Status: SUCCESSFUL\n\nAmount: KSH ${depositAmount.toLocaleString()}\nReceipt: ${latestPayment.mpesaReceipt || 'N/A'}\n\nYour booking is confirmed! You should have received a confirmation message with all the details. 💖`,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `✅ Payment Status: SUCCESSFUL\n\nAmount: KSH ${depositAmount.toLocaleString()}\nReceipt: ${latestPayment.mpesaReceipt || 'N/A'}\n\nYour booking is confirmed! You should have received a confirmation message with all the details. 💖` }]
                    };
                }
                else if (latestPayment.status === 'pending') {
                    const timeSinceSent = Math.floor((Date.now() - new Date(latestPayment.createdAt).getTime()) / 1000 / 60);
                    return {
                        response: `⏳ Payment Status: PENDING\n\nAmount: KSH ${depositAmount.toLocaleString()}\nSent to: ${latestPayment.phone}\nTime: ${timeSinceSent} minute${timeSinceSent !== 1 ? 's' : ''} ago\n\nPlease check your phone and complete the M-PESA prompt. If you don't see it, I can resend it. 📲`,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `⏳ Payment Status: PENDING\n\nAmount: KSH ${depositAmount.toLocaleString()}\nSent to: ${latestPayment.phone}\nTime: ${timeSinceSent} minute${timeSinceSent !== 1 ? 's' : ''} ago\n\nPlease check your phone and complete the M-PESA prompt. If you don't see it, I can resend it. 📲` }]
                    };
                }
                else {
                    return {
                        response: `❌ Payment Status: FAILED\n\nAmount: KSH ${depositAmount.toLocaleString()}\n\nThe previous payment attempt didn't go through. Would you like me to send a fresh payment prompt? Just reply 'yes' or 'resend'. 💖`,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `❌ Payment Status: FAILED\n\nAmount: KSH ${depositAmount.toLocaleString()}\n\nThe previous payment attempt didn't go through. Would you like me to send a fresh payment prompt? Just reply 'yes' or 'resend'. 💖` }]
                    };
                }
            }
            if (/(stuck|frozen|not.*working|payment.*issue|problem.*payment|help.*payment|payment.*help|payment.*error|something.*wrong.*payment)/i.test(message)) {
                logger.debug(`[PAYMENT] User reports payment issue`);
                const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
                if (!latestPayment) {
                    return {
                        response: "I don't see any payment record. Let me send you a fresh payment prompt. If you continue to have issues, please contact us at 0720 111928. 📲",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I don't see any payment record. Let me send you a fresh payment prompt. If you continue to have issues, please contact us at 0720 111928. 📲" }]
                    };
                }
                if (latestPayment.status === 'pending') {
                    const timeSinceSent = Math.floor((Date.now() - new Date(latestPayment.createdAt).getTime()) / 1000 / 60);
                    if (timeSinceSent > 10) {
                        return {
                            response: `I see the payment has been pending for ${timeSinceSent} minutes. This might be stuck. Let me cancel it and send you a fresh payment prompt. Sometimes this happens due to network issues. 📲\n\nI'm sending a new prompt now...`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `I see the payment has been pending for ${timeSinceSent} minutes. This might be stuck. Let me cancel it and send you a fresh payment prompt. Sometimes this happens due to network issues. 📲\n\nI'm sending a new prompt now...` }]
                        };
                    }
                    else {
                        return {
                            response: `The payment is still processing (${timeSinceSent} minutes). Sometimes M-PESA confirmations can take a few minutes. Please wait a bit longer. If it's been more than 10 minutes, let me know and I'll resend it. ⏳`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `The payment is still processing (${timeSinceSent} minutes). Sometimes M-PESA confirmations can take a few minutes. Please wait a bit longer. If it's been more than 10 minutes, let me know and I'll resend it. ⏳` }]
                        };
                    }
                }
                else if (latestPayment.status === 'failed') {
                    return {
                        response: "I see the payment failed. Let me send you a fresh payment prompt. Make sure:\n\n• Your phone has good network connection\n• You have sufficient M-PESA balance\n• You enter your PIN correctly\n\nI'm sending it now... 📲",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I see the payment failed. Let me send you a fresh payment prompt. Make sure:\n\n• Your phone has good network connection\n• You have sufficient M-PESA balance\n• You enter your PIN correctly\n\nI'm sending it now... 📲" }]
                    };
                }
                else {
                    return {
                        response: "I see your payment was successful! ✅ Your booking should be confirmed. If you're experiencing any issues, please contact us at 0720 111928 and we'll help you right away. 💖",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I see your payment was successful! ✅ Your booking should be confirmed. If you're experiencing any issues, please contact us at 0720 111928 and we'll help you right away. 💖" }]
                    };
                }
            }
        }
        if (draft && draft.step === 'confirm' && /^(confirm|yes|ok|okay|sure|proceed|go ahead)$/i.test(message.trim())) {
            context.logger.error(`[DEBUG-TRACE] [STRATEGY] Detected confirmation for deposit payment. CustomerId: ${customerId}`);
            logger.debug(`[STRATEGY] Detected confirmation for deposit payment`);
            const existingPayment = await bookingsService.getLatestPaymentForDraft(customerId);
            if (existingPayment) {
                if (existingPayment.status === 'success') {
                    const confirmedBooking = await bookingsService.getLatestConfirmedBooking(customerId);
                    if (confirmedBooking) {
                        return {
                            response: "✅ Great news! Your payment was already successful! Your booking is confirmed. You should have received a confirmation message with all the details. If you didn't, please let me know! 💖",
                            draft: null,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "✅ Great news! Your payment was already successful! Your booking is confirmed. You should have received a confirmation message with all the details. If you didn't, please let me know! 💖" }]
                        };
                    }
                    else {
                        return {
                            response: "I see your payment was successful, but I'm having trouble finding your booking. Please contact us at 0720 111928 for assistance. 💖",
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I see your payment was successful, but I'm having trouble finding your booking. Please contact us at 0720 111928 for assistance. 💖" }]
                        };
                    }
                }
                else if (existingPayment.status === 'pending') {
                    const phone = existingPayment.phone || draft.recipientPhone;
                    const timeSinceSent = Math.floor((Date.now() - new Date(existingPayment.createdAt).getTime()) / 1000 / 60);
                    if (timeSinceSent < 1) {
                        return {
                            response: `⏳ I've already sent the payment prompt to your phone (${phone}) just a moment ago! Please check your phone and enter your M-PESA PIN to complete the payment. 📲\n\nIf you don't see it, wait about 30 seconds as M-PESA prompts can sometimes be delayed. If you still don't receive it, just say "resend" and I'll send it again.`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `⏳ I've already sent the payment prompt to your phone (${phone}) just a moment ago! Please check your phone and enter your M-PESA PIN to complete the payment. 📲\n\nIf you don't see it, wait about 30 seconds as M-PESA prompts can sometimes be delayed. If you still don't receive it, just say "resend" and I'll send it again.` }]
                        };
                    }
                    else {
                        return {
                            response: `⏳ I already sent the payment prompt to your phone (${phone}) ${timeSinceSent} minute${timeSinceSent > 1 ? 's' : ''} ago. Please check your phone and complete the M-PESA payment. 📲\n\nIf you don't see it or need me to resend it, just say "resend" and I'll send a fresh prompt.`,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `⏳ I already sent the payment prompt to your phone (${phone}) ${timeSinceSent} minute${timeSinceSent > 1 ? 's' : ''} ago. Please check your phone and complete the M-PESA payment. 📲\n\nIf you don't see it or need me to resend it, just say "resend" and I'll send a fresh prompt.` }]
                        };
                    }
                }
                else if (existingPayment.status === 'failed') {
                    logger.debug(`[STRATEGY] Payment failed, treating "Yes" as resend request`);
                    const result = await bookingsService.resendPaymentPrompt(customerId);
                    return {
                        response: result.message,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: result.message }]
                    };
                }
            }
            if (draft.service && draft.date && draft.time && draft.name && draft.recipientPhone) {
                try {
                    const normalized = aiService.normalizeDateTime(draft.date, draft.time);
                    if (!normalized) {
                        return {
                            response: "I'm having trouble with the date/time. Could you please provide it again?",
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I'm having trouble with the date/time. Could you please provide it again?" }]
                        };
                    }
                    const dateObj = new Date(normalized.isoUtc);
                    const avail = await bookingsService.checkAvailability(dateObj, draft.service);
                    if (!avail.available) {
                        const studioTz = 'Africa/Nairobi';
                        let response = "I'm sorry, but that slot is no longer available. 😔\n\n";
                        if (avail.suggestions && avail.suggestions.length > 0) {
                            const suggestions = avail.suggestions
                                .slice(0, 5)
                                .map((s) => {
                                const dt = DateTime.fromISO(s).setZone(studioTz);
                                return `- ${dt.toFormat('h:mm a')}`;
                            })
                                .join('\n');
                            response += `Here are some other times available on ${draft.date}:\n${suggestions}\n\nDo any of these work for you?`;
                        }
                        else {
                            response += `Would you like to try a different date and time?`;
                        }
                        return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
                    }
                    const pkg = await bookingsService.packagesService.findPackageByName(draft.service);
                    const depositAmount = pkg?.deposit || 2000;
                    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
                    const phone = draft.recipientPhone || customer?.phone;
                    if (!phone) {
                        return {
                            response: "I need your phone number to send the payment request. Could you please provide it? 📱",
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I need your phone number to send the payment request. Could you please provide it? 📱" }]
                        };
                    }
                    const result = await bookingsService.completeBookingDraft(customerId, dateObj);
                    return {
                        response: `Awesome, we're almost done! 🎉\n\nTo lock in your booking for the ${draft.service} package, a deposit of KSH ${depositAmount} is required—this helps us secure your spot and prepare everything just for you.\n\nI am now sending the payment prompt to your phone.`,
                        draft: null,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `Awesome, we're almost done! 🎉\n\nTo lock in your booking for the ${draft.service} package, a deposit of KSH ${depositAmount} is required—this helps us secure your spot and prepare everything just for you.\n\nI am now sending the payment prompt to your phone.` }]
                    };
                }
                catch (error) {
                    logger.error('Error processing confirmation:', error);
                    return {
                        response: "I encountered an issue processing your confirmation. Please try again or contact us at 0720 111928 for assistance. 💖",
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I encountered an issue processing your confirmation. Please try again or contact us at 0720 111928 for assistance. 💖" }]
                    };
                }
            }
            else {
                const missing = [];
                if (!draft.service)
                    missing.push('package');
                if (!draft.date)
                    missing.push('date');
                if (!draft.time)
                    missing.push('time');
                if (!draft.name)
                    missing.push('name');
                if (!draft.recipientPhone)
                    missing.push('phone number');
                return {
                    response: `I'm missing some information: ${missing.join(', ')}. Could you please provide ${missing.length === 1 ? 'it' : 'them'}?`,
                    draft,
                    updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: `I'm missing some information: ${missing.join(', ')}. Could you please provide ${missing.length === 1 ? 'it' : 'them'}?` }]
                };
            }
        }
        if (!hasDraft) {
            const recentAssistantMsgs = history
                .filter((msg) => msg.role === 'assistant')
                .slice(-3)
                .map(msg => msg.content.toLowerCase())
                .join(' ');
            const acknowledgmentPatterns = [
                /^(ok|okay|sure|yes|yeah|yep|alright|sounds good|got it|understood|perfect|great|thanks|thank you)/i,
                /^(ok|okay|sure|yes|yeah|yep|alright|sounds good|got it|understood|perfect|great|thanks|thank you).*(then|i will|i'll)/i,
                /^(okay|ok|sure|yes|yeah|yep|alright).*then.*(i will|i'll)/i,
                /i will (come|bring|do)/i,
                /i'll (come|bring|do)/i,
            ];
            const isAcknowledgment = acknowledgmentPatterns.some(pattern => pattern.test(message)) &&
                !/(book|appointment|schedule|reserve|available|slot|date|time|when|what time|make a booking|new booking)/i.test(message);
            const recentWasFaq = /(welcome|fine|allowed|bring|include|can i|is it|are.*allowed|photographer|family|partner|guests|questions|feel free|anything else)/i.test(recentAssistantMsgs) &&
                !/(book|appointment|schedule|reserve|available|slot|date|time|when|what time|make a booking|new booking)/i.test(recentAssistantMsgs);
            if (isAcknowledgment && recentWasFaq) {
                logger.debug(`[STRATEGY] Detected acknowledgment, skipping booking flow`);
                return null;
            }
        }
        const isSlotQuery = /(another|other|what.*another|what.*other|so what|give me|show me).*(slot|time|hour)/i.test(message) &&
            !/(book|appointment|schedule|reserve|confirm)/i.test(message);
        if (isSlotQuery && draft?.service && draft?.date) {
            const studioTz = 'Africa/Nairobi';
            const slots = await bookingsService.getAvailableSlotsForDate(draft.date, draft.service);
            if (slots.length > 0) {
                const prettySlots = slots.slice(0, 8).map((s) => {
                    const dt = DateTime.fromISO(s).setZone(studioTz);
                    return `- ${dt.toFormat('h:mm a')}`;
                }).join('\n');
                const dateDt = DateTime.fromISO(draft.date).setZone(studioTz);
                const formattedDate = dateDt.toFormat('EEE, MMM d');
                const response = `Here are the available times for ${draft.service} on ${formattedDate}:\n\n${prettySlots}\n\nWhich time would you like to book?`;
                return {
                    response,
                    draft,
                    updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                };
            }
            else {
                try {
                    const dateObj = DateTime.fromISO(draft.date).setZone(studioTz).toJSDate();
                    const alternativeDays = await bookingsService.findAvailableSlotsAcrossDays(dateObj, draft.service, 7);
                    if (alternativeDays.length > 0) {
                        const dayOptions = [];
                        alternativeDays.forEach((dayData) => {
                            const dateDt = DateTime.fromISO(dayData.date).setZone(studioTz);
                            const dateStr = dateDt.toFormat('EEE, MMM d');
                            const slots = dayData.slots
                                .map((s) => {
                                const slotDt = DateTime.fromISO(s).setZone(studioTz);
                                return slotDt.toFormat('h:mm a');
                            })
                                .slice(0, 3)
                                .join(', ');
                            dayOptions.push(`${dateStr}: ${slots}`);
                        });
                        const response = `Unfortunately, ${draft.date} is fully booked. Here are some other available dates:\n\n${dayOptions.join('\n')}\n\nWhich date works best for you?`;
                        return {
                            response,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                        };
                    }
                    else {
                        const response = `Sorry, ${draft.date} is fully booked, and I couldn't find available slots in the next week. Would you like to:\n\n1. Try a date further in the future\n2. Contact us at 0720 111928 for special arrangements`;
                        return {
                            response,
                            draft,
                            updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                        };
                    }
                }
                catch (error) {
                    logger.error('Error finding alternative days for slot query:', error);
                    const response = `Sorry, there are no available slots for ${draft.service} on ${draft.date}. Would you like to try a different date?`;
                    return {
                        response,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                    };
                }
            }
        }
        const extraction = await aiService.extractBookingDetails(message, history, draft);
        logger.debug(`[STRATEGY] Extraction result:`, extraction);
        if (extraction.subIntent === 'cancel') {
            await bookingsService.deleteBookingDraft(customerId);
            return {
                response: "No problem at all! I've cancelled your booking request. If you change your mind or need anything else, just let me know! 😊",
                draft: null,
                updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "No problem at all! I've cancelled your booking request. If you change your mind or need anything else, just let me know! 😊" }]
            };
        }
        const shouldStartFresh = extraction.subIntent === 'start' &&
            !draft.dateTimeIso &&
            !draft.service &&
            draft.step === 'service';
        if (shouldStartFresh) {
            await bookingsService.deleteBookingDraft(customerId);
            draft = await aiService.getOrCreateDraft(customerId);
        }
        draft = await aiService.mergeIntoDraft(customerId, extraction, draft);
        if (extraction.subIntent === 'confirm') {
            if (!draft.recipientPhone && draft.recipientName) {
                const confirmed = await aiService.confirmCustomerPhone(customerId);
                if (confirmed) {
                    draft = await aiService.getOrCreateDraft(customerId);
                }
            }
            else if (draft.service && !draft.dateTimeIso) {
                if (draft.step === 'service') {
                    draft = await prisma.bookingDraft.update({
                        where: { customerId },
                        data: { step: 'date' }
                    });
                }
            }
        }
        const isSimpleYes = /^(yes|yeah|yep|sure|ok|okay|alright|sounds good|i do|i would|let's do it)$/i.test(message.trim());
        if (isSimpleYes && draft.service && !draft.dateTimeIso) {
            if (draft.step === 'service' || !draft.step) {
                draft = await prisma.bookingDraft.update({
                    where: { customerId },
                    data: { step: 'date' }
                });
            }
        }
        if (draft.service) {
            const packages = await bookingsService.packagesService.findPackageByName(draft.service);
            if (!packages) {
                const allPackages = await bookingsService.packagesService.findAll();
                const packageNames = allPackages.map((p) => p.name).join(', ');
                const response = `I don't recognize "${draft.service}". Here are our available packages:\n${packageNames}\n\nWhich one would you like?`;
                return {
                    response,
                    draft,
                    updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                };
            }
        }
        if (draft.date && draft.time && draft.service) {
            const normalized = aiService.normalizeDateTime(draft.date, draft.time);
            if (normalized) {
                const dateObj = new Date(normalized.isoUtc);
                const now = new Date();
                if (dateObj < now) {
                    const response = "I notice that date is in the past. Could you please provide a future date for your booking? 😊";
                    return {
                        response,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                    };
                }
                const avail = await bookingsService.checkAvailability(dateObj, draft.service);
                logger.debug('Availability check result:', {
                    available: avail.available,
                    suggestions: avail.suggestions?.length || 0,
                    sameDayFull: avail.sameDayFull
                });
                if (!avail.available) {
                    const studioTz = 'Africa/Nairobi';
                    let response = "I'm so sorry, but that slot is already taken. 😔\n\n";
                    if (avail.suggestions && avail.suggestions.length > 0) {
                        const sameDaySuggestions = avail.suggestions
                            .map((s) => {
                            const dt = DateTime.fromISO(s).setZone(studioTz);
                            return `- ${dt.toFormat('h:mm a')}`;
                        })
                            .join('\n');
                        response += `Here are some other times I have available on ${draft.date}:\n${sameDaySuggestions}\n\nDo any of these work for you?`;
                    }
                    else if (avail.sameDayFull) {
                        response += `Unfortunately, ${draft.date} is fully booked. Let me check other available dates for you...\n\n`;
                        try {
                            const alternativeDays = await bookingsService.findAvailableSlotsAcrossDays(dateObj, draft.service, 7);
                            if (alternativeDays.length > 0) {
                                const dayOptions = [];
                                alternativeDays.forEach((dayData, index) => {
                                    const dateDt = DateTime.fromISO(dayData.date).setZone(studioTz);
                                    const dateStr = dateDt.toFormat('EEE, MMM d');
                                    const slots = dayData.slots
                                        .map((s) => {
                                        const slotDt = DateTime.fromISO(s).setZone(studioTz);
                                        return slotDt.toFormat('h:mm a');
                                    })
                                        .slice(0, 3)
                                        .join(', ');
                                    dayOptions.push(`${dateStr}: ${slots}`);
                                });
                                response += `Here are some available dates:\n\n${dayOptions.join('\n')}\n\nWhich date works best for you?`;
                            }
                            else {
                                response += `I've checked the next week, and unfortunately all slots are currently booked. Would you like to:\n\n1. Try a date further in the future\n2. Be notified when slots become available\n3. Contact us directly at 0720 111928 for special arrangements`;
                            }
                        }
                        catch (error) {
                            logger.error('Error finding alternative days:', error);
                            response += `Would you like to try a different date? You can suggest another day, or I can help you find available slots.`;
                        }
                    }
                    else {
                        response += `Would you like to try a different date and time?`;
                    }
                    return {
                        response,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                    };
                }
            }
        }
        const completion = await aiService.checkAndCompleteIfConfirmed(draft, extraction, customerId, bookingsService);
        if (completion.action === 'conflict') {
            const conflictMessage = typeof completion.message === 'string' ? completion.message : 'That time slot is not available.';
            let response = `I'm sorry, but it looks like you already have a booking around that time. ${conflictMessage}`;
            if (completion.suggestions && completion.suggestions.length > 0) {
                const suggestedTimes = completion.suggestions
                    .map((s, i) => `${i + 1}. ${DateTime.fromISO(s).toFormat('h:mm a, MMM d')}`)
                    .join('\n');
                response += `\n\nHere are some available time slots:\n${suggestedTimes}\n\nWhich one would you prefer? (1-${completion.suggestions.length})`;
            }
            else {
                response += ' Would you like to try a different time?';
            }
            return {
                response,
                draft,
                updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
            };
        }
        if (completion.action === 'unavailable') {
            const studioTz = 'Africa/Nairobi';
            let response = "I'm so sorry, but that slot is already taken. 😔\n\n";
            if (completion.suggestions && completion.suggestions.length > 0) {
                const sameDaySuggestions = completion.suggestions
                    .slice(0, 8)
                    .map((s) => {
                    const dt = typeof s === 'string' && s.includes('T')
                        ? DateTime.fromISO(s).setZone(studioTz)
                        : DateTime.fromJSDate(new Date(s)).setZone(studioTz);
                    return `- ${dt.toFormat('h:mm a')}`;
                })
                    .join('\n');
                response += `Here are some other times I have available on ${draft.date}:\n${sameDaySuggestions}\n\nDo any of these work for you?`;
            }
            else {
                try {
                    if (draft.date && draft.service) {
                        const dateObj = DateTime.fromISO(draft.date).setZone(studioTz).toJSDate();
                        const alternativeDays = await bookingsService.findAvailableSlotsAcrossDays(dateObj, draft.service, 7);
                        if (alternativeDays.length > 0) {
                            const dayOptions = [];
                            alternativeDays.forEach((dayData) => {
                                const dateDt = DateTime.fromISO(dayData.date).setZone(studioTz);
                                const dateStr = dateDt.toFormat('EEE, MMM d');
                                const slots = dayData.slots
                                    .map((s) => {
                                    const slotDt = DateTime.fromISO(s).setZone(studioTz);
                                    return slotDt.toFormat('h:mm a');
                                })
                                    .slice(0, 3)
                                    .join(', ');
                                dayOptions.push(`${dateStr}: ${slots}`);
                            });
                            response += `Unfortunately, ${draft.date} is fully booked. Here are some other available dates:\n\n${dayOptions.join('\n')}\n\nWhich date works best for you?`;
                        }
                        else {
                            response += `Unfortunately, ${draft.date} is fully booked, and I couldn't find available slots in the next week. Would you like to try a date further in the future, or contact us at 0720 111928?`;
                        }
                    }
                    else {
                        response += `Would you like to try a different date and time?`;
                    }
                }
                catch (error) {
                    logger.error('Error finding alternative days in completion handler:', error);
                    response += `Would you like to try a different date and time?`;
                }
            }
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }
        if (completion.action === 'ready_for_deposit') {
            if (draft) {
                const isStale = await bookingsService.isDraftStale(customerId);
                if (isStale) {
                    logger.debug(`[STRATEGY] Stale draft detected when showing booking details, cleaning up`);
                    await bookingsService.cleanupStaleDraft(customerId);
                    return {
                        response: "I notice your previous booking request has expired. Would you like to start a fresh booking? Just let me know what package you're interested in! 💖",
                        draft: null,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I notice your previous booking request has expired. Would you like to start a fresh booking? Just let me know what package you're interested in! 💖" }]
                    };
                }
            }
            if (completion.requiresResend) {
                logger.debug(`[STRATEGY] Resending payment after failed attempt`);
                const result = await bookingsService.resendPaymentPrompt(customerId);
                return { response: result.message, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: result.message }] };
            }
            const response = `Great! Here are your booking details:\n\n• Package: ${completion.packageName || 'selected'}\n• Date: ${draft.date}\n• Time: ${draft.time}\n• Name: ${draft.name}\n• Phone: ${draft.recipientPhone}\n\nTo confirm your booking, a deposit of KSH ${completion.amount} is required.\n\nReply with *CONFIRM* to accept and receive the payment prompt. If you need to make changes, just let me know!`;
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }
        if (completion.action === 'payment_initiated') {
            const response = `Awesome, we're almost done! 🎉\n\nTo lock in your booking for the ${completion.packageName || 'selected'} package, a deposit of KSH ${completion.amount} is required—this helps us secure your spot and prepare everything just for you.\n\nI am now sending the payment prompt to your phone.`;
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }
        if (completion.action === 'failed') {
            const response = completion.error || "I'm having trouble processing that. Could you please double check the details? 🥺";
            return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
        }
        if (extraction.subIntent === 'deposit_confirmed' || extraction.subIntent === 'confirm') {
            const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
            const confirmedBooking = await bookingsService.getLatestConfirmedBooking(customerId);
            if (!confirmedBooking && (!latestPayment || latestPayment.status !== 'success')) {
                if (latestPayment && latestPayment.status === 'failed') {
                    logger.debug(`[SECURITY] Payment failed, resending payment prompt instead of false confirmation`);
                    const result = await bookingsService.resendPaymentPrompt(customerId);
                    return {
                        response: result.message,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: result.message }]
                    };
                }
                else if (!latestPayment) {
                    if (draft) {
                        const isStale = await bookingsService.isDraftStale(customerId);
                        if (isStale) {
                            logger.debug(`[STRATEGY] Stale draft detected when showing booking details, cleaning up`);
                            await bookingsService.cleanupStaleDraft(customerId);
                            return {
                                response: "I notice your previous booking request has expired. Would you like to start a fresh booking? Just let me know what package you're interested in! 💖",
                                draft: null,
                                updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: "I notice your previous booking request has expired. Would you like to start a fresh booking? Just let me know what package you're interested in! 💖" }]
                            };
                        }
                    }
                    const pkg = await bookingsService.packagesService.findPackageByName(draft.service);
                    const depositAmount = pkg?.deposit || 2000;
                    const response = `Great! Here are your booking details:\n\n• Package: ${draft.service}\n• Date: ${draft.date}\n• Time: ${draft.time}\n• Name: ${draft.name}\n• Phone: ${draft.recipientPhone || 'Not provided'}\n\nTo confirm your booking, a deposit of KSH ${depositAmount} is required.\n\nReply with *CONFIRM* to accept and receive the payment prompt. If you need to make changes, just let me know!`;
                    return {
                        response,
                        draft,
                        updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }]
                    };
                }
            }
        }
        const response = await aiService.generateBookingReply(message, draft, extraction, history, bookingsService);
        const claimsToSendPayment = /(send.*payment|payment.*prompt|sending.*payment|i.*send|i'll.*send|i will.*send|payment.*request|mpesa.*prompt|finalize.*booking.*deposit|send.*you.*payment|payment.*will.*be|i'm.*sending|sending.*you|let's.*finalize|let.*finalize)/i.test(response);
        const isDraftIncomplete = !draft.service || !draft.date || !draft.time || !draft.name || !draft.recipientPhone;
        if (claimsToSendPayment && isDraftIncomplete) {
            logger.warn(`[SECURITY] AI claimed to send payment but draft is incomplete for customer ${customerId}`);
            const missing = [];
            if (!draft.service)
                missing.push('package');
            if (!draft.date)
                missing.push('date');
            if (!draft.time)
                missing.push('time');
            if (!draft.name)
                missing.push('name');
            if (!draft.recipientPhone)
                missing.push('phone number');
            const nextMissing = missing[0];
            let accurateResponse = '';
            if (nextMissing === 'package') {
                accurateResponse = "I'd love to help you complete your booking! Which package would you like to book? 📸";
            }
            else if (nextMissing === 'date') {
                accurateResponse = "Great! What date would you like to book? Just let me know the day (e.g., 'December 15th' or 'next Friday'). 📅";
            }
            else if (nextMissing === 'time') {
                accurateResponse = "Perfect! What time works best for you? (e.g., '2pm', 'morning', 'afternoon') ⏰";
            }
            else if (nextMissing === 'name') {
                accurateResponse = "Almost there! What name should I use for this booking? 👤";
            }
            else if (nextMissing === 'phone number') {
                accurateResponse = "Just one more thing! What's your phone number? This is where I'll send the payment prompt. 📱";
            }
            else {
                accurateResponse = `I need a few more details to complete your booking: ${missing.join(', ')}. Let's start with ${nextMissing} - could you provide that? 💖`;
            }
            return {
                response: accurateResponse,
                draft,
                updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: accurateResponse }]
            };
        }
        const isFalseConfirmation = /(confirmed booking|Everything is set|booking is confirmed|your booking.*confirmed)/i.test(response) &&
            !(await bookingsService.getLatestConfirmedBooking(customerId));
        if (isFalseConfirmation) {
            logger.warn(`[SECURITY] Prevented false booking confirmation for customer ${customerId}`);
            const latestPayment = await bookingsService.getLatestPaymentForDraft(customerId);
            if (latestPayment && latestPayment.status === 'pending') {
                const accurateResponse = `⏳ Your payment is still processing. Please complete the M-PESA prompt on your phone. Once payment is confirmed, your booking will be finalized! 📲`;
                return { response: accurateResponse, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: accurateResponse }] };
            }
            else if (latestPayment && latestPayment.status === 'failed') {
                const result = await bookingsService.resendPaymentPrompt(customerId);
                return { response: result.message, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: result.message }] };
            }
            else {
                const accurateResponse = `I'm processing your booking details. To complete your booking, please confirm the payment when prompted. 💖`;
                return { response: accurateResponse, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: accurateResponse }] };
            }
        }
        return { response, draft, updatedHistory: [...history.slice(-historyLimit), { role: 'user', content: message }, { role: 'assistant', content: response }] };
    }
}
exports.BookingStrategy = BookingStrategy;
//# sourceMappingURL=booking.strategy.js.map