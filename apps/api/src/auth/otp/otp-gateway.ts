/**
 * Contract for whatever delivers the 6-digit verification code to a user. The production implementation sends it to
 * the user's WhatsApp (see WhatsAppOtpGateway); the mock prints it to the server log. Also the injection token.
 */
export abstract class OtpGateway {
  /**
   * `phone` is the user's number in international form ("+93790049201"). Must reject if the code could not be handed
   * to the provider, so the caller can give the user their cooldown back.
   */
  abstract send(phone: string, code: string): Promise<void>;
}
