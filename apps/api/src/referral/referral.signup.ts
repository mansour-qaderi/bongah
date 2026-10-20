import { grantContactCredits } from '../contact/contact.credits.js';
import { ContactCreditSource, Prisma, RewardReason, RewardType } from '../generated/prisma/client.js';

/**
 * What happens when someone signs up with a referral code. Plain functions over a Prisma client
 * (like map-location.tokens.ts) so AuthService can call them inside its signup transaction
 * without AuthModule and ReferralModule importing each other.
 */

/** The user who owns this (already normalised) code, or null. */
export async function findReferrerId(db: Prisma.TransactionClient, code: string): Promise<string | null> {
  const referrer = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  return referrer?.id ?? null;
}

/**
 * Gives the inviter (within the cap) one ladder (نردبان) for the friend who signed up with their code. The new user
 * starts with none: a new account holds 0 ladders. Both sides also get `contactCredits` contact reveal credits when
 * that is above 0.
 * Call it in the same transaction that creates the invited user: either the account and both
 * rewards exist, or none of them do. The (user, type, reason, invitee) UNIQUE index means the
 * same signup can never pay twice.
 *
 * Returns whether the inviter was rewarded.
 */
export async function grantSignupRewards(
  db: Prisma.TransactionClient,
  signup: { referrerId: string; inviteeId: string; maxRewardedInvites: number; contactCredits?: number },
): Promise<{ referrerRewarded: boolean }> {
  // Two friends signing up with one code at the same moment must not both slip under the cap:
  // take the inviter's row lock so their rewards are counted one after the other. NO KEY UPDATE
  // does not block the foreign-key checks of the signups themselves, only other holders of this same lock.
  await db.$queryRaw`SELECT id FROM users WHERE id = ${signup.referrerId}::uuid FOR NO KEY UPDATE`;

  const alreadyRewarded = await db.reward.count({
    where: { userId: signup.referrerId, reason: RewardReason.REFERRER_BONUS },
  });
  const referrerRewarded = alreadyRewarded < signup.maxRewardedInvites;

  if (referrerRewarded) {
    await db.reward.create({
      data: {
        type: RewardType.LADDER_TOKEN,
        amount: 1,
        inviteeId: signup.inviteeId,
        userId: signup.referrerId,
        reason: RewardReason.REFERRER_BONUS,
      },
    });
  }

  const credits = signup.contactCredits ?? 0;
  if (credits > 0) {
    // (user, invitee) is UNIQUE among referral batches, like the rewards above: no double pay.
    const batch = { source: ContactCreditSource.REFERRAL, amount: credits, inviteeId: signup.inviteeId };
    await grantContactCredits(db, { ...batch, userId: signup.inviteeId });
    if (referrerRewarded) await grantContactCredits(db, { ...batch, userId: signup.referrerId });
  }
  return { referrerRewarded };
}
