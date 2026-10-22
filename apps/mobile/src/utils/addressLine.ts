/**
 * The listing's address as one line a person would say it, wide to narrow:
 * "نیمروز، زرنج، ناحیه ۴، پهلوی چمن الکلاسیکو" (province, district, neighbourhood, street).
 */

/** Leading words a map adds to a place's name that a person leaves out when saying where something is. */
const ADMIN_PREFIX = /^(ولسوالی|ولسوالۍ|ولایت|والیت)\s+/;

/** "ولسوالی زرنج" → "زرنج". */
export const plainName = (name: string): string =>
  name.replace(ADMIN_PREFIX, '').trim();

/**
 * The parts that are there, in order, each said once: a part that is the same as one already said (the district of a
 * province's own capital is often named like the province: "نیمروز، نیمروز") is left out.
 */
export function addressFrom(parts: {
  province: string;
  district: string;
  neighborhood: string;
  street: string;
}): string {
  const said: string[] = [];
  for (const raw of [
    parts.province,
    plainName(parts.district),
    parts.neighborhood,
    parts.street,
  ]) {
    const part = raw.trim();
    if (part && !said.includes(part)) said.push(part);
  }
  return said.join('، ');
}

/** Whether `address` already starts with `province` as a whole word ("نیمروز، زرنج…" does, "نیمروزی" does not). */
export function startsWithProvince(address: string, province: string): boolean {
  const name = province.trim();
  if (!name) return false;
  const text = address.trim();
  return (
    text === name || text.startsWith(`${name}،`) || text.startsWith(`${name} `)
  );
}

/**
 * The same address after the province was changed by hand: only a line that begins with the old province changes; an
 * address the person wrote or edited themselves is theirs and stays as it is.
 */
export function swapProvince(
  address: string,
  from: string,
  to: string,
): string {
  if (!startsWithProvince(address, from)) return address;
  const rest = address.trim().slice(from.trim().length).replace(/^[،\s]+/, '');
  return rest ? `${to.trim()}، ${rest}` : to.trim();
}
