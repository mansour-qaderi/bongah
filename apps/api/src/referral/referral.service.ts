import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReferralSummary } from '@bongah/shared-types';
import { RewardReason, RewardType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildShareUrl, readReferralSettings, type ReferralSettings } from './referral.config.js';

/** How many invited friends / rewards the summary lists. The counts in `stats` are always complete. */
export const SUMMARY_LIST_LIMIT = 50;

@Injectable()
export class ReferralService {
  private readonly settings: ReferralSettings;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.settings = readReferralSettings(config);
  }

  /** Everything the Referral screen shows: my code, my invite link, who joined, what I earned. */
  async getSummary(userId: string): Promise<ReferralSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (!user) throw new UnauthorizedException();

    const ladder = { userId, type: RewardType.LADDER_TOKEN };
    const [invitedCount, rewardedInvites, available, earned, invitees, rewards] = await Promise.all([
      this.prisma.user.count({ where: { referredById: userId } }),
      this.prisma.reward.count({ where: { userId, reason: RewardReason.REFERRER_BONUS } }),
      this.prisma.reward.count({ where: { ...ladder, consumedAt: null } }),
      this.prisma.reward.count({ where: ladder }),
      this.prisma.user.findMany({
        where: { referredById: userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SUMMARY_LIST_LIMIT,
        select: { id: true, fullName: true, phoneNumber: true, createdAt: true },
      }),
      this.prisma.reward.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SUMMARY_LIST_LIMIT,
        select: { type: true, reason: true, amount: true, createdAt: true, consumedAt: true },
      }),
    ]);

    // Which of the listed friends earned me something (the rest joined after I hit the cap).
    const paid = await this.prisma.reward.findMany({
      where: { userId, reason: RewardReason.REFERRER_BONUS, inviteeId: { in: invitees.map((i) => i.id) } },
      select: { inviteeId: true },
    });
    const paidFor = new Set(paid.map((r) => r.inviteeId));

    return {
      referral_code: user.referralCode,
      share_url: buildShareUrl(this.settings.linkTemplate, user.referralCode),
      stats: {
        invited_count: invitedCount,
        rewarded_invites: rewardedInvites,
        max_rewarded_invites: this.settings.maxRewardedInvites,
        ladder_tokens_available: available,
        ladder_tokens_earned: earned,
      },
      invited: invitees.map((i) => ({
        name: i.fullName,
        phone_masked: maskPhone(i.phoneNumber),
        joined_at: i.createdAt.toISOString(),
        reward_granted: paidFor.has(i.id),
      })),
      rewards: rewards.map((r) => ({
        type: r.type,
        reason: r.reason,
        amount: r.amount,
        created_at: r.createdAt.toISOString(),
        used_at: r.consumedAt?.toISOString() ?? null,
      })),
    };
  }
}

/** +93701234567 -> +9370••••567: enough to recognise a contact, not enough to call or look them up. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 5)}••••${phone.slice(-3)}`;
}
