import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { readJwtSettings } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { MockSmsGateway } from './sms/mock-sms.gateway.js';
import { SmsGateway } from './sms/sms-gateway.js';

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
      provide: SmsGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SmsGateway => {
        const provider = config.get<string>('SMS_PROVIDER', 'mock');
        if (provider === 'mock') {
          if (config.get<string>('NODE_ENV') === 'production') {
            // Allowed for testing deployments (e.g. a Render staging service), but only as a
            // deliberate choice: the default being "mock" must never switch it on by accident.
            if (config.get<string>('SMS_PROVIDER') !== 'mock') {
              throw new Error(
                'In production SMS_PROVIDER must be set explicitly ("mock" for testing, or a real provider).',
              );
            }
            new Logger('AuthModule').warn(
              'SMS_PROVIDER=mock in production: OTP codes are only written to the server log and never sent by SMS. Use for testing only.',
            );
          }
          return new MockSmsGateway();
        }
        // Add a case per real provider, returning your SmsGateway implementation.
        throw new Error(`Unsupported SMS_PROVIDER "${provider}". Register its SmsGateway here.`);
      },
    },
  ],
  // Export the guards and JwtModule so other modules can protect their routes.
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
