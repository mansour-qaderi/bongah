/**
 * Contract for whatever delivers SMS. Implement it for your provider and register it in
 * AuthModule (see the SMS_PROVIDER switch there). Also used as the injection token.
 */
export abstract class SmsGateway {
  /** Must reject if the message could not be handed to the provider. */
  abstract send(to: string, message: string): Promise<void>;
}
