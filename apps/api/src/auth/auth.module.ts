import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { readJwtSettings } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import {
  MockOtpGateway,
  OtpGateway,
  readOtpDevFallback,
  readOtpProvider,
  readWhatsAppSettings,
  WhatsAppOtpGateway,
} from './otp/index.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { secret, expiresInSeconds } = readJwtSettings(config);
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: expiresInSeconds },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
    // In-memory counters: per server instance. Move to a shared store if you run several.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: OtpGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService): OtpGateway => {
        const { provider, explicit } = readOtpProvider(config);
        if (provider === 'whatsapp') {
          if (readOtpDevFallback(config) && config.get<string>('NODE_ENV') === 'production') {
            new Logger('AuthModule').warn(
              'OTP_DEV_FALLBACK=true in production: when WhatsApp fails, the code is returned in the response, so anyone ' +
                'who can make the gateway fail can sign in as any phone number. Use for testing only.',
            );
          }
          return new WhatsAppOtpGateway(readWhatsAppSettings(config));
        }
        if (config.get<string>('NODE_ENV') === 'production') {
          // Allowed for testing deployments (e.g. a Render staging service), but only as a deliberate choice:
          // the default being "mock" must never switch it on by accident.
          if (!explicit) {
            throw new Error('In production OTP_PROVIDER must be set explicitly ("whatsapp" for real delivery, "mock" for testing).');
          }
          new Logger('AuthModule').warn(
            'OTP_PROVIDER=mock in production: verification codes are NOT sent; they are returned in the response of the ' +
              'send-code request (the app shows them) and written to the server log. Anyone who can reach the API can ' +
              'sign in as any phone number. Use for testing only, and set OTP_PROVIDER=whatsapp for real users.',
          );
        }
        return new MockOtpGateway();
      },
    },
  ],
  // Export the guards and JwtModule so other modules can protect their routes.
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
