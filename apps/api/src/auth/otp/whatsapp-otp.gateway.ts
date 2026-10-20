import { Injectable, Logger } from '@nestjs/common';
import { OtpGateway } from './otp-gateway.js';
import type { WhatsAppSettings } from './otp.config.js';

/**
 * Sends the verification code through the WhatsApp Business Cloud API (Meta), using an approved "authentication"
 * message template. WhatsApp only lets a business start a conversation with a template, so the code travels as the
 * template's parameter: once in the body, and once in the "copy code" button an authentication template carries.
 *
 * What a successful call means: Meta accepted the message for delivery. It can still fail afterwards (the number has
 * no WhatsApp, the user blocked the business); that is reported later through a status webhook, which this does not
 * consume. So a user without WhatsApp sees "sent" and receives nothing, and the app tells them where the code goes.
 *
 * The code and the access token are never written to a log.
 */
@Injectable()
export class WhatsAppOtpGateway extends OtpGateway {
  private readonly logger = new Logger('WhatsAppOtp');

  constructor(private readonly settings: WhatsAppSettings) {
    super();
  }

  async send(phone: string, code: string): Promise<void> {
    const { baseUrl, apiVersion, phoneNumberId, accessToken, templateName, templateLanguage, timeoutMs } = this.settings;
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone.replace(/^\+/, ''), // WhatsApp wants the digits with the country code, no plus sign
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    };

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new Error(timedOut ? `WhatsApp API did not answer within ${timeoutMs} ms` : 'WhatsApp API could not be reached');
    }

    if (!response.ok) {
      // Meta's error object carries a numeric code and a message; neither contains the token or the code.
      const detail = await response
        .json()
        .then((json: { error?: { code?: number; message?: string } }) => json.error)
        .catch(() => undefined);
      this.logger.error(
        `WhatsApp API refused the message: HTTP ${response.status}, code ${detail?.code ?? '?'}: ${detail?.message ?? 'no detail'}` +
          hintFor(detail?.code),
      );
      throw new Error(`WhatsApp API answered HTTP ${response.status}`);
    }
  }
}

/** What a Meta error code usually means here, so the server log says what to fix instead of only repeating Meta's words. */
function hintFor(code: number | undefined): string {
  switch (code) {
    case 190:
      return ' (hint: WHATSAPP_ACCESS_TOKEN is invalid or has expired; temporary tokens last 24 hours, so use a System User token)';
    case 131030:
      return ' (hint: with a test number, the recipient must be added to the allowed list in the Meta dashboard)';
    case 132000:
    case 132001:
    case 132005:
    case 132012:
      return ' (hint: the template name/language is not approved or its parameters do not match; check WHATSAPP_TEMPLATE_NAME and WHATSAPP_TEMPLATE_LANGUAGE)';
    case 133010:
      return ' (hint: the sending phone number is not registered with the Cloud API yet)';
    case 100:
      return ' (hint: WHATSAPP_PHONE_NUMBER_ID is probably wrong; it is the ID of the number in the Meta dashboard, not the number itself)';
    default:
      return '';
  }
}
