import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Reads TRUST_PROXY, the proxies whose `X-Forwarded-For` the API may believe (Express's "trust proxy" setting).
 *
 * The rate limits are per client address. Behind a reverse proxy or the web panel's server every request arrives from
 * that one machine, so without this all users would share a single limit. Believing the header from anyone would let a
 * caller pick their own address and dodge the limits, so it is OFF unless the operator names who may set it:
 *   - unset / empty / "false": trust nobody (the default; the address is the connection's own).
 *   - a whole number: that many proxy hops in front of the API ("1" for one reverse proxy).
 *   - "loopback", "linklocal", "uniquelocal", an address or a CIDR range, or a comma-separated list of those
 *     ("127.0.0.1, 10.0.0.0/8"): only requests arriving from those addresses may set the header.
 * "true" is refused: it trusts every caller, which is the spoofing case this setting exists to prevent.
 */
export function parseTrustProxy(raw: string | undefined): number | string[] | false {
  const text = (raw ?? '').trim();
  if (text === '' || text.toLowerCase() === 'false') return false;
  if (text.toLowerCase() === 'true') {
    throw new Error(
      'TRUST_PROXY=true would let any caller choose their own address. Use the number of proxies in front of the API (for example 1) or their addresses (for example "loopback, 10.0.0.0/8").',
    );
  }
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    if (hops < 1 || hops > 10) throw new Error('TRUST_PROXY as a number must be between 1 and 10 (the proxies in front of the API).');
    return hops;
  }
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const known = /^(loopback|linklocal|uniquelocal)$/i;
  // An IPv4/IPv6 address, optionally with a /prefix. Loose on purpose: Express rejects what is not an address.
  const address = /^[0-9a-f:.]+(\/\d{1,3})?$/i;
  for (const entry of entries) {
    if (!known.test(entry) && !address.test(entry)) {
      throw new Error(`TRUST_PROXY has "${entry}", which is not "loopback", an address or a CIDR range.`);
    }
  }
  return entries;
}

/** Applies TRUST_PROXY to the Express app. */
export function applyTrustProxy(app: NestExpressApplication, raw = process.env.TRUST_PROXY): void {
  const setting = parseTrustProxy(raw);
  if (setting !== false) app.set('trust proxy', setting);
}
