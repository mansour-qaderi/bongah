import { Prisma, ContactCreditSource } from '../generated/prisma/client.js';

/**
 * Contact reveal credits. Plain functions over a Prisma client (like map-location.tokens.ts) so a
 * payment, a signup and a reveal can all use them inside their own transactions without their
 * modules importing each other.
 */

/**
 * Adds a batch of credits. A purchase passes its payment id (UNIQUE) and a referral reward the
 * invited friend's id (UNIQUE per user): replaying either fails instead of minting twice.
 */
export async function grantContactCredits(
  db: Prisma.TransactionClient,
  grant: {
    userId: string;
    source: ContactCreditSource;
    amount: number;
    transactionId?: string;
    inviteeId?: string;
  },
): Promise<void> {
  await db.userCredit.create({
    data: {
      userId: grant.userId,
      source: grant.source,
      amount: grant.amount,
      remaining: grant.amount,
      transactionId: grant.transactionId ?? null,
      inviteeId: grant.inviteeId ?? null,
    },
  });
}

/**
 * Spends one credit from the user's oldest batch that still has some, and returns that batch's id
 * (or null when they have none). One statement, so there is no gap between "find a batch" and
 * "take one": SKIP LOCKED makes two simultaneous spends use different batches instead of
 * both reading the same `remaining`, and the CHECK (remaining >= 0) is the final backstop.
 */
export async function spendContactCredit(db: Prisma.TransactionClient, userId: string): Promise<string | null> {
  const spent = await db.$queryRaw<{ id: string }[]>`
    UPDATE user_credits
       SET remaining = remaining - 1
     WHERE id = (
       SELECT id FROM user_credits
        WHERE user_id = ${userId}::uuid AND remaining > 0
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
    RETURNING id`;
  return spent[0]?.id ?? null;
}

export interface CreditBalance {
  /** Everything left, whatever its source. */
  total: number;
  /** The part that came from inviting friends or joining through a friend. */
  referral: number;
}

export async function contactCreditBalance(
  db: Prisma.TransactionClient,
  userId: string,
): Promise<CreditBalance> {
  const rows = await db.userCredit.groupBy({
    by: ['source'],
    where: { userId, remaining: { gt: 0 } },
    _sum: { remaining: true },
  });
  let total = 0;
  let referral = 0;
  for (const row of rows) {
    const sum = row._sum.remaining ?? 0;
    total += sum;
    if (row.source === ContactCreditSource.REFERRAL) referral += sum;
  }
  return { total, referral };
}
