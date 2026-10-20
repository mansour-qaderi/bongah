import { connectCliDb, CliDatabaseError } from './db.js';
import { demoteAdmin, promoteToAdmin, RoleChangeError } from '../admin/admin.bootstrap.js';

/**
 * Command line for the only way to create or remove an admin:
 *
 *   pnpm build
 *   pnpm admin:promote 0700123456     # make this phone number an admin (creates the account if needed)
 *   pnpm admin:demote  0700123456     # back to a regular account
 *
 * Reads DATABASE_URL from the environment (or the .env file next to package.json).
 */
async function main(): Promise<number> {
  const [command, phone] = process.argv.slice(2);
  if ((command !== 'promote' && command !== 'demote') || !phone) {
    console.error('Usage: admin-role <promote|demote> <phone number>');
    return 2;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    return 2;
  }

  let db;
  try {
    db = await connectCliDb(url);
    const result = command === 'promote' ? await promoteToAdmin(db, phone) : await demoteAdmin(db, phone);
    if (result.unchanged) console.log(`${result.phoneNumber}: already ${command === 'promote' ? 'an admin' : 'not an admin'}.`);
    else if (result.created) console.log(`${result.phoneNumber}: account created as admin. They sign in with this number as usual.`);
    else console.log(`${result.phoneNumber}: ${command === 'promote' ? 'is now an admin' : 'is no longer an admin'}.`);
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
