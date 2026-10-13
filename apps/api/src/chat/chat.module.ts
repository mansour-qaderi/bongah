import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { PerksModule } from '../perks/perks.module.js';
import { ChatImagesController } from './chat-images.controller.js';
import { ChatImagesService } from './chat-images.service.js';
import { ChatTemplatesService } from './chat-templates.service.js';
import { CHAT_SETTINGS, readChatSettings, type ChatSettings } from './chat.config.js';
import { ChatController } from './chat.controller.js';
import { ChatEventsBus } from './chat.events.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { CHAT_IMAGE_STORAGE } from './images/chat-image.storage.js';
import { DiskChatImageStorage } from './images/disk-chat-image.storage.js';

@Module({
  // AuthModule exports JwtModule (the gateway verifies the same access tokens); ThrottlerModule backs the REST guards.
  imports: [AuthModule, PerksModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [ChatController, ChatImagesController],
  providers: [
    { provide: CHAT_SETTINGS, inject: [ConfigService], useFactory: readChatSettings },
    {
      // Local disk for now. Swap this one provider for object storage (S3 / R2 / GCS) before production.
      provide: CHAT_IMAGE_STORAGE,
      inject: [CHAT_SETTINGS],
      useFactory: (settings: ChatSettings) => new DiskChatImageStorage(settings.uploadDir),
    },
    ChatEventsBus,
    ChatService,
    ChatTemplatesService,
    ChatImagesService,
    ChatGateway,
  ],
  exports: [ChatService, ChatEventsBus],
})
export class ChatModule {}
