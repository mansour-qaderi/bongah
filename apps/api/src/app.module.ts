import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AgenciesModule } from './agencies/agencies.module.js';
import { PropertyModule } from './property/property.module.js';
import { HesabpayModule } from './hesabpay/hesabpay.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AgenciesModule,
    PropertyModule,
    HesabpayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
