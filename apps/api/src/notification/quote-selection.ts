const DAY_MS = 24 * 60 * 60 * 1000;

/** Quotes must be given oldest first (created_at, then id) so the order only changes when quotes are added or removed. */
export type QuotesByLanguage<Q> = ReadonlyMap<string, readonly Q[]>;

/** Whole days since 1970-01-01 of a Kabul calendar day (a UTC-midnight Date from kabulDayKey). */
export function dayNumber(dayKey: Date): number {
  return Math.floor(dayKey.getTime() / DAY_MS);
}

/**
 * The quote of the day: everyone on the same language sees the same quote on the same day, and the quotes take
 * turns day by day. Adding or removing a quote reshuffles the rotation once, which is harmless.
 *
 * A language with no quotes falls back to Dari, then to whichever language has some, so a missing translation
 * never silences the push. Returns null only when there are no quotes at all.
 */
export function pickMorningQuote<Q>(quotes: QuotesByLanguage<Q>, language: string, dayKey: Date): Q | null {
  const candidates = [quotes.get(language), quotes.get('prs'), ...quotes.values()];
  const pool = candidates.find((list) => list !== undefined && list.length > 0);
  if (!pool) return null;
  return pool[dayNumber(dayKey) % pool.length] ?? null;
}
