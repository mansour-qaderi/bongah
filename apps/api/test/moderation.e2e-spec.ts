import { randomUUID } from 'node:crypto';
import { hasDb, TestContext } from './helpers.js';

describe.skipIf(!hasDb)('Abuse reports and moderation (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const report = (token: string, body: object) => ctx.post('/reports', body, token);
  const userReport = (token: string, targetId: string, reason = 'SCAM') =>
    report(token, { target_type: 'USER', target_id: targetId, reason });
  const listingReport = (token: string, targetId: string, reason = 'FAKE_LISTING') =>
    report(token, { target_type: 'PROPERTY', target_id: targetId, reason });
  const resolve = (token: string, id: string, body: object) => ctx.post(`/admin/reports/${id}/resolve`, body, token);

  describe('filing a report', () => {
    it('needs a signed-in account', async () => {
      const target = await ctx.user();
      await report('', { target_type: 'USER', target_id: target.id, reason: 'SCAM' }).expect(401);
    });

    it('files a report about an account and about a listing', async () => {
      const reporter = await ctx.user();
      const seller = await ctx.user();
      const listing = await ctx.listing(seller);

      const about = await userReport(reporter.token, seller.id).expect(201);
      expect(about.body).toMatchObject({ status: 'OPEN' });
      const row = await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: about.body.id } });
      expect(row).toMatchObject({ targetType: 'USER', targetUserId: seller.id, targetPropertyId: null, reason: 'SCAM' });

      const aboutListing = await listingReport(reporter.token, listing.id).expect(201);
      const listingRow = await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: aboutListing.body.id } });
      // A listing report also records whose listing it is.
      expect(listingRow).toMatchObject({ targetType: 'PROPERTY', targetUserId: seller.id, targetPropertyId: listing.id });
    });

    it('keeps the reporter-supplied details', async () => {
      const reporter = await ctx.user();
      const target = await ctx.user();
      const res = await report(reporter.token, {
        target_type: 'USER',
        target_id: target.id,
        reason: 'HARASSMENT',
        details: '  Keeps calling at night.  ',
      }).expect(201);
      const row = await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.details).toBe('Keeps calling at night.');
    });

    it('rejects bad input', async () => {
      const reporter = await ctx.user();
      const target = await ctx.user();
      const ok = { target_type: 'USER', target_id: target.id, reason: 'SCAM' };
      await report(reporter.token, { ...ok, reason: 'BORING' }).expect(400);
      await report(reporter.token, { ...ok, target_type: 'AGENCY' }).expect(400);
      await report(reporter.token, { ...ok, target_id: 'not-a-uuid' }).expect(400);
      await report(reporter.token, { ...ok, details: 'x'.repeat(1001) }).expect(400);
      await report(reporter.token, { ...ok, extra: 1 }).expect(400);
    });

    it('404s for a target that does not exist, and for an archived listing', async () => {
      const reporter = await ctx.user();
      const seller = await ctx.user();
      await userReport(reporter.token, randomUUID()).expect(404);
      await listingReport(reporter.token, randomUUID()).expect(404);
      const archived = await ctx.listing(seller, { status: 'ARCHIVED' });
      await listingReport(reporter.token, archived.id).expect(404);
    });

    it('refuses reporting yourself or your own listing', async () => {
      const me = await ctx.user();
      const mine = await ctx.listing(me);
      expect((await userReport(me.token, me.id).expect(409)).body.code).toBe('CANNOT_REPORT_SELF');
      expect((await listingReport(me.token, mine.id).expect(409)).body.code).toBe('CANNOT_REPORT_SELF');
    });

    it('keeps one open report per reporter and target, but allows another after it is decided', async () => {
      const reporter = await ctx.user();
      const admin = await ctx.admin();
      const target = await ctx.user();
      const listing = await ctx.listing(target);

      const first = await userReport(reporter.token, target.id).expect(201);
      expect((await userReport(reporter.token, target.id, 'SPAM').expect(409)).body.code).toBe('ALREADY_REPORTED');
      // The listing is a different target, and another reporter is a different reporter.
      await listingReport(reporter.token, listing.id).expect(201);
      const other = await ctx.user();
      await userReport(other.token, target.id).expect(201);

      await resolve(admin.token, first.body.id, { action: 'DISMISS' }).expect(200);
      await userReport(reporter.token, target.id).expect(201);
    });

    it('files at most one open report per reporter and target even when requests race', async () => {
      const reporter = await ctx.user();
      const target = await ctx.user();
      const results = await Promise.all(Array.from({ length: 6 }, () => userReport(reporter.token, target.id)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect(await ctx.prisma.abuseReport.count({ where: { reporterId: reporter.id, targetUserId: target.id } })).toBe(1);
    });

    it('stops a reporter who has too many reports waiting', async () => {
      const reporter = await ctx.user();
      const targets = await Promise.all(Array.from({ length: 30 }, () => ctx.user()));
      await ctx.prisma.abuseReport.createMany({
        data: targets.map((t) => ({ reporterId: reporter.id, targetType: 'USER' as const, targetUserId: t.id, reason: 'SPAM' as const })),
      });
      const next = await ctx.user();
      const res = await userReport(reporter.token, next.id).expect(429);
      expect(res.body.code).toBe('TOO_MANY_OPEN_REPORTS');
    });
  });

  describe('the moderation queue', () => {
    it('lists reports for admins only, with the people and the listing', async () => {
      const reporter = await ctx.user();
      const seller = await ctx.user();
      const admin = await ctx.admin();
      const listing = await ctx.listing(seller);
      const filed = await listingReport(reporter.token, listing.id, 'SCAM').expect(201);

      await ctx.get('/admin/reports', reporter.token).expect(403);
      const res = await ctx.get(`/admin/reports?target_user_id=${seller.id}`, admin.token).expect(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0]).toMatchObject({
        id: filed.body.id,
        status: 'OPEN',
        target_type: 'PROPERTY',
        reason: 'SCAM',
        reporter: { id: reporter.id },
        target_user: { id: seller.id },
        target_property: { id: listing.id, title: 'Chat test apartment', removed_by_admin_at: null },
      });
    });

    it('filters by status, target type and reason, and shows open reports oldest first', async () => {
      const reporter = await ctx.user();
      const admin = await ctx.admin();
      const target = await ctx.user();
      const listing = await ctx.listing(target);

      const a = await userReport(reporter.token, target.id, 'SPAM').expect(201);
      await new Promise((resolve) => setTimeout(resolve, 15));
      const b = await listingReport(reporter.token, listing.id, 'FAKE_LISTING').expect(201);
      await resolve(admin.token, b.body.id, { action: 'RESOLVE', note: 'Seller fixed it' }).expect(200);

      const base = `/admin/reports?target_user_id=${target.id}`;
      const all = await ctx.get(base, admin.token).expect(200);
      expect(all.body.data.map((r: { id: string }) => r.id)).toEqual([b.body.id, a.body.id]); // newest first

      const open = await ctx.get(`${base}&status=OPEN`, admin.token).expect(200);
      expect(open.body.data.map((r: { id: string }) => r.id)).toEqual([a.body.id]);
      const resolved = await ctx.get(`${base}&status=RESOLVED`, admin.token).expect(200);
      expect(resolved.body.data.map((r: { id: string }) => r.id)).toEqual([b.body.id]);
      const users = await ctx.get(`${base}&target_type=USER`, admin.token).expect(200);
      expect(users.body.data.map((r: { id: string }) => r.id)).toEqual([a.body.id]);
      const fake = await ctx.get(`${base}&reason=FAKE_LISTING`, admin.token).expect(200);
      expect(fake.body.data.map((r: { id: string }) => r.id)).toEqual([b.body.id]);

      await ctx.get('/admin/reports?status=SOMETHING', admin.token).expect(400);
      await ctx.get(`/admin/reports/${a.body.id}`, admin.token).expect(200);
      await ctx.get(`/admin/reports/${randomUUID()}`, admin.token).expect(404);
    });
  });

  describe('deciding a report', () => {
    it('dismisses and resolves, recording who decided and why', async () => {
      const admin = await ctx.admin();
      const target = await ctx.user();
      const reporterA = await ctx.user();
      const reporterB = await ctx.user();
      const a = await userReport(reporterA.token, target.id).expect(201);
      const b = await userReport(reporterB.token, target.id).expect(201);

      const dismissed = await resolve(admin.token, a.body.id, { action: 'DISMISS', note: 'No evidence' }).expect(200);
      expect(dismissed.body).toMatchObject({ status: 'DISMISSED', resolved_by: admin.id, resolution_note: 'No evidence' });
      expect(dismissed.body.resolved_at).toEqual(expect.any(String));

      const resolved = await resolve(admin.token, b.body.id, { action: 'RESOLVE' }).expect(200);
      expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolution_note: null });

      // Neither ban nor takedown happened.
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(row.bannedAt).toBeNull();
    });

    it('decides a report only once, also when two admins click at the same time', async () => {
      const admin = await ctx.admin();
      const second = await ctx.admin();
      const target = await ctx.user();
      const reporter = await ctx.user();
      const filed = await userReport(reporter.token, target.id).expect(201);

      const results = await Promise.all([
        resolve(admin.token, filed.body.id, { action: 'DISMISS' }),
        resolve(second.token, filed.body.id, { action: 'RESOLVE' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.code).toBe('REPORT_ALREADY_CLOSED');
      // One audit line for the one decision.
      const log = await ctx.get(`/admin/audit-log?target_type=report&target_id=${filed.body.id}`, admin.token).expect(200);
      expect(log.body.data).toHaveLength(1);
    });

    it('validates the decision', async () => {
      const admin = await ctx.admin();
      const target = await ctx.user();
      const reporter = await ctx.user();
      const filed = await userReport(reporter.token, target.id).expect(201);

      await resolve(admin.token, filed.body.id, {}).expect(400);
      await resolve(admin.token, filed.body.id, { action: 'DELETE_EVERYTHING' }).expect(400);
      // Banning needs the note that becomes the ban reason.
      await resolve(admin.token, filed.body.id, { action: 'BAN_USER' }).expect(400);
      await resolve(admin.token, filed.body.id, { action: 'REMOVE_LISTING' }).expect(400);
      await resolve(admin.token, randomUUID(), { action: 'DISMISS' }).expect(404);
      await resolve(admin.token, 'nope', { action: 'DISMISS' }).expect(400);
      await resolve(reporter.token, filed.body.id, { action: 'DISMISS' }).expect(403);
      // Nothing above changed the report.
      const row = await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: filed.body.id } });
      expect(row.status).toBe('OPEN');
    });

    it('bans the reported account, closes the other open reports about it and cuts its session', async () => {
      const admin = await ctx.admin();
      const scammer = await ctx.user();
      const [r1, r2, r3] = await Promise.all([ctx.user(), ctx.user(), ctx.user()]);
      const first = await userReport(r1.token, scammer.id).expect(201);
      const second = await userReport(r2.token, scammer.id).expect(201);
      // A report about one of the scammer's listings is about the same account too.
      const listing = await ctx.listing(scammer);
      const third = await listingReport(r3.token, listing.id).expect(201);

      const decided = await resolve(admin.token, first.body.id, { action: 'BAN_USER', note: 'Took deposits, never showed up' }).expect(200);
      expect(decided.body).toMatchObject({ status: 'RESOLVED', resolution_note: 'Took deposits, never showed up' });

      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: scammer.id } });
      expect(user.bannedAt).toBeInstanceOf(Date);
      expect(user.banReason).toBe('Took deposits, never showed up');
      await ctx.get('/users/me', scammer.token).expect(403);

      for (const other of [second, third]) {
        const row = await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: other.body.id } });
        expect(row).toMatchObject({ status: 'RESOLVED', resolvedById: admin.id });
        expect(row.resolutionNote).toContain('banned');
      }
      const log = await ctx.get(`/admin/audit-log?target_type=user&target_id=${scammer.id}`, admin.token).expect(200);
      expect((log.body.data as { action: string }[]).map((e) => e.action)).toContain('USER_BANNED');
    });

    it('refuses to ban an admin through a report, and leaves the report open', async () => {
      const admin = await ctx.admin();
      const otherAdmin = await ctx.admin();
      const reporter = await ctx.user();
      const filed = await userReport(reporter.token, otherAdmin.id).expect(201);
      const res = await resolve(admin.token, filed.body.id, { action: 'BAN_USER', note: 'Because' }).expect(409);
      expect(res.body.code).toBe('CANNOT_BAN_ADMIN');
      const row = await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: filed.body.id } });
      expect(row.status).toBe('OPEN'); // the whole decision rolled back
    });

    it('removes the reported listing, closes the other reports about it, and keeps the owner out of it', async () => {
      const admin = await ctx.admin();
      const seller = await ctx.user();
      const listing = await ctx.listing(seller);
      const other = await ctx.listing(seller);
      const [r1, r2] = await Promise.all([ctx.user(), ctx.user()]);
      const first = await listingReport(r1.token, listing.id).expect(201);
      const second = await listingReport(r2.token, listing.id).expect(201);
      // A report about a DIFFERENT listing of the same seller stays open.
      const unrelated = await listingReport(r1.token, other.id).expect(201);

      await resolve(admin.token, first.body.id, { action: 'REMOVE_LISTING', note: 'Photos are stolen' }).expect(200);

      const removed = await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } });
      expect(removed).toMatchObject({ status: 'ARCHIVED', removalReason: 'Photos are stolen' });
      expect(removed.removedByAdminAt).toBeInstanceOf(Date);
      expect((await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: second.body.id } })).status).toBe('RESOLVED');
      expect((await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: unrelated.body.id } })).status).toBe('OPEN');

      // The seller's account is untouched, the listing is gone from public view.
      await ctx.get('/users/me', seller.token).expect(200);
      await ctx.get(`/properties/${listing.id}`).expect(404);
    });

    it('cannot remove a listing from a report about an account', async () => {
      const admin = await ctx.admin();
      const target = await ctx.user();
      const reporter = await ctx.user();
      const filed = await userReport(reporter.token, target.id).expect(201);
      const res = await resolve(admin.token, filed.body.id, { action: 'REMOVE_LISTING', note: 'Remove it' }).expect(400);
      expect(res.body.code).toBe('ACTION_NOT_APPLICABLE');
      expect((await ctx.prisma.abuseReport.findUniqueOrThrow({ where: { id: filed.body.id } })).status).toBe('OPEN');
    });
  });

  describe('a listing removed by the team', () => {
    it('cannot be edited, reactivated or archived back by its owner, but an admin can restore it', async () => {
      const admin = await ctx.admin();
      const seller = await ctx.user();
      const listing = await ctx.listing(seller);
      await ctx.post(`/admin/properties/${listing.id}/remove`, { reason: 'Misleading price' }, admin.token).expect(200);

      for (const body of [{ title: 'Honest title now' }, { status: 'ACTIVE' }]) {
        const res = await ctx.patch(`/properties/${listing.id}`, body, seller.token).expect(403);
        expect(res.body.code).toBe('LISTING_REMOVED');
      }
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe('ARCHIVED');

      await ctx.post(`/admin/properties/${listing.id}/restore`, {}, admin.token).expect(200);
      const back = await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } });
      expect(back).toMatchObject({ status: 'ACTIVE', removedByAdminAt: null, removalReason: null });
      await ctx.patch(`/properties/${listing.id}`, { title: 'Honest title now' }, seller.token).expect(200);
      await ctx.get(`/properties/${listing.id}`).expect(200);

      // Restoring something that is not removed is refused.
      const again = await ctx.post(`/admin/properties/${listing.id}/restore`, {}, admin.token).expect(409);
      expect(again.body.code).toBe('LISTING_NOT_REMOVED');
    });
  });
});
