import { randomUUID } from 'node:crypto';
import { Role } from '../src/generated/prisma/client.js';
import { demoteAdmin, promoteToAdmin, RoleChangeError } from '../src/admin/admin.bootstrap.js';
import { seedAdmin } from '../src/admin/admin.seed.js';
import { hasDb, randomPhone, TestContext, type TestUser } from './helpers.js';

describe.skipIf(!hasDb)('Admin access control and bans (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const ban = (admin: TestUser, userId: string, reason = 'Scam reports from several buyers') =>
    ctx.post(`/admin/users/${userId}/ban`, { reason }, admin.token);
  const unban = (admin: TestUser, userId: string) => ctx.post(`/admin/users/${userId}/unban`, {}, admin.token);

  describe('who may use /admin', () => {
    const routes = ['/admin/users', '/admin/reports', '/admin/agencies', '/admin/properties', '/admin/transactions', '/admin/audit-log', '/admin/banners', '/admin/pricing', '/admin/analytics/overview'];

    it('needs a token', async () => {
      for (const route of routes) await ctx.get(route).expect(401);
    });

    it('refuses users and agencies with ROLE_REQUIRED', async () => {
      const user = await ctx.user();
      const agency = await ctx.agency(true);
      for (const who of [user, agency]) {
        for (const route of routes) {
          const res = await ctx.get(route, who.token).expect(403);
          expect(res.body.code).toBe('ROLE_REQUIRED');
        }
      }
    });

    it('lets an admin in', async () => {
      const admin = await ctx.admin();
      for (const route of routes) await ctx.get(route, admin.token).expect(200);
    });

    it('goes by the role in the database, not the one inside the token', async () => {
      const user = await ctx.user();
      const admin = await ctx.admin();
      // A token that CLAIMS admin for an ordinary account gets nowhere...
      const forged = await ctx.tokenFor(user.id, Role.ADMIN);
      await ctx.get('/admin/users', forged).expect(403);
      // ...and an admin whose token still says USER is an admin.
      const stale = await ctx.tokenFor(admin.id, Role.USER);
      await ctx.get('/admin/users', stale).expect(200);
    });

    it('stops a demoted admin on the very next request', async () => {
      const admin = await ctx.admin();
      await ctx.get('/admin/users', admin.token).expect(200);
      await ctx.prisma.user.update({ where: { id: admin.id }, data: { role: Role.USER } });
      await ctx.get('/admin/users', admin.token).expect(403);
    });

    it('refuses a token whose account no longer exists', async () => {
      const ghost = await ctx.tokenFor(randomUUID(), Role.ADMIN);
      await ctx.get('/admin/users', ghost).expect(401);
      await ctx.get('/users/me', ghost).expect(401);
    });
  });

  describe('banning an account', () => {
    it('blocks every request of the banned account at once, and unbanning restores access', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      await ctx.get('/users/me', user.token).expect(200);

      const banned = await ban(admin, user.id).expect(200);
      expect(banned.body).toMatchObject({ id: user.id, ban_reason: 'Scam reports from several buyers' });
      expect(banned.body.banned_at).toEqual(expect.any(String));

      const blocked = await ctx.get('/users/me', user.token).expect(403);
      expect(blocked.body.code).toBe('ACCOUNT_BANNED');
      expect(JSON.stringify(blocked.body)).not.toContain('Scam'); // the admin's note stays internal
      await ctx.get('/chat/conversations', user.token).expect(403);
      await ctx.post('/properties', {}, user.token).expect(403);

      const lifted = await unban(admin, user.id).expect(200);
      expect(lifted.body).toMatchObject({ banned_at: null, ban_reason: null });
      await ctx.get('/users/me', user.token).expect(200);
    });

    it('refuses to sign a banned account in, with the same code', async () => {
      const admin = await ctx.admin();
      const user = await ctx.signUp();
      await ban(admin, user.id).expect(200);

      const res = await ctx.verifyOtp(user.phone, await ctx.otpFor(user.phone));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_BANNED');

      await unban(admin, user.id).expect(200);
      await ctx.verifyOtp(user.phone, await ctx.otpFor(user.phone)).expect(200);
    });

    it('records the time of the last successful sign-in', async () => {
      const user = await ctx.signUp();
      const first = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt;
      expect(first).toBeInstanceOf(Date);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await ctx.verifyOtp(user.phone, await ctx.otpFor(user.phone)).expect(200);
      const second = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt;
      expect(second!.getTime()).toBeGreaterThan(first!.getTime());
    });

    it('cannot ban an admin, an unknown account, or the same account twice', async () => {
      const admin = await ctx.admin();
      const other = await ctx.admin();
      expect((await ban(admin, other.id).expect(409)).body.code).toBe('CANNOT_BAN_ADMIN');
      await ban(admin, randomUUID()).expect(404);

      const user = await ctx.user();
      await ban(admin, user.id).expect(200);
      expect((await ban(admin, user.id).expect(409)).body.code).toBe('ALREADY_BANNED');
      await unban(admin, user.id).expect(200);
      expect((await unban(admin, user.id).expect(409)).body.code).toBe('NOT_BANNED');
    });

    it('needs a reason, and only admins can ban', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      await ctx.post(`/admin/users/${user.id}/ban`, {}, admin.token).expect(400);
      await ctx.post(`/admin/users/${user.id}/ban`, { reason: 'x' }, admin.token).expect(400);
      await ban(user, (await ctx.user()).id).expect(403);
    });

    it('writes the ban and the unban to the audit log', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      await ban(admin, user.id, 'Fake agency documents').expect(200);
      await unban(admin, user.id).expect(200);

      const log = await ctx.get(`/admin/audit-log?target_type=user&target_id=${user.id}`, admin.token).expect(200);
      const actions = (log.body.data as { action: string }[]).map((entry) => entry.action);
      expect(actions).toEqual(['USER_UNBANNED', 'USER_BANNED']); // newest first
      const entry = log.body.data[1];
      expect(entry.actor.id).toBe(admin.id);
      expect(entry.metadata).toEqual({ reason: 'Fake agency documents' });
    });

    it('hides the banned account\'s listings from everyone else, and brings them back on unban', async () => {
      const admin = await ctx.admin();
      const seller = await ctx.user();
      const buyer = await ctx.user();
      const province = `Ban-${randomUUID().slice(0, 8)}`;
      const listing = await ctx.listing(seller, { province });
      await ctx.get(`/properties/${listing.id}`).expect(200);
      expect((await ctx.get(`/properties?province=${province}`).expect(200)).body.meta.total).toBe(1);

      await ban(admin, seller.id).expect(200);
      await ctx.get(`/properties/${listing.id}`).expect(404);
      expect((await ctx.get(`/properties?province=${province}`).expect(200)).body.meta.total).toBe(0);
      await ctx.get(`/properties/${listing.id}/contact`, buyer.token).expect(404);
      await ctx.post('/chat/conversations', { property_id: listing.id }, buyer.token).expect(404);

      await unban(admin, seller.id).expect(200);
      await ctx.get(`/properties/${listing.id}`).expect(200);
      expect((await ctx.get(`/properties?province=${province}`).expect(200)).body.meta.total).toBe(1);
    });
  });

  describe('chat connections', () => {
    it('refuses a banned account at the handshake', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      await ban(admin, user.id).expect(200);
      await expect(ctx.connectSocket(user.token)).rejects.toThrow();
    });

    it('cuts a live connection the moment the account is banned', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      const socket = await ctx.connectSocket(user.token);
      const closed = new Promise<string>((resolve) => socket.once('disconnect', (reason) => resolve(reason)));
      await ban(admin, user.id).expect(200);
      expect(await closed).toBe('io server disconnect');
      await expect(ctx.connectSocket(user.token)).rejects.toThrow();
    });
  });

  describe('making and removing admins', () => {
    it('promotes an existing account, creates a missing one, and writes the audit log', async () => {
      const user = await ctx.user();
      const result = await promoteToAdmin(ctx.prisma, user.phone.replace('+93', '0'));
      expect(result).toMatchObject({ userId: user.id, phoneNumber: user.phone, created: false, unchanged: false });
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('ADMIN');
      await ctx.get('/admin/users', user.token).expect(200); // takes effect on the next request, same old token

      expect(await promoteToAdmin(ctx.prisma, user.phone)).toMatchObject({ unchanged: true });

      const phone = randomPhone();
      const created = await promoteToAdmin(ctx.prisma, phone);
      ctx.userIds.push(created.userId);
      expect(created).toMatchObject({ created: true, phoneNumber: phone });
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: created.userId } })).role).toBe('ADMIN');

      const log = await ctx.prisma.adminAuditLog.findMany({ where: { targetId: user.id, action: 'ADMIN_PROMOTED' } });
      expect(log).toHaveLength(1);
      expect(log[0].actorId).toBeNull();
    });

    it('seeds the developer account as an admin, once, and the admin then has no limits', async () => {
      const phone = randomPhone();
      const first = await seedAdmin(ctx.prisma, phone);
      ctx.userIds.push(first.userId);
      expect(first).toMatchObject({ created: true, unchanged: false, phoneNumber: phone });
      expect(await seedAdmin(ctx.prisma, phone)).toMatchObject({ userId: first.userId, created: false, unchanged: true });
      expect(await ctx.prisma.adminAuditLog.count({ where: { targetId: first.userId, action: 'ADMIN_PROMOTED' } })).toBe(1);

      // An existing ordinary account with that number is promoted, not duplicated.
      const user = await ctx.user();
      expect(await seedAdmin(ctx.prisma, user.phone)).toMatchObject({ userId: user.id, created: false, unchanged: false });
    });

    it('refuses a bad number, an agency owner and a banned account', async () => {
      await expect(promoteToAdmin(ctx.prisma, '12345')).rejects.toBeInstanceOf(RoleChangeError);
      const agency = await ctx.agency(false);
      await expect(promoteToAdmin(ctx.prisma, agency.phone)).rejects.toThrow(/owns an agency/);
      const banned = await ctx.user();
      await ctx.prisma.user.update({ where: { id: banned.id }, data: { bannedAt: new Date() } });
      await expect(promoteToAdmin(ctx.prisma, banned.phone)).rejects.toThrow(/banned/);
    });

    it('demotes an admin, who then loses access immediately', async () => {
      const admin = await ctx.admin();
      await ctx.get('/admin/users', admin.token).expect(200);
      expect(await demoteAdmin(ctx.prisma, admin.phone)).toMatchObject({ unchanged: false });
      await ctx.get('/admin/users', admin.token).expect(403);
      expect(await demoteAdmin(ctx.prisma, admin.phone)).toMatchObject({ unchanged: true });
      await expect(demoteAdmin(ctx.prisma, randomPhone())).rejects.toThrow(/No account/);
    });

    it('has no API to make an admin', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      await ctx.patch(`/admin/users/${user.id}`, { role: 'ADMIN' }, admin.token).expect(404);
      await ctx.post('/users/register', { full_name: 'Sneaky Person', role: 'ADMIN' }, user.token).expect(400);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
    });
  });

  describe('listing and finding accounts', () => {
    it('lists accounts and filters by role, ban state and a phone number typed any usual way', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      const target = await ctx.user();
      await ban(admin, target.id).expect(200);

      const local = '0' + target.phone.slice(3); // 0700…
      const found = await ctx.get(`/admin/users?q=${encodeURIComponent(local)}`, admin.token).expect(200);
      expect(found.body.data.map((u: { id: string }) => u.id)).toEqual([target.id]);

      const banned = await ctx.get('/admin/users?banned=true&limit=50', admin.token).expect(200);
      expect(banned.body.data.map((u: { id: string }) => u.id)).toContain(target.id);
      expect(banned.body.data.map((u: { id: string }) => u.id)).not.toContain(user.id);

      const admins = await ctx.get('/admin/users?role=ADMIN&limit=50', admin.token).expect(200);
      expect(admins.body.data.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true);

      await ctx.get('/admin/users?role=KING', admin.token).expect(400);
      await ctx.get('/admin/users?limit=500', admin.token).expect(400);
    });

    it('shows one account with its listing counts and reports', async () => {
      const admin = await ctx.admin();
      const seller = await ctx.user();
      await ctx.listing(seller);
      await ctx.listing(seller, { status: 'SOLD' });
      const reporter = await ctx.user();
      await ctx.post('/reports', { target_type: 'USER', target_id: seller.id, reason: 'SCAM' }, reporter.token).expect(201);

      const res = await ctx.get(`/admin/users/${seller.id}`, admin.token).expect(200);
      expect(res.body).toMatchObject({
        id: seller.id,
        listings: { active: 1, sold: 1, archived: 0 },
        reports_against: 1,
        open_reports_against: 1,
        reports_filed: 0,
      });
      await ctx.get(`/admin/users/${randomUUID()}`, admin.token).expect(404);
    });
  });
});
