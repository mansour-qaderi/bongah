/**
 * Settings read from the environment, at request time (not at build time), so one build serves every deployment.
 * Only this server reads them: nothing here reaches the browser.
 */

const DEFAULT_API_URL = 'http://localhost:3000';

/** The Bongah API's address, without a trailing slash. */
export function apiBase(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.BONGAH_API_URL ?? DEFAULT_API_URL).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BONGAH_API_URL is "${raw}", which is not a web address like https://api.bongah.af`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BONGAH_API_URL must start with http:// or https://');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/** The address this panel is served from (e.g. https://panel.bongah.af), when configured. */
export function panelOrigin(env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.PANEL_ORIGIN?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`PANEL_ORIGIN is "${raw}", which is not an address like https://panel.bongah.af`);
  }
}

/**
 * Whether the session cookie is marked Secure (sent over https only). Follows PANEL_ORIGIN when it is set, so a panel
 * served over plain http in a test environment still signs in; otherwise it is Secure in production.
 */
export function secureCookies(env: Record<string, string | undefined> = process.env): boolean {
  const origin = panelOrigin(env);
  if (origin) return origin.startsWith('https://');
  return env.NODE_ENV === 'production';
}
