import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { ContactModule } from '../contact/contact.module.js';
import { PropertyController } from './property.controller.js';
import { PropertyService } from './property.service.js';

@Module({
  // AuthModule exports JwtAuthGuard (+ JwtModule); ThrottlerModule provides the guard's storage.
  imports: [AuthModule, ContactModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [PropertyController],
  providers: [PropertyService],
  exports: [PropertyService],
})
export class PropertyModule {}
