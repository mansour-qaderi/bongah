import { Injectable, Logger } from '@nestjs/common';
import { OtpGateway } from './otp-gateway.js';

/**
 * Development / test stand-in: prints the code to the server log instead of sending it. The API also returns the code to
 * the app in this mode (AuthService), and the app shows it, so a build without WhatsApp credentials can still sign in.
 */
@Injectable()
export class MockOtpGateway extends OtpGateway {
  private readonly logger = new Logger('MockOtp');

  async send(phone: string, code: string): Promise<void> {
    this.logger.warn(`[MOCK OTP] to ${phone}: ${code}`);
  }
}
