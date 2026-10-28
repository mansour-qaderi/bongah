import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AgencyTrial, Wallet, WalletSubscription } from '@bongah/shared-types';
import { DAY_MS, summariseSubscription } from '../agencies/subscription.js';
import { AGENCY_TRIAL_SETTINGS, type AgencyTrialSettings } from '../agencies/trial.config.js';
import { isTrialRunning } from '../agencies/trial.js';
import { contactCreditBalance } from '../contact/contact.credits.js';
import { RewardType } from '../generated/prisma/client.js';
import { HesabpayService } from '../hesabpay/hesabpay.service.js';
import { MapLocationService } from '../map-location/map-location.service.js';
import { accountPerkReason } from '../perks/perks.access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { readListingQuota } from '../property/property.quota.js';

const RECENT_PAYMENTS = 5;

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hesabpay: HesabpayService,
    private readonly mapLocation: MapLocationService,
    @Inject(AGENCY_TRIAL_SETTINGS) private readonly trialSettings: AgencyTrialSettings,
  ) {}

  /** What the signed-in user has bought or earned, in one call (the wallet screen, app and web). */
  async get(userId: string): Promise<Wallet> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        welcomeListingCredits: true,
        bonusListingCredits: true,
        agency: { select: { id: true, trialEndsAt: true, trialListingsUsed: true } },
      },
    });
    if (!user) throw new UnauthorizedException();

    const [subscription, map, credits, perk, ladder, recent, listingQuota] = await Promise.all([
      user.agency ? this.subscriptionOf(user.agency.id, now) : Promise.resolve(null),
      this.mapLocation.getStatus(userId),
      contactCreditBalance(this.prisma, userId),
      accountPerkReason(this.prisma, userId, user.role, now),
      this.prisma.reward.count({ where: { userId, type: RewardType.LADDER_TOKEN, consumedAt: null } }),
      this.hesabpay.listPayments(userId, { page: 1, limit: RECENT_PAYMENTS }),
      readListingQuota(this.prisma, userId, user, now, this.trialSettings.listings),
    ]);

    return {
      server_time: now.toISOString(),
      subscription,
      map_location: map,
      contact_credits: credits.total,
      contact_unlimited: perk !== null,
      ladder_tokens: ladder,
      listing_quota: listingQuota,
      trial: user.agency ? this.trialOf(user.agency, now) : null,
      recent_payments: recent.data,
    };
  }

  /** The agency's free trial, or null when it never had one (trials were switched off when it registered). */
  private trialOf(agency: { trialEndsAt: Date | null; trialListingsUsed: number }, now: Date): AgencyTrial | null {
    if (!agency.trialEndsAt) return null;
    return {
      is_active: isTrialRunning(agency.trialEndsAt, now),
      ends_at: agency.trialEndsAt.toISOString(),
      remaining_days: Math.max(0, Math.ceil((agency.trialEndsAt.getTime() - now.getTime()) / DAY_MS)),
      listings_limit: this.trialSettings.listings,
      listings_used: Math.min(agency.trialListingsUsed, this.trialSettings.listings),
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
