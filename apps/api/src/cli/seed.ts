import { connectCliDb, CliDatabaseError } from './db.js';
import { RoleChangeError } from '../admin/admin.bootstrap.js';
import { seedAdmin, seedAdminPhone } from '../admin/admin.seed.js';

/**
 * Provisions the accounts the system needs to exist: today, the developer's admin account.
 *
 *   pnpm build
 *   pnpm db:seed                       # 0790049201 becomes an admin
 *   SEED_ADMIN_PHONE=0700123456 pnpm db:seed
 *
 * Idempotent: running it again changes nothing. Reads DATABASE_URL from the environment (or the .env file).
 */
async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    return 2;
  }
  let db;
  try {
    db = await connectCliDb(url);
    const result = await seedAdmin(db, seedAdminPhone(process.env));
    if (result.unchanged) console.log(`${result.phoneNumber}: already an admin.`);
    else if (result.created) console.log(`${result.phoneNumber}: account created as admin. Sign in with this number as usual.`);
    else console.log(`${result.phoneNumber}: is now an admin.`);
    return 0;
  } catch (error) {
    if (error instanceof RoleChangeError || error instanceof CliDatabaseError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    await db?.$disconnect();
  }
}

process.exitCode = await main();
