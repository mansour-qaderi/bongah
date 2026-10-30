import type { PlotBoundary, SubscriptionPackage } from '@bongah/shared-types';
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

/**
 * What a listing is loaded with when it is sent to the apps: its agency (see WITH_AGENCY_NAME) and its owner's name, so a
 * private owner is shown by name ("owner_name"). Only the name is read; the owner's number stays behind the contact reveal.
 */
export const WITH_PARTIES = {
  ...WITH_AGENCY_NAME,
  user: { select: { fullName: true } },
} as const;

/**
 * A listing row, optionally with its agency (see WITH_AGENCY_NAME) and its owner (see WITH_PARTIES). Without them
 * `agency_name`, `agency_plan` and `owner_name` are null.
 */
export type PropertyRowWithAgency = PropertyRow & {
  user?: { fullName: string | null } | null;
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

/**
 * The stored outline as the API sends it. It was checked on the way in (plotBoundarySchema); this only makes sure a
 * row edited by hand cannot send the apps something that is not a Polygon.
 */
export function readBoundary(value: PropertyRow['boundary'] | undefined): PlotBoundary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const polygon = value as { type?: unknown; coordinates?: unknown };
  if (polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) return null;
  return { type: 'Polygon', coordinates: polygon.coordinates as number[][][] };
}

/** Converts a database row to the public snake_case shape. `now` decides whether a promotion is still running. */
export function toPropertyDto(row: PropertyRowWithAgency, now: Date): PropertyDto {
  return {
    id: row.id,
    user_id: row.userId,
    agency_id: row.agencyId,
    agency_name: row.agency?.agencyName ?? null,
    // A private owner's own name. An agency's listing is shown under the agency, so the staff member's name is not sent.
    owner_name: row.agencyId === null ? row.user?.fullName?.trim() || null : null,
    agency_plan: runningPlanAt(row, now),
    title: row.title,
    description: row.description,
    type: row.type,
    market: row.market,
    unit: row.unit,
    deal_type: row.dealType,
    mortgage_months: row.mortgageMonths,
    price_terms: row.priceTerms,
    // NUMERIC(18,2), but never above MAX_MONEY (just under 10^14), which a double round-trips with 2 decimals.
    price: row.price.toNumber(),
    monthly_rent: row.monthlyRent?.toNumber() ?? null,
    currency: row.currency,
    features: row.features,
    deed_type: row.deedType,
    area_sqm: row.areaSqm,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    province: row.province,
    district: row.district,
    neighborhood: row.neighborhood,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    boundary: readBoundary(row.boundary),
    images: row.images,
    status: row.status,
    is_featured: isFeaturedAt(row, now),
    featured_until: row.featuredUntil?.toISOString() ?? null,
    laddered_at: row.ladderedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * A listing as its owner sees it in their own list: the public shape plus how often it was opened. The count is the
 * owner's business, so it is not part of the public shape.
 */
export function toOwnPropertyDto(row: PropertyRowWithAgency, now: Date): PropertyDto {
  return { ...toPropertyDto(row, now), view_count: row.viewCount };
}
