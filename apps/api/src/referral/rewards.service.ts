import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { RedeemLadderTokenResponse } from '@bongah/shared-types';
import { RewardType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionService } from '../promotion/promotion.service.js';

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotion: PromotionService,
  ) {}

  /**
   * Spends one free ladder token to move the user's own listing to the top of search, exactly like
   * a paid ladder. All or nothing: if the listing can't be laddered, the token is not spent.
   */
  async redeemLadderToken(userId: string, propertyId: string): Promise<RedeemLadderTokenResponse> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Not yours / not active: refuse before touching the token, so a wrong id never costs one.
      await this.promotion.assertPromotable(tx, userId, propertyId);

      // One statement picks and spends the oldest token. SKIP LOCKED makes two redemptions at the
      // same moment take two different tokens, or the second one find none, never the same twice.
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE rewards
           SET consumed_at = ${now}, property_id = ${propertyId}::uuid
         WHERE id = (
           SELECT id FROM rewards
            WHERE user_id = ${userId}::uuid AND type = 'LADDER_TOKEN' AND consumed_at IS NULL
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE SKIP LOCKED)
        RETURNING id`;
      if (claimed.length !== 1) {
        throw new ConflictException({ message: 'You have no free ladder token.', code: 'NO_LADDER_TOKEN' });
      }

      // The listing was archived or sold since the check above: roll the token back with everything else.
      if (!(await this.promotion.ladder(tx, propertyId, now))) {
        throw new NotFoundException('Active property not found.');
      }

      const remaining = await tx.reward.count({
        where: { userId, type: RewardType.LADDER_TOKEN, consumedAt: null },
      });
      return { property_id: propertyId, laddered_at: now.toISOString(), ladder_tokens_available: remaining };
    });
  }
}
