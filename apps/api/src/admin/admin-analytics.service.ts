import { Injectable } from '@nestjs/common';
import type { AdminOverview, Currency, MoneyByCurrency } from '@bongah/shared-types';
import { kabulDayKey, kabulDayList, kabulDayStart } from '../contact/contact.time.js';
import {
  AbuseReportStatus,
  AgencyVerificationStatus,
  PropertyStatus,
  Role,
  SubscriptionStatus,
  TransactionStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ACTIVE_USER_WINDOW_DAYS = 30;

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Platform-wide numbers for the admin home.
   *
   * Days are Kabul calendar days. Revenue is what was CONFIRMED (status SUCCESS, by `paid_at`) and is
   * reported per currency: afghani and dollars are never added together. "Active users" means signed in
   * (OTP login) during the last 30 days.
   */
  async overview(days: number): Promise<AdminOverview> {
    const now = new Date();
    const dayList = kabulDayList(kabulDayKey(now), days);
    const from = dayList[0];
    const to = dayList[dayList.length - 1];
    const start = kabulDayStart(from);
    const end = new Date(kabulDayStart(to).getTime() + DAY_MS); // exclusive
    const inRange = { gte: start, lt: end };
    const activeSince = new Date(now.getTime() - ACTIVE_USER_WINDOW_DAYS * DAY_MS);
    const success = { status: TransactionStatus.SUCCESS };

    const [
      revenueAll,
      revenueRange,
      revenueByPurpose,
      revenueDaily,
      paymentsByStatus,
      pendingOld,
      listingsByStatus,
      featuredNow,
      listingsNew,
      listingsRemoved,
      usersTotal,
      usersByRole,
      usersNew,
      usersActive,
      usersBanned,
      signups,
      agenciesSubscribed,
      agenciesVerified,
      agenciesPending,
      openReports,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({ by: ['currency'], where: success, _sum: { amount: true } }),
      this.prisma.transaction.groupBy({ by: ['currency'], where: { ...success, paidAt: inRange }, _sum: { amount: true } }),
      this.prisma.transaction.groupBy({
        by: ['purpose', 'currency'],
        where: { ...success, paidAt: inRange },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ day: string; currency: string; total: number }[]>`
        SELECT ((paid_at AT TIME ZONE 'UTC') + interval '270 minutes')::date::text AS day,
               currency, SUM(amount)::float8 AS total
          FROM transactions
         WHERE status = 'SUCCESS' AND paid_at >= ${start} AND paid_at < ${end}
         GROUP BY 1, 2
         ORDER BY 1, 2`,
      this.prisma.transaction.groupBy({ by: ['status'], where: { createdAt: inRange }, _count: { _all: true } }),
      this.prisma.transaction.count({
        where: { status: TransactionStatus.PENDING, createdAt: { lt: new Date(now.getTime() - HOUR_MS) } },
      }),
      this.prisma.property.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.property.count({
        where: { status: PropertyStatus.ACTIVE, isFeatured: true, featuredUntil: { gt: now } },
      }),
      this.prisma.property.count({ where: { createdAt: inRange } }),
      this.prisma.property.count({ where: { removedByAdminAt: { not: null } } }),
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.count({ where: { createdAt: inRange } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: activeSince } } }),
      this.prisma.user.count({ where: { bannedAt: { not: null } } }),
      this.prisma.$queryRaw<{ day: string; n: number }[]>`
        SELECT ((created_at AT TIME ZONE 'UTC') + interval '270 minutes')::date::text AS day, count(*)::int AS n
          FROM users
         WHERE created_at >= ${start} AND created_at < ${end}
         GROUP BY 1`,
      this.prisma.agency.count({
        where: {
          subscriptions: {
            some: { status: SubscriptionStatus.ACTIVE, startDate: { lte: now }, endDate: { gt: now } },
          },
        },
      }),
      this.prisma.agency.count({ where: { verificationStatus: AgencyVerificationStatus.VERIFIED } }),
      this.prisma.agency.count({ where: { verificationStatus: AgencyVerificationStatus.PENDING } }),
      this.prisma.abuseReport.count({ where: { status: AbuseReportStatus.OPEN } }),
    ]);

    const money = (rows: { currency: string; _sum: { amount: { toNumber(): number } | null } }[]): MoneyByCurrency[] =>
      rows
        .map((row) => ({ currency: row.currency as Currency, total: row._sum.amount?.toNumber() ?? 0 }))
        .sort((a, b) => a.currency.localeCompare(b.currency));
    const listingCount = (status: PropertyStatus) =>
      listingsByStatus.find((group) => group.status === status)?._count._all ?? 0;
    const paymentCount = (status: TransactionStatus) =>
      paymentsByStatus.find((group) => group.status === status)?._count._all ?? 0;
    const signupsByDay = new Map(signups.map((row) => [row.day, row.n]));

    return {
      generated_at: now.toISOString(),
      range: { from, to, days },
      revenue: {
        all_time: money(revenueAll),
        in_range: money(revenueRange),
        by_purpose: revenueByPurpose
          .map((row) => ({
            purpose: row.purpose,
            currency: row.currency as Currency,
            total: row._sum.amount?.toNumber() ?? 0,
            count: row._count._all,
          }))
          .sort((a, b) => b.total - a.total),
        daily: revenueDaily.map((row) => ({ day: row.day, currency: row.currency as Currency, total: row.total })),
      },
      payments: {
        succeeded: paymentCount(TransactionStatus.SUCCESS),
        failed: paymentCount(TransactionStatus.FAILED),
        pending: paymentCount(TransactionStatus.PENDING),
        pending_over_one_hour: pendingOld,
      },
      listings: {
        active: listingCount(PropertyStatus.ACTIVE),
        sold: listingCount(PropertyStatus.SOLD),
        archived: listingCount(PropertyStatus.ARCHIVED),
        featured_now: featuredNow,
        new_in_range: listingsNew,
        removed_by_admin: listingsRemoved,
      },
      users: {
        total: usersTotal,
        by_role: {
          USER: usersByRole.find((group) => group.role === Role.USER)?._count._all ?? 0,
          AGENCY: usersByRole.find((group) => group.role === Role.AGENCY)?._count._all ?? 0,
          ADMIN: usersByRole.find((group) => group.role === Role.ADMIN)?._count._all ?? 0,
        },
        new_in_range: usersNew,
        active_30d: usersActive,
        banned: usersBanned,
        daily_signups: dayList.map((day) => ({ day, count: signupsByDay.get(day) ?? 0 })),
      },
      agencies: { with_active_subscription: agenciesSubscribed, verified: agenciesVerified },
      moderation: { open_reports: openReports, pending_verifications: agenciesPending },
    };
  }
}
