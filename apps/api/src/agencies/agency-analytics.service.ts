import { Injectable, NotFoundException } from '@nestjs/common';
import type { AgencyAnalytics, AgencyAnalyticsDay, AgencyListingStats } from '@bongah/shared-types';
import { kabulDayKey, kabulDayList, kabulDayStart } from '../contact/contact.time.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TOP_LISTINGS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CountRow {
  day: string;
  property_id: string | null;
  n: number;
}

@Injectable()
export class AgencyAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The agency's views, leads and phone reveals over the last `days` Kabul days (today included).
   *
   * "The agency's listings" are the ones published under its agency profile (properties.agency_id), the
   * same rule as the dashboard. Every figure is a count of events with a date, grouped by the Kabul day
   * it happened on:
   *  - views: property_view_days (counted since daily counts began; `lifetime_views` has the older ones too);
   *  - leads: chats about its listings where the buyer sent at least one message, by the day the chat was opened;
   *  - phone reveals: unlock logs of its listings. One reveal covers every listing of that number for the
   *    day, and is counted against the listing it was made from.
   */
  async get(userId: string, days: number): Promise<AgencyAnalytics> {
    const agency = await this.prisma.agency.findUnique({ where: { userId }, select: { id: true } });
    if (!agency) {
      throw new NotFoundException({ message: 'Register your agency first.', code: 'AGENCY_PROFILE_REQUIRED' });
    }
    const agencyId = agency.id;

    const today = kabulDayKey(new Date());
    const dayList = kabulDayList(today, days);
    const first = dayList[0];
    const last = dayList[dayList.length - 1];
    const startInstant = kabulDayStart(first);
    const endInstant = new Date(kabulDayStart(last).getTime() + DAY_MS); // exclusive

    const [views, leads, reveals, lifetime] = await Promise.all([
      this.prisma.$queryRaw<CountRow[]>`
        SELECT v.day::text AS day, v.property_id::text AS property_id, v.count::int AS n
          FROM property_view_days v
          JOIN properties p ON p.id = v.property_id
         WHERE p.agency_id = ${agencyId}::uuid AND v.day BETWEEN ${first}::date AND ${last}::date`,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT ((c.created_at AT TIME ZONE 'UTC') + interval '270 minutes')::date::text AS day,
               c.property_id::text AS property_id, count(*)::int AS n
          FROM conversations c
         WHERE c.agency_id = ${agencyId}::uuid
           AND c.created_at >= ${startInstant} AND c.created_at < ${endInstant}
           AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = c.buyer_id)
         GROUP BY 1, 2`,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT u.day_key::text AS day, u.property_id::text AS property_id, count(*)::int AS n
          FROM contact_unlock_logs u
          JOIN properties p ON p.id = u.property_id
         WHERE p.agency_id = ${agencyId}::uuid AND u.day_key BETWEEN ${first}::date AND ${last}::date
         GROUP BY 1, 2`,
      this.prisma.property.aggregate({ where: { agencyId }, _sum: { viewCount: true } }),
    ]);

    const series = new Map<string, AgencyAnalyticsDay>(
      dayList.map((day) => [day, { day, views: 0, leads: 0, phone_reveals: 0 }]),
    );
    const perListing = new Map<string, { views: number; leads: number; phone_reveals: number }>();
    const add = (rows: CountRow[], field: 'views' | 'leads' | 'phone_reveals') => {
      for (const row of rows) {
        const entry = series.get(row.day);
        if (entry) entry[field] += row.n;
        if (row.property_id) {
          const stats = perListing.get(row.property_id) ?? { views: 0, leads: 0, phone_reveals: 0 };
          stats[field] += row.n;
          perListing.set(row.property_id, stats);
        }
      }
    };
    add(views, 'views');
    add(leads, 'leads');
    add(reveals, 'phone_reveals');

    const ranked = [...perListing.entries()]
      .sort(([, a], [, b]) => b.views + b.leads + b.phone_reveals - (a.views + a.leads + a.phone_reveals))
      .slice(0, TOP_LISTINGS);
    const rows = await this.prisma.property.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      select: { id: true, title: true, status: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const listings: AgencyListingStats[] = ranked.flatMap(([id, stats]) => {
      const row = byId.get(id);
      return row ? [{ id, title: row.title, status: row.status, ...stats }] : [];
    });

    const daily = [...series.values()];
    return {
      range: { from: first, to: last, days },
      totals: {
        views: daily.reduce((sum, d) => sum + d.views, 0),
        leads: daily.reduce((sum, d) => sum + d.leads, 0),
        phone_reveals: daily.reduce((sum, d) => sum + d.phone_reveals, 0),
      },
      series: daily,
      listings,
      lifetime_views: lifetime._sum.viewCount ?? 0,
    };
  }
}
