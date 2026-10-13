import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Parses CORS_ORIGINS: a comma-separated list of the web panels' origins (e.g.
 * "https://admin.bongah.example,https://agency.bongah.example"). Exact origins only: no wildcard, no
 * path. Empty means no cross-origin browser access at all (the mobile app does not need CORS).
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.map((entry) => {
    let origin: string;
    try {
      const url = new URL(entry);
      origin = url.origin;
      // (`new URL` accepts a "*" in the host, so a wildcard has to be refused by hand.)
      if (!/^https?:$/.test(url.protocol) || origin !== entry.replace(/\/+$/, '') || entry.includes('*')) {
        throw new Error('not an origin');
      }
    } catch {
      throw new Error(`CORS_ORIGINS has "${entry}", which is not an origin like https://admin.bongah.example (no path, no wildcard).`);
    }
    return origin;
  });
}

/** Lets the configured web panels call the API from the browser. */
export function applyCors(app: INestApplication): void {
  const origins = parseCorsOrigins(app.get(ConfigService).get<string>('CORS_ORIGINS'));
  if (origins.length === 0) return;
  app.enableCors({
    origin: origins,
    // The API uses a Bearer token in a header, never cookies, so no credentials are shared.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    maxAge: 600,
  });
}
