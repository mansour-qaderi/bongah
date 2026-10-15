import type { Property, SubscriptionPackage } from '@bongah/shared-types';

/** A longer plan ranks higher. A listing with no plan (a private owner, a lapsed agency) ranks 0. */
const PLAN_RANK: Record<SubscriptionPackage, number> = {
  MONTHLY: 1,
  QUARTERLY: 2,
  YEARLY: 3,
};

type Ranked = Pick<
  Property,
  'agency_plan' | 'is_featured' | 'laddered_at' | 'created_at' | 'id'
>;

export const planRank = (property: Pick<Property, 'agency_plan'>): number =>
  property.agency_plan ? PLAN_RANK[property.agency_plan] ?? 0 : 0;

const time = (iso: string | null | undefined): number => {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(value) ? value : 0;
};

/**
 * Which of two listings comes first where several share a spot (a cluster that cannot be pulled apart by
 * zooming). Paying decides: the longer the agency's current plan, the higher it goes; then a paid featured
 * promotion; then whoever laddered or posted most recently; the id breaks any last tie so the order is always
 * the same. Negative: `a` first.
 */
export function comparePriority(a: Ranked, b: Ranked): number {
  return (
    planRank(b) - planRank(a) ||
    Number(b.is_featured) - Number(a.is_featured) ||
    time(b.laddered_at ?? b.created_at) - time(a.laddered_at ?? a.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** A copy of the listings in priority order. */
export const sortByPriority = <T extends Ranked>(
  properties: readonly T[],
): T[] => [...properties].sort(comparePriority);
