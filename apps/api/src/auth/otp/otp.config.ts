import { ConfigService } from '@nestjs/config';

export type OtpProvider = 'mock' | 'whatsapp';

export interface WhatsAppSettings {
  accessToken: string;
  phoneNumberId: string;
  /** An approved "authentication" message template whose body takes the code as its one parameter. */
  templateName: string;
  templateLanguage: string;
  apiVersion: string;
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Which provider delivers verification codes. OTP_PROVIDER is the name now; SMS_PROVIDER, the setting this replaced,
 * is still honoured so an existing deployment keeps starting (its "mock" means the same thing).
 * The second value says whether the choice was written down, which production insists on.
 */
export function readOtpProvider(config: ConfigService): { provider: OtpProvider; explicit: boolean } {
  const raw = (config.get<string>('OTP_PROVIDER') ?? config.get<string>('SMS_PROVIDER') ?? '').trim().toLowerCase();
  if (raw === '') return { provider: 'mock', explicit: false };
  if (raw === 'mock' || raw === 'whatsapp') return { provider: raw, explicit: true };
  throw new Error(`Unsupported OTP_PROVIDER "${raw}". Use "whatsapp" (real delivery) or "mock" (log only).`);
}

/**
 * Whether a failed WhatsApp send still lets the person sign in, by handing the code back in the response (as the mock
 * provider always does). OTP_DEV_FALLBACK=true/false decides; left out, it is on everywhere except production, where
 * it would let anyone who can reach the API sign in as any number after making the gateway fail.
 */
export function readOtpDevFallback(config: ConfigService): boolean {
  const raw = (config.get<string>('OTP_DEV_FALLBACK') ?? '').trim().toLowerCase();
  if (raw === '') return (config.get<string>('NODE_ENV') ?? '') !== 'production';
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`OTP_DEV_FALLBACK must be "true" or "false" (got "${raw}").`);
}

/** Reads and validates the WhatsApp settings once, so a missing one fails at startup, not at the first login. */
export function readWhatsAppSettings(config: ConfigService): WhatsAppSettings {
  const text = (name: string): string => (config.get<string>(name) ?? '').trim();
  const missing = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_NAME'].filter((name) => !text(name));
  if (missing.length > 0) {
    throw new Error(`OTP_PROVIDER=whatsapp needs ${missing.join(', ')} to be set (see .env.example).`);
  }
  const phoneNumberId = text('WHATSAPP_PHONE_NUMBER_ID');
  if (!/^\d{5,32}$/.test(phoneNumberId)) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID must be the numeric phone number ID from the Meta dashboard (not the phone number itself).');
  }
  const apiVersion = text('WHATSAPP_API_VERSION') || 'v21.0';
  if (!/^v\d{1,2}\.\d$/.test(apiVersion)) {
    throw new Error(`WHATSAPP_API_VERSION must look like "v21.0" (got "${apiVersion}").`);
  }
  const rawTimeout = text('WHATSAPP_TIMEOUT_MS');
  const timeoutMs = rawTimeout ? Number(rawTimeout) : 8000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) {
    throw new Error('WHATSAPP_TIMEOUT_MS must be a whole number of milliseconds between 1000 and 60000.');
  }
  const templateName = text('WHATSAPP_TEMPLATE_NAME');
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) {
    throw new Error('WHATSAPP_TEMPLATE_NAME must be the template name as Meta shows it (lowercase letters, digits and underscores).');
  }
  return {
    accessToken: text('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId,
    templateName,
    templateLanguage: text('WHATSAPP_TEMPLATE_LANGUAGE') || 'fa',
    apiVersion,
    baseUrl: (text('WHATSAPP_API_BASE_URL') || 'https://graph.facebook.com').replace(/\/+$/, ''),
    timeoutMs,
  };
}
