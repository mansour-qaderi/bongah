import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { ChatCapabilities, ChatConversation, ChatMessage, ChatMessagesPage, ChatTemplate } from '@bongah/shared-types';
import {
  createTemplateSchema,
  messageHistoryQuerySchema,
  sendMessageSchema,
  startConversationSchema,
  updateTemplateSchema,
  type CreateTemplateInput,
  type MessageHistoryQuery,
  type SendMessageInput,
  type StartConversationInput,
  type UpdateTemplateInput,
} from '@bongah/validation';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PerksGuard, RequiresPerks } from '../perks/perks.guard.js';
import { ChatTemplatesService } from './chat-templates.service.js';
import { ChatService } from './chat.service.js';

/** The chat API over plain HTTP. Everything here is also what the socket gateway uses underneath. */
@Controller('chat')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly templates: ChatTemplatesService,
  ) {}

  /** What this account's chat may do (agency perks) and its size limits. */
  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUser): Promise<ChatCapabilities> {
    return this.chat.getCapabilities(user.id);
  }

  @Get('conversations')
  conversations(@CurrentUser() user: AuthenticatedUser): Promise<ChatConversation[]> {
    return this.chat.listConversations(user.id);
  }

  /** Opens the chat about a listing (the same one every time for the same person). */
  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startConversationSchema)) body: StartConversationInput,
  ): Promise<ChatConversation> {
    return this.chat.openConversation(user.id, body.property_id);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(messageHistoryQuerySchema)) query: MessageHistoryQuery,
  ): Promise<ChatMessagesPage> {
    return this.chat.getMessages(user.id, id, query);
  }

  /** The HTTP twin of the socket's `message:send`, for when the socket is down. */
  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ): Promise<ChatMessage> {
    return this.chat.sendMessage(user.id, id, body);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ marked: number }> {
    return this.chat.markRead(user.id, id);
  }

  // Saved replies are an agency perk: PerksGuard turns anyone else away with 403 PERKS_REQUIRED.

  @Get('templates')
  @UseGuards(PerksGuard)
  @RequiresPerks()
  listTemplates(@CurrentUser() user: AuthenticatedUser): Promise<ChatTemplate[]> {
    return this.templates.list(user.id);
  }

  @Post('templates')
  @UseGuards(PerksGuard)
  @RequiresPerks()
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTemplateSchema)) body: CreateTemplateInput,
  ): Promise<ChatTemplate> {
    return this.templates.create(user.id, body);
  }

  @Patch('templates/:id')
  @UseGuards(PerksGuard)
  @RequiresPerks()
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTemplateSchema)) body: UpdateTemplateInput,
  ): Promise<ChatTemplate> {
    return this.templates.update(user.id, id, body);
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PerksGuard)
  @RequiresPerks()
  deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.templates.remove(user.id, id);
  }
}
