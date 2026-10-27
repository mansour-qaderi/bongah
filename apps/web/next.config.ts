import type { NextConfig } from 'next';

/**
 * The panel talks to the Bongah API only from the server (route handlers under /api): the browser never sees the
 * API's address or the access token. See lib/server/env.ts for the settings it reads.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Not 'same-origin': that strips the Referer from the map-tile requests, and tile.openstreetmap.org answers
          // those with "403 Access blocked" (its usage policy asks for a Referer). The origin alone is sent across
          // sites; paths and query strings never leave the panel.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default config;
