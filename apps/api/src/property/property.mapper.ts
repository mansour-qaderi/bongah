import type { SubscriptionPackage } from '@bongah/shared-types';
import type { Property as PropertyRow } from '../generated/prisma/client.js';
import type { PropertyDto } from './dto/property-response.dto.js';

/**
 * Load this with a listing so its agency's public name and current plan can be shown without a second query.
 * Every ACTIVE subscription is loaded (an agency has a handful at most) and `toPropertyDto` picks the one that is
 * running at its `now`, so the choice of "now" stays with the caller and nothing here goes stale.
 */
export const WITH_AGENCY_NAME = {
  agency: {
    select: {
      agencyName: true,
      subscriptions: {
        where: { status: 'ACTIVE' },
        select: { packageType: true, startDate: true, endDate: true },
      },
    },
  },
} as const;

/** A listing row, optionally with its agency (see WITH_AGENCY_NAME). Without it `agency_name` and `agency_plan` are null. */
export type PropertyRowWithAgency = PropertyRow & {
  agency?: {
    agencyName: string;
    subscriptions?: { packageType: SubscriptionPackage; startDate: Date; endDate: Date }[];
  } | null;
};

/** The plan the listing's agency has running at `now`, or null (private owner, no plan, or a lapsed one). */
export function runningPlanAt(row: PropertyRowWithAgency, now: Date): SubscriptionPackage | null {
  const running = row.agency?.subscriptions?.find((s) => s.startDate <= now && s.endDate > now);
  return running?.packageType ?? null;
}

/**
 * Whether a paid featured promotion is running at `now`. THE definition: the flag alone goes
 * stale when the promotion ends, so it only counts while featured_until is still ahead.
 */
export function isFeaturedAt(row: Pick<PropertyRow, 'isFeatured' | 'featuredUntil'>, now: Date): boolean {
  return row.isFeatured && row.featuredUntil !== null && row.featuredUntil > now;
}

/** Converts a database row to the public snake_case shape. `now` decides whether a promotion is still running. */
export function toPropertyDto(row: PropertyRowWithAgency, now: Date): PropertyDto {
  return {
    id: row.id,
    user_id: row.userId,
    agency_id: row.agencyId,
    agency_name: row.agency?.agencyName ?? null,
    agency_plan: runningPlanAt(row, now),
    title: row.title,
    description: row.description,
    type: row.type,
    unit_type: row.unitType,
    deal_type: row.dealType,
    // NUMERIC(14,2) always fits a double exactly enough to round-trip with 2 decimals.
    price: row.price.toNumber(),
    currency: row.currency,
    area_sqm: row.areaSqm,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    province: row.province,
    district: row.district,
    neighborhood: row.neighborhood,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    images: row.images,
    status: row.status,
    is_featured: isFeaturedAt(row, now),
    featured_until: row.featuredUntil?.toISOString() ?? null,
    laddered_at: row.ladderedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
