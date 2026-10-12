import { BadRequestException } from '@nestjs/common';
import type { VerifiedWebhookEvent } from './hesabpay-gateway.js';

const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Parses the webhook JSON into the provider-independent event. Used only AFTER the signature is
 * verified. Strict: a payload we don't fully understand is rejected, never guessed at.
 *
 * Expected body: { transaction_id: string, status: "SUCCESS"|"FAILED", amount?: number|string, currency?: string }
 */
export function parseWebhookPayload(raw: Buffer): VerifiedWebhookEvent {
  let data: unknown;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new BadRequestException('Webhook body is not valid JSON.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new BadRequestException('Webhook body must be a JSON object.');
  }
  const body = data as Record<string, unknown>;

  const sessionId = body.transaction_id;
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 200) {
    throw new BadRequestException('Webhook is missing transaction_id.');
  }
  const status = body.status;
  if (status !== 'SUCCESS' && status !== 'FAILED') {
    throw new BadRequestException('Webhook status must be SUCCESS or FAILED.');
  }

  let amount: string | undefined;
  if (body.amount !== undefined && body.amount !== null) {
    amount = String(body.amount);
    if (!AMOUNT_PATTERN.test(amount)) {
      throw new BadRequestException('Webhook amount is not a valid money amount.');
    }
  }
  let currency: string | undefined;
  if (body.currency !== undefined && body.currency !== null) {
    if (typeof body.currency !== 'string') {
      throw new BadRequestException('Webhook currency must be a string.');
    }
    currency = body.currency.toUpperCase();
  }

  return { sessionId, status, amount, currency };
}
