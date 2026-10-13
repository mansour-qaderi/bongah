import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Wallet, WalletSubscription } from '@bongah/shared-types';
import { DAY_MS, summariseSubscription } from '../agencies/subscription.js';
import { contactCreditBalance } from '../contact/contact.credits.js';
import { RewardType } from '../generated/prisma/client.js';
import { HesabpayService } from '../hesabpay/hesabpay.service.js';
import { MapLocationService } from '../map-location/map-location.service.js';
import { accountPerkReason } from '../perks/perks.access.js';
import { PrismaService } from '../prisma/prisma.service.js';

const RECENT_PAYMENTS = 5;

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hesabpay: HesabpayService,
    private readonly mapLocation: MapLocationService,
  ) {}

  /** What the signed-in user has bought or earned, in one call (the wallet screen, app and web). */
  async get(userId: string): Promise<Wallet> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, agency: { select: { id: true } } },
    });
    if (!user) throw new UnauthorizedException();

    const [subscription, map, credits, perk, ladder, recent] = await Promise.all([
      user.agency ? this.subscriptionOf(user.agency.id, now) : Promise.resolve(null),
      this.mapLocation.getStatus(userId),
      contactCreditBalance(this.prisma, userId),
      accountPerkReason(this.prisma, userId, user.role, now),
      this.prisma.reward.count({ where: { userId, type: RewardType.LADDER_TOKEN, consumedAt: null } }),
      this.hesabpay.listPayments(userId, { page: 1, limit: RECENT_PAYMENTS }),
    ]);

    return {
      server_time: now.toISOString(),
      subscription,
      map_location: map,
      contact_credits: credits.total,
      contact_unlimited: perk !== null,
      ladder_tokens: ladder,
      recent_payments: recent.data,
    };
  }

  private async subscriptionOf(agencyId: string, now: Date): Promise<WalletSubscription> {
    const plan = await summariseSubscription(this.prisma, agencyId, now);
    const queued = plan.queued.map((item) => ({
      package_type: item.packageType,
      starts_at: item.startDate.toISOString(),
      ends_at: item.endDate.toISOString(),
    }));
    if (!plan.running || !plan.until) {
      return {
        is_active: false,
        package_type: null,
        started_at: null,
        ends_at: null,
        remaining_days: 0,
        remaining_seconds: 0,
        queued,
      };
    }
    const msLeft = plan.until.getTime() - now.getTime();
    return {
      is_active: true,
      package_type: plan.running.packageType,
      started_at: plan.running.startDate.toISOString(),
      ends_at: plan.until.toISOString(),
      remaining_days: Math.ceil(msLeft / DAY_MS),
      remaining_seconds: Math.max(0, Math.floor(msLeft / 1000)),
      queued,
    };
  }
}
