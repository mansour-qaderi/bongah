import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import type { SendOtpResponse, VerifyOtpResponse } from './dto/auth-response.dto.js';
import { sendOtpSchema, type SendOtpDto } from './dto/send-otp.dto.js';
import { verifyOtpSchema, type VerifyOtpDto } from './dto/verify-otp.dto.js';

// Per-IP limits. They sit on top of the per-phone limits enforced in AuthService.
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sendOtp(@Body(new ZodValidationPipe(sendOtpSchema)) body: SendOtpDto): Promise<SendOtpResponse> {
    return this.authService.sendOtp(body.phone_number);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpDto,
  ): Promise<VerifyOtpResponse> {
    return this.authService.verifyOtp(body.phone_number, body.otp_code, body.referral_code);
  }
}
