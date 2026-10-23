/**
 * The listing's address as one line a person would say it, wide to narrow ("نیمروز، زرنج، ناحیه ۴، پهلوی شفاخانه").
 * Same rule as the phone app (apps/mobile/src/utils/addressLine.ts), so listings from both read alike.
 */
const ADMIN_PREFIX = /^(ولسوالی|ولسوالۍ|ولایت|والیت)\s+/;
export const plainName = (name: string): string => name.replace(ADMIN_PREFIX, '').trim();

export function addressFrom(parts: { province: string; district: string; neighborhood: string; street: string }): string {
  const said: string[] = [];
  for (const raw of [parts.province, plainName(parts.district), parts.neighborhood, parts.street]) {
    const part = raw.trim();
    if (part && !said.includes(part)) said.push(part);
  }
  return said.join('، ');
}
