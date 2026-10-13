import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONTACT_SETTINGS, readContactSettings } from './contact.config.js';
import { ContactService } from './contact.service.js';

@Module({
  providers: [
    { provide: CONTACT_SETTINGS, inject: [ConfigService], useFactory: readContactSettings },
    ContactService,
  ],
  exports: [ContactService, CONTACT_SETTINGS],
})
export class ContactModule {}
