import type { Currency, PaymentSummary } from '@bongah/shared-types';
import type { Prisma } from '../generated/prisma/client.js';

/** What the payment mappers need alongside the payment row itself. */
export const paymentInclude = {
  property: { select: { id: true, title: true } },
} satisfies Prisma.TransactionInclude;

export type PaymentRow = Prisma.TransactionGetPayload<{ include: typeof paymentInclude }>;

/** A payment as its payer sees it. Everything except the status of a payment is fixed once it succeeds. */
export function toPaymentSummary(row: PaymentRow): PaymentSummary {
  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    amount: row.amount.toNumber(),
    // Stored as text ("AFGHANI" / "USD"): only ever written from the validated setting.
    currency: row.currency as Currency,
    created_at: row.createdAt.toISOString(),
    paid_at: row.paidAt?.toISOString() ?? null,
    receipt_number: row.receiptNumber,
    package_type: row.packageType,
    quantity: row.quantity,
    property_title: row.property?.title ?? null,
    method: row.method,
    receipt_uploaded: row.proofImageId !== null,
    reference: row.paymentReference,
    review_note: row.reviewNote,
  };
}
