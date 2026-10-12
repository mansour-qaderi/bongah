import { Injectable, Logger } from '@nestjs/common';
import { SmsGateway } from './sms-gateway.js';

/** Development stand-in: prints the SMS to the server log instead of sending it. */
@Injectable()
export class MockSmsGateway extends SmsGateway {
  private readonly logger = new Logger('MockSms');

  async send(to: string, message: string): Promise<void> {
    this.logger.warn(`[MOCK SMS] to ${to}: ${message}`);
  }
}
