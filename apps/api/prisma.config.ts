import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Read lazily instead of with Prisma's `env()` helper: `env()` throws when the
    // variable is unset, which would break `prisma generate` on a fresh clone / CI,
    // where no database is needed. Commands that do need a DB fail on connect.
    url: process.env.DIRECT_URL ?? '',
  },
});
