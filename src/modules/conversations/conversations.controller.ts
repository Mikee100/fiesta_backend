import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { InstagramService } from '../instagram/instagram.service';
import { MessengerSendService } from '../webhooks/messenger-send.service';

@Controller('conversations')
export class ConversationsController {
    constructor(
        private conversationsService: ConversationsService,
        private whatsappService: WhatsappService,
        private instagramService: InstagramService,
        private messengerSendService: MessengerSendService,
    ) { }

    @Get()
    async getAllConversations(
        @Query('platform') platform?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.conversationsService.getAllConversations(
            platform,
            limit ? parseInt(limit) : 50,
            offset ? parseInt(offset) : 0,
        );
    }

    @Get(':id')
    async getConversation(@Param('id') id: string) {
        return this.conversationsService.getConversationById(id);
    }

    @Get(':id/messages')
    async getMessages(
        @Param('id') id: string,
        @Query('platform') platform?: string,
    ) {
        return this.conversationsService.getConversationMessages(id, platform);
    }

    @Post(':id/reply')
    async sendReply(
        @Param('id') id: string,
        @Body() body: { message: string; platform: string },
    ) {
        const { message, platform } = body;

        // Get customer details to find platform-specific ID
        const conversation = await this.conversationsService.getConversationById(id);

        // Send via appropriate platform
        if (platform === 'whatsapp' && conversation.whatsappId) {
            await this.whatsappService.sendMessage(conversation.whatsappId, message);
        } else if (platform === 'instagram' && conversation.instagramId) {
            await this.instagramService.sendMessage(conversation.instagramId, message);
        } else if (platform === 'messenger' && conversation.messengerId) {
            await this.messengerSendService.sendMessage(conversation.messengerId, message);
        } else {
            throw new Error(`Platform ${platform} not supported or customer ID not found`);
        }

        // Save message to database
        return this.conversationsService.sendReply(id, message, platform);
    }
}
