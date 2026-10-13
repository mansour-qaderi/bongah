import type { Property as PropertyRow } from '../generated/prisma/client.js';
import type { PropertyDto } from './dto/property-response.dto.js';

/** Load this with a listing so its agency's public name can be shown without a second query. */
export const WITH_AGENCY_NAME = { agency: { select: { agencyName: true } } } as const;

/** A listing row, optionally with its agency's name (see WITH_AGENCY_NAME). Without it `agency_name` is null. */
export type PropertyRowWithAgency = PropertyRow & { agency?: { agencyName: string } | null };

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
    title: row.title,
    description: row.description,
    type: row.type,
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
