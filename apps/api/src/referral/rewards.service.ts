import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { LADDER_SPEND_COST, type SpendLaddersResponse } from '@bongah/shared-types';
import { findActiveSubscription } from '../agencies/subscription.js';
import { Prisma, RewardType, Role } from '../generated/prisma/client.js';
import { PricingService } from '../hesabpay/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionService } from '../promotion/promotion.service.js';
import { readListingQuota } from '../property/property.quota.js';
import type { SpendLaddersDto } from './dto/spend-ladders.dto.js';

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotion: PromotionService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Spends some of the user's ladders (LADDER_SPEND_COST: three for a listing, seven for a frame) on one of two
   * things:
   *  - LISTING_QUOTA: one more listing, but only once the free ones are used up (a regular user's monthly free
   *    listing, an office's plan listings). It is a gift listing credit, which pays before anything else, so the
   *    person publishes it like any other listing.
   *  - FEATURED_FRAME: a featured frame (کادر ویژه) on one of the user's own active listings, for the same number
   *    of days a paid or credited frame lasts.
   * All or nothing: the ladders, the credit or the frame change together in one transaction, so a refusal anywhere
   * (not enough ladders, the free listings not used up, the listing gone) costs nothing.
   */
  async spendLadders(userId: string, input: SpendLaddersDto): Promise<SpendLaddersResponse> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // The user row is the lock every listing creation takes too, so a spend and a publish cannot interleave.
      const users = await tx.$queryRaw<{ role: Role; welcome: number; bonus: number }[]>`
        SELECT role::text AS role, welcome_listing_credits AS welcome, bonus_listing_credits AS bonus
          FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (users.length === 0) throw new UnauthorizedException();
      const user = users[0];

      let featuredUntil: Date | null = null;
      let extraListings: number | null = null;
      let propertyId: string | null = null;

      if (input.purpose === 'LISTING_QUOTA') {
        extraListings = await this.grantListingCredit(tx, userId, user, now);
      } else {
        propertyId = input.property_id;
        // Not yours / not active: refused before any ladder is touched, so a wrong id never costs seven.
        await this.promotion.assertPromotable(tx, userId, propertyId);
        const days = this.pricing.toWire(await this.pricing.effective(tx)).featured_ad_days;
        featuredUntil = await this.promotion.feature(tx, propertyId, days, now);
        if (featuredUntil === null) {
          throw new ConflictException({ message: 'Active property not found.', code: 'PROPERTY_NOT_ACTIVE' });
        }
      }

      // One statement takes the oldest unspent ladders the purpose costs, or fewer, in which case everything rolls back.
      const cost = LADDER_SPEND_COST[input.purpose];
      const spent = await tx.$queryRaw<{ id: string }[]>`
        UPDATE rewards
           SET consumed_at = ${now}, spent_on = ${input.purpose}::reward_spend, property_id = ${propertyId}::uuid
         WHERE id IN (
           SELECT id FROM rewards
            WHERE user_id = ${userId}::uuid AND type = 'LADDER_TOKEN' AND consumed_at IS NULL
            ORDER BY created_at, id
            LIMIT ${cost}
            FOR UPDATE SKIP LOCKED)
        RETURNING id`;
      if (spent.length !== cost) {
        throw new ConflictException({
          message: `You need ${cost} ladders.`,
          code: 'NOT_ENOUGH_LADDERS',
          needed: cost,
        });
      }

      const available = await tx.reward.count({
        where: { userId, type: RewardType.LADDER_TOKEN, consumedAt: null },
      });
      return {
        purpose: input.purpose,
        ladders_available: available,
        featured_until: featuredUntil?.toISOString() ?? null,
        extra_listings: extraListings,
      };
    });
  }

  /**
   * Adds one gift listing credit, if the account has really run out of listings. Returns the credits it now holds.
   * A regular user's credit is the welcome-style credit; an office's is its bonus listing credit.
   */
  private async grantListingCredit(
    tx: Prisma.TransactionClient,
    userId: string,
    user: { role: Role; welcome: number; bonus: number },
    now: Date,
  ): Promise<number> {
    const agency =
      user.role === Role.AGENCY
        ? await tx.agency.findUnique({ where: { userId }, select: { id: true } })
        : null;
    if (user.role === Role.AGENCY && (!agency || !(await findActiveSubscription(tx, agency.id, now)))) {
      // Without a running plan an office cannot publish, so another listing would be of no use to it.
      throw new ForbiddenException({
        message: 'An active subscription is required to publish listings.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }
    const quota = await readListingQuota(
      tx,
      userId,
      { role: user.role, welcomeListingCredits: user.welcome, bonusListingCredits: user.bonus, agency },
      now,
    );
    const exhausted = quota.limit !== null && quota.used >= quota.limit && quota.extra === 0;
    if (!exhausted) {
      throw new ConflictException({
        message: 'You can still publish listings, so there is nothing to unlock yet.',
        code: 'LISTING_QUOTA_NOT_EXHAUSTED',
      });
    }
    const field = user.role === Role.AGENCY ? 'bonusListingCredits' : 'welcomeListingCredits';
    const updated = await tx.user.update({
      where: { id: userId },
      data: { [field]: { increment: 1 } },
      select: { welcomeListingCredits: true, bonusListingCredits: true },
    });
    return user.role === Role.AGENCY ? updated.bonusListingCredits : updated.welcomeListingCredits;
  }
}
