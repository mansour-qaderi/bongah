import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { DiskChatImageStorage } from '../chat/images/disk-chat-image.storage.js';
import { PerksModule } from '../perks/perks.module.js';
import { PROPERTY_IMAGE_SETTINGS, readPropertyImageSettings, type PropertyImageSettings } from './property-images.config.js';
import { PropertyImagesController } from './property-images.controller.js';
import { PropertyImagesService } from './property-images.service.js';
import { PROPERTY_IMAGE_STORAGE } from './property-image.storage.js';

@Module({
  imports: [AuthModule, PerksModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [PropertyImagesController],
  providers: [
    { provide: PROPERTY_IMAGE_SETTINGS, inject: [ConfigService], useFactory: readPropertyImageSettings },
    {
      // Local disk for now (its own subfolder of UPLOAD_DIR). Swap this one provider for object storage
      // (S3 / R2 / GCS) before production.
      provide: PROPERTY_IMAGE_STORAGE,
      inject: [PROPERTY_IMAGE_SETTINGS],
      useFactory: (settings: PropertyImageSettings) => new DiskChatImageStorage(settings.uploadDir, 'property-images'),
    },
    PropertyImagesService,
  ],
  exports: [PropertyImagesService],
})
export class PropertyImagesModule {}
