import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import type { HesabPaySettings } from '../hesabpay.config.js';
import {
  HesabPayGateway,
  type PaymentSession,
  type PaymentSessionRequest,
  type VerifiedWebhookEvent,
  type WebhookInput,
} from './hesabpay-gateway.js';
import { parseWebhookPayload } from './webhook-payload.js';

/*
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ UNVERIFIED AGAINST THE REAL HESABPAY API.                                            ║
 * ║                                                                                      ║
 * ║ Public documentation only confirms two endpoints under https://api.hesab.com/api/v1: ║
 * ║   POST payment/create-session            (creates a payment link)                    ║
 * ║   POST hesab/webhooks/verify-signature   (checks a webhook's authenticity)           ║
 * ║ and that an API key authenticates the merchant. Everything marked ASSUMPTION below   ║
 * ║ (HTTP method, header name, field names, response shapes) is a guess. Check each one  ║
 * ║ against https://developers.hesab.com before switching HESABPAY_MODE to "live".       ║
 * ║                                                                                      ║
 * ║ The webhook payload shape ({ transaction_id, status, amount?, currency? }) is        ║
 * ║ likewise an assumption: see webhook-payload.ts.                                      ║
 * ║                                                                                      ║
 * ║ The adapter fails closed: if HesabPay answers in any shape other than the one coded  ║
 * ║ here, creating a payment fails and every webhook is rejected. Nothing is ever        ║
 * ║ fulfilled on a response this file does not fully understand.                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

// ── ASSUMPTIONS: adjust these to match the real API ─────────────────────────────────────
const CREATE_SESSION_PATH = 'payment/create-session';
const VERIFY_SIGNATURE_PATH = 'hesab/webhooks/verify-signature';
const AUTH_HEADER = 'Authorization'; // ASSUMPTION: header name
const AUTH_VALUE_PREFIX = 'Bearer '; // ASSUMPTION: scheme

/** ASSUMPTION: request body of create-session. */
function buildSessionBody(request: PaymentSessionRequest) {
  return {
    reference: request.reference,
    currency: request.currency === 'AFGHANI' ? 'AFN' : request.currency,
    items: [{ name: request.description, quantity: 1, price: Number(request.amount) }],
  };
}

/** ASSUMPTION: response body of create-session is { session_id: string, session_url: string } (optionally under "data"). */
function parseSessionResponse(body: unknown): PaymentSession | null {
  const root = isRecord(body) && isRecord(body.data) ? body.data : body;
  if (!isRecord(root)) return null;
  const { session_id: id, session_url: url } = root;
  if (typeof id !== 'string' || !id || typeof url !== 'string' || !url.startsWith('https://')) {
    return null;
  }
  return { id, paymentUrl: url };
}

/** ASSUMPTION: what verify-signature expects: the webhook's JSON body plus the x-* headers it came with. */
function buildVerifyBody(input: WebhookInput) {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) {
    if (name.startsWith('x-') && typeof value === 'string') headers[name] = value;
  }
  return { body: JSON.parse(input.rawBody.toString('utf8')) as unknown, headers };
}

/** ASSUMPTION: verify-signature answers 2xx with { valid: true } (optionally under "data"). Anything else is "not valid". */
function isVerifiedResponse(body: unknown): boolean {
  const root = isRecord(body) && isRecord(body.data) ? body.data : body;
  return isRecord(root) && root.valid === true;
}
// ────────────────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class LiveHesabPayGateway extends HesabPayGateway {
  private readonly logger = new Logger(LiveHesabPayGateway.name);
  private readonly http: AxiosInstance;

  constructor(settings: HesabPaySettings) {
    super();
    this.logger.warn(
      'HESABPAY_MODE=live uses an adapter that has NOT been verified against the HesabPay API. ' +
        'See live-hesabpay.gateway.ts.',
    );
    this.http = axios.create({
      baseURL: `${settings.baseUrl}/`,
      timeout: 10_000,
      headers: { [AUTH_HEADER]: `${AUTH_VALUE_PREFIX}${settings.apiKey}` },
      // Never follow redirects with the API key attached.
      maxRedirects: 0,
    });
  }

  async createSession(request: PaymentSessionRequest): Promise<PaymentSession> {
    let responseBody: unknown;
    try {
      const response = await this.http.post(CREATE_SESSION_PATH, buildSessionBody(request));
      responseBody = response.data;
    } catch (error) {
      this.logger.error(`create-session failed: ${describeError(error)}`);
      throw new BadGatewayException('The payment provider is unavailable. Try again later.');
    }

    const session = parseSessionResponse(responseBody);
    if (!session) {
      this.logger.error('create-session returned an unrecognised response shape.');
      throw new BadGatewayException('The payment provider returned an unexpected response.');
    }
    return session;
  }

  async verifyWebhook(input: WebhookInput): Promise<VerifiedWebhookEvent> {
    let verifyBody: unknown;
    try {
      verifyBody = buildVerifyBody(input);
    } catch {
      throw new UnauthorizedException('Webhook body is not valid JSON.');
    }

    let responseBody: unknown;
    try {
      const response = await this.http.post(VERIFY_SIGNATURE_PATH, verifyBody);
      responseBody = response.data;
    } catch (error) {
      // ASSUMPTION: 400/422 means "this webhook is not authentic". Any other failure (our API key
      // rejected, outage, redirect...) means we could not check: answer 502 so HesabPay retries
      // later, rather than 401, which could make it give up on a real payment.
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.error(`verify-signature failed: ${describeError(error)}`);
      if (status === 400 || status === 422) {
        throw new UnauthorizedException('Invalid webhook signature.');
      }
      throw new BadGatewayException('Could not verify the webhook right now.');
    }

    if (!isVerifiedResponse(responseBody)) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
    return parseWebhookPayload(input.rawBody);
  }
}

/** Status/code only: never the request headers, which carry the API key. */
function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return `${error.code ?? 'ERR'} status=${error.response?.status ?? 'none'}`;
  }
  return error instanceof Error ? error.message : 'unknown error';
}
