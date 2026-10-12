import type { Property as PropertyRow } from '../generated/prisma/client.js';
import type { PropertyDto } from './dto/property-response.dto.js';

/** Converts a database row to the public snake_case shape. `now` decides whether a promotion is still running. */
export function toPropertyDto(row: PropertyRow, now: Date): PropertyDto {
  return {
    id: row.id,
    user_id: row.userId,
    agency_id: row.agencyId,
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
    // The flag alone goes stale when the promotion ends; it only counts while featured_until is ahead.
    is_featured: row.isFeatured && row.featuredUntil !== null && row.featuredUntil > now,
    featured_until: row.featuredUntil?.toISOString() ?? null,
    laddered_at: row.ladderedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
