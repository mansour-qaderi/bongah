import { randomUUID } from 'node:crypto';
import type { AdminOverview, Banner, PricingEntry } from '@bongah/shared-types';
import { hasDb, TestContext, type TestUser } from './helpers.js';

const DAY = 86_400_000;

describe.skipIf(!hasDb)('Admin panel: agencies, listings, payments, banners, prices, numbers (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;

  beforeAll(async () => {
    ctx = await TestContext.create();
    admin = await ctx.admin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const near = (actual: Date | null, expected: number, toleranceMs = 60_000) => {
    expect(actual).toBeInstanceOf(Date);
    expect(Math.abs(actual!.getTime() - expected)).toBeLessThan(toleranceMs);
  };

  describe('agency verification', () => {
    const review = (agencyId: string, body: object, token = admin.token) =>
      ctx.put(`/admin/agencies/${agencyId}/verification`, body, token);

    it('shows the review queue to admins, oldest pending first, and searches by name and phone', async () => {
      const first = await ctx.agency(false);
      await new Promise((resolve) => setTimeout(resolve, 15));
      const second = await ctx.agency(true);
      await ctx.prisma.agency.update({ where: { id: first.agencyId }, data: { agencyName: 'Zarnegar Realty Q1' } });
      await ctx.prisma.agency.update({ where: { id: second.agencyId }, data: { agencyName: 'Zarnegar Realty Q2' } });

      await ctx.get('/admin/agencies', first.token).expect(403);
      const res = await ctx.get('/admin/agencies?status=PENDING&q=Zarnegar%20Realty', admin.token).expect(200);
      expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([first.agencyId, second.agencyId]);
      expect(res.body.data[0]).toMatchObject({
        verification_status: 'PENDING',
        is_verified: false,
        owner: { id: first.id, phone_number: first.phone },
        subscription_active: false,
      });
      expect(res.body.data[1].subscription_active).toBe(true);

      const byPhone = await ctx.get(`/admin/agencies?q=${encodeURIComponent(second.phone)}`, admin.token).expect(200);
      expect(byPhone.body.data.map((a: { id: string }) => a.id)).toEqual([second.agencyId]);
    });

    it('approves: status, badge, reviewer and time are set together, and an audit line is written', async () => {
      const agency = await ctx.agency(false);
      const res = await review(agency.agencyId, { status: 'VERIFIED' }).expect(200);
      expect(res.body).toMatchObject({ verification_status: 'VERIFIED', is_verified: true, rejection_reason: null });
      expect(res.body.reviewed_at).toEqual(expect.any(String));

      const row = await ctx.prisma.agency.findUniqueOrThrow({ where: { id: agency.agencyId } });
      expect(row).toMatchObject({ verificationStatus: 'VERIFIED', isVerified: true, reviewedById: admin.id });

      // The agency sees its own status in the dashboard.
      const dash = await ctx.get('/agencies/me/dashboard', agency.token).expect(200);
      expect(dash.body.agency).toMatchObject({ verification_status: 'VERIFIED', is_verified: true });

      const log = await ctx.get(`/admin/audit-log?target_type=agency&target_id=${agency.agencyId}`, admin.token).expect(200);
      expect(log.body.data[0]).toMatchObject({ action: 'AGENCY_VERIFIED', actor: { id: admin.id } });
    });

    it('rejects with a reason the agency can read, and approves later after a new license', async () => {
      const agency = await ctx.agency(false);
      await review(agency.agencyId, { status: 'REJECTED' }).expect(400); // a reason is required
      await review(agency.agencyId, { status: 'VERIFIED', reason: 'why?' }).expect(400); // and only for a rejection

      const rejected = await review(agency.agencyId, { status: 'REJECTED', reason: 'The license photo is blurry' }).expect(200);
      expect(rejected.body).toMatchObject({
        verification_status: 'REJECTED',
        is_verified: false,
        rejection_reason: 'The license photo is blurry',
      });
      const dash = await ctx.get('/agencies/me/dashboard', agency.token).expect(200);
      expect(dash.body.agency).toMatchObject({
        verification_status: 'REJECTED',
        rejection_reason: 'The license photo is blurry',
      });

      // Sending a new license puts the agency back in the queue and clears the rejection.
      const resubmitted = await ctx.put('/agencies/me/license', { license_photo: 'https://example.com/license-2.jpg' }, agency.token).expect(200);
      expect(resubmitted.body).toMatchObject({ verification_status: 'PENDING', is_verified: false, rejection_reason: null });

      const approved = await review(agency.agencyId, { status: 'VERIFIED' }).expect(200);
      expect(approved.body).toMatchObject({ verification_status: 'VERIFIED', rejection_reason: null });
    });

    it('can withdraw an approval', async () => {
      const agency = await ctx.agency(false);
      await review(agency.agencyId, { status: 'VERIFIED' }).expect(200);
      const res = await review(agency.agencyId, { status: 'REJECTED', reason: 'License expired' }).expect(200);
      expect(res.body).toMatchObject({ verification_status: 'REJECTED', is_verified: false });
    });

    it('404s for an unknown agency and refuses non-admins', async () => {
      await review(randomUUID(), { status: 'VERIFIED' }).expect(404);
      const agency = await ctx.agency(false);
      await review(agency.agencyId, { status: 'VERIFIED' }, agency.token).expect(403);
      await ctx.get(`/admin/agencies/${randomUUID()}`, admin.token).expect(404);
    });

    it('is backed by a database rule: the badge and the status cannot disagree', async () => {
      const agency = await ctx.agency(false);
      await expect(
        ctx.prisma.agency.update({ where: { id: agency.agencyId }, data: { isVerified: true } }),
      ).rejects.toThrow();
    });

    it('only an agency can resubmit, and a license must be a web address', async () => {
      const agency = await ctx.agency(false);
      const user = await ctx.user();
      expect((await ctx.put('/agencies/me/license', { license_photo: 'https://example.com/x.jpg' }, user.token).expect(404)).body.code).toBe('AGENCY_PROFILE_REQUIRED');
      await ctx.put('/agencies/me/license', { license_photo: 'not a url' }, agency.token).expect(400);
    });
  });

  describe('listings', () => {
    it('lists every status with filters for status, owner, featured, removed and search', async () => {
      const owner = await ctx.user();
      const active = await ctx.listing(owner, { title: 'Panel filter active' });
      const sold = await ctx.listing(owner, { title: 'Panel filter sold', status: 'SOLD' });
      const featured = await ctx.listing(owner, {
        title: 'Panel filter featured',
        isFeatured: true,
        featuredUntil: new Date(Date.now() + DAY),
      });
      const expired = await ctx.listing(owner, {
        title: 'Panel filter expired',
        isFeatured: true,
        featuredUntil: new Date(Date.now() - DAY),
      });
      await ctx.post(`/admin/properties/${active.id}/remove`, { reason: 'Test takedown' }, admin.token).expect(200);

      const ids = async (query: string) =>
        ((await ctx.get(`/admin/properties?owner_id=${owner.id}&${query}`, admin.token).expect(200)).body.data as { id: string }[])
          .map((p) => p.id)
          .sort();
      const sorted = (...list: { id: string }[]) => list.map((p) => p.id).sort();

      expect(await ids('')).toEqual(sorted(active, sold, featured, expired));
      expect(await ids('status=SOLD')).toEqual(sorted(sold));
      expect(await ids('removed=true')).toEqual(sorted(active));
      expect(await ids('removed=false')).toEqual(sorted(sold, featured, expired));
      // "Featured" means the badge is running now: an expired one is not, and "not featured" includes it.
      expect(await ids('featured=true')).toEqual(sorted(featured));
      expect(await ids('featured=false')).toEqual(sorted(active, sold, expired));
      expect(await ids('q=Panel%20filter%20sold')).toEqual(sorted(sold));
      expect(await ids(`q=${encodeURIComponent(owner.phone)}`)).toEqual(sorted(active, sold, featured, expired));

      const detail = await ctx.get(`/admin/properties/${active.id}`, admin.token).expect(200);
      expect(detail.body).toMatchObject({
        id: active.id,
        status: 'ARCHIVED',
        removal_reason: 'Test takedown',
        owner: { id: owner.id },
      });
      expect(detail.body.removed_by_admin_at).toEqual(expect.any(String));
      await ctx.get('/admin/properties?featured=maybe', admin.token).expect(400);
      await ctx.get(`/admin/properties/${randomUUID()}`, admin.token).expect(404);
    });

    it('features a listing for N days free of charge, stacks on a running badge, and unfeatures', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);

      const first = await ctx.post(`/admin/properties/${listing.id}/feature`, { days: 5 }, admin.token).expect(200);
      expect(first.body.is_featured).toBe(true);
      near(new Date(first.body.featured_until), Date.now() + 5 * DAY);
      expect((await ctx.get(`/properties/${listing.id}`)).body.is_featured).toBe(true);

      const second = await ctx.post(`/admin/properties/${listing.id}/feature`, { days: 2 }, admin.token).expect(200);
      near(new Date(second.body.featured_until), Date.now() + 7 * DAY);

      const ended = await ctx.del(`/admin/properties/${listing.id}/feature`, admin.token).expect(200);
      expect(ended.body.is_featured).toBe(false);
      expect((await ctx.get(`/properties/${listing.id}`)).body.is_featured).toBe(false);

      const log = await ctx.get(`/admin/audit-log?target_type=property&target_id=${listing.id}`, admin.token).expect(200);
      expect((log.body.data as { action: string }[]).map((e) => e.action).sort()).toEqual(
        ['LISTING_FEATURED', 'LISTING_FEATURED', 'LISTING_UNFEATURED'],
      );
    });

    it('validates featuring: days range, unknown listing, inactive listing', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      const sold = await ctx.listing(owner, { status: 'SOLD' });
      for (const days of [0, 366, 1.5, '3']) {
        await ctx.post(`/admin/properties/${listing.id}/feature`, { days }, admin.token).expect(400);
      }
      await ctx.post(`/admin/properties/${randomUUID()}/feature`, { days: 3 }, admin.token).expect(404);
      const res = await ctx.post(`/admin/properties/${sold.id}/feature`, { days: 3 }, admin.token).expect(409);
      expect(res.body.code).toBe('PROPERTY_NOT_ACTIVE');
      await ctx.del(`/admin/properties/${randomUUID()}/feature`, admin.token).expect(404);
    });

    it('takes a listing down once (repeating changes nothing) and needs a reason', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      await ctx.post(`/admin/properties/${listing.id}/remove`, {}, admin.token).expect(400);
      await ctx.post(`/admin/properties/${listing.id}/remove`, { reason: 'Duplicate of another ad' }, admin.token).expect(200);
      const firstAt = (await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } })).removedByAdminAt;
      await ctx.post(`/admin/properties/${listing.id}/remove`, { reason: 'A different reason' }, admin.token).expect(200);
      const row = await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } });
      expect(row.removedByAdminAt).toEqual(firstAt);
      expect(row.removalReason).toBe('Duplicate of another ad');
      await ctx.post(`/admin/properties/${randomUUID()}/remove`, { reason: 'Nothing there' }, admin.token).expect(404);

      const log = await ctx.get(`/admin/audit-log?target_type=property&target_id=${listing.id}`, admin.token).expect(200);
      expect(log.body.data).toHaveLength(1);
    });
  });

  describe('transaction log', () => {
    it('lists payment attempts with payer, agency and receipt, and filters them', async () => {
      const agency = await ctx.agency(false);
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      const paidId = await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      const pendingId = await ctx.pay(owner, { purpose: 'LADDER', property_id: listing.id }, false);

      await ctx.get('/admin/transactions', owner.token).expect(403);
      const all = await ctx.get(`/admin/transactions?q=${encodeURIComponent(agency.phone)}`, admin.token).expect(200);
      expect(all.body.data).toHaveLength(1);
      expect(all.body.data[0]).toMatchObject({
        id: paidId,
        status: 'SUCCESS',
        purpose: 'SUBSCRIPTION',
        amount: 900,
        currency: 'AFGHANI',
        agency_name: 'Test Agency',
        user: { id: agency.id },
      });
      expect(all.body.data[0].receipt_number).toMatch(/^BNG-\d{6}-\d{6}$/);
      expect(all.body.data[0].hesabpay_tx_id).toEqual(expect.any(String));

      const pending = await ctx.get(`/admin/transactions?status=PENDING&q=${encodeURIComponent(owner.phone)}`, admin.token).expect(200);
      expect(pending.body.data.map((t: { id: string }) => t.id)).toEqual([pendingId]);
      expect(pending.body.data[0].receipt_number).toBeNull();

      const byPurpose = await ctx.get(`/admin/transactions?purpose=LADDER&q=${encodeURIComponent(owner.phone)}`, admin.token).expect(200);
      expect(byPurpose.body.data).toHaveLength(1);
      const byReceipt = await ctx.get(`/admin/transactions?q=${all.body.data[0].receipt_number}`, admin.token).expect(200);
      expect(byReceipt.body.data.map((t: { id: string }) => t.id)).toEqual([paidId]);
      const byId = await ctx.get(`/admin/transactions?q=${pendingId}`, admin.token).expect(200);
      expect(byId.body.data.map((t: { id: string }) => t.id)).toEqual([pendingId]);
    });

    it('filters by Kabul calendar days, inclusive, and validates the dates', async () => {
      const user = await ctx.user();
      const listing = await ctx.listing(user);
      const id = await ctx.pay(user, { purpose: 'LADDER', property_id: listing.id }, false);
      // Put it on a known Kabul day: 2026-03-10 20:00 UTC is 2026-03-11 00:30 in Kabul.
      await ctx.prisma.transaction.update({ where: { id }, data: { createdAt: new Date('2026-03-10T20:00:00Z') } });
      const base = `/admin/transactions?q=${encodeURIComponent(user.phone)}`;

      const hit = async (query: string) =>
        ((await ctx.get(`${base}&${query}`, admin.token).expect(200)).body.data as unknown[]).length;
      expect(await hit('from=2026-03-11&to=2026-03-11')).toBe(1);
      expect(await hit('from=2026-03-10&to=2026-03-10')).toBe(0); // 2026-03-10 in Kabul ended at 19:30 UTC
      expect(await hit('from=2026-03-12')).toBe(0);
      expect(await hit('to=2026-03-10')).toBe(0);
      expect(await hit('to=2026-03-11')).toBe(1);

      await ctx.get(`${base}&from=2026-03-12&to=2026-03-11`, admin.token).expect(400);
      await ctx.get(`${base}&from=2026-02-31`, admin.token).expect(400);
      await ctx.get(`${base}&from=yesterday`, admin.token).expect(400);
    });

    it('paginates', async () => {
      const res = await ctx.get('/admin/transactions?limit=2&page=1', admin.token).expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 2 });
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      await ctx.get('/admin/transactions?limit=1000', admin.token).expect(400);
    });
  });

  describe('audit log', () => {
    it('filters by action, actor and target, newest first', async () => {
      const actor = await ctx.admin();
      const user = await ctx.user();
      await ctx.post(`/admin/users/${user.id}/ban`, { reason: 'Audit test ban' }, actor.token).expect(200);
      await ctx.post(`/admin/users/${user.id}/unban`, {}, actor.token).expect(200);

      const mine = await ctx.get(`/admin/audit-log?actor_id=${actor.id}`, admin.token).expect(200);
      expect((mine.body.data as { action: string }[]).map((e) => e.action)).toEqual(['USER_UNBANNED', 'USER_BANNED']);
      const bans = await ctx.get(`/admin/audit-log?actor_id=${actor.id}&action=USER_BANNED`, admin.token).expect(200);
      expect(bans.body.data).toHaveLength(1);
      expect(bans.body.data[0]).toMatchObject({
        target_type: 'user',
        target_id: user.id,
        metadata: { reason: 'Audit test ban' },
        actor: { id: actor.id },
      });
      await ctx.get('/admin/audit-log?action=lowercase', admin.token).expect(400);
      await ctx.get('/admin/audit-log?actor_id=nope', admin.token).expect(400);
    });
  });

  describe('banners', () => {
    const create = (body: object, token = admin.token) => ctx.post('/admin/banners', body, token);
    const base = (overrides: object = {}) => ({
      title: 'Eid sale',
      image_url: 'https://cdn.example.com/eid.jpg',
      placement: 'HOME_TOP',
      ...overrides,
    });
    const publicIds = async (placement?: string) =>
      ((await ctx.get(`/banners${placement ? `?placement=${placement}` : ''}`).expect(200)).body as Banner[]).map((b) => b.id);

    it('creates, lists, edits and deletes, with defaults and audit lines', async () => {
      const made = await create(base({ link_url: 'https://example.com/eid' })).expect(201);
      expect(made.body).toMatchObject({
        title: 'Eid sale',
        placement: 'HOME_TOP',
        sort_order: 0,
        is_active: true,
        link_property_id: null,
        link_url: 'https://example.com/eid',
        starts_at: null,
        ends_at: null,
      });
      const id = made.body.id as string;

      const all = await ctx.get('/admin/banners', admin.token).expect(200);
      expect((all.body as Banner[]).map((b) => b.id)).toContain(id);

      const edited = await ctx.patch(`/admin/banners/${id}`, { title: 'Eid sale 2', sort_order: 3 }, admin.token).expect(200);
      expect(edited.body).toMatchObject({ title: 'Eid sale 2', sort_order: 3, link_url: 'https://example.com/eid' });

      await ctx.del(`/admin/banners/${id}`, admin.token).expect(204);
      await ctx.del(`/admin/banners/${id}`, admin.token).expect(404);
      await ctx.patch(`/admin/banners/${id}`, { title: 'gone' }, admin.token).expect(404);

      const log = await ctx.get(`/admin/audit-log?target_type=banner&target_id=${id}`, admin.token).expect(200);
      expect((log.body.data as { action: string }[]).map((e) => e.action).sort()).toEqual(
        ['BANNER_CREATED', 'BANNER_DELETED', 'BANNER_UPDATED'],
      );
    });

    it('is for admins only, and validates the banner', async () => {
      const user = await ctx.user();
      await create(base(), user.token).expect(403);
      await ctx.get('/admin/banners', user.token).expect(403);
      await create(base({ title: '' })).expect(400);
      await create(base({ image_url: 'ftp://x/y.jpg' })).expect(400);
      await create(base({ placement: 'FOOTER' })).expect(400);
      await create(base({ sort_order: -1 })).expect(400);
      // One link only.
      const listing = await ctx.listing(user);
      await create(base({ link_url: 'https://example.com', link_property_id: listing.id })).expect(400);
      // The window must run forward.
      await create(base({ starts_at: '2026-10-02T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' })).expect(400);
      // A linked listing must exist.
      const missing = await create(base({ link_property_id: randomUUID() })).expect(400);
      expect(missing.body.code).toBe('LINK_PROPERTY_NOT_FOUND');
    });

    it('re-checks the cross-field rules on edit: switching link kind, and the window against the stored one', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      const made = await create(
        base({ link_url: 'https://example.com/a', starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-10T00:00:00Z' }),
      ).expect(201);

      // Choosing a listing replaces the web address instead of failing.
      const toListing = await ctx.patch(`/admin/banners/${made.body.id}`, { link_property_id: listing.id }, admin.token).expect(200);
      expect(toListing.body).toMatchObject({ link_property_id: listing.id, link_url: null });
      const toUrl = await ctx.patch(`/admin/banners/${made.body.id}`, { link_url: 'https://example.com/b' }, admin.token).expect(200);
      expect(toUrl.body).toMatchObject({ link_property_id: null, link_url: 'https://example.com/b' });
      // Sending both is still refused.
      await ctx.patch(`/admin/banners/${made.body.id}`, { link_url: 'https://example.com/c', link_property_id: listing.id }, admin.token).expect(400);
      // Moving only the end before the stored start is refused.
      await ctx.patch(`/admin/banners/${made.body.id}`, { ends_at: '2026-09-30T00:00:00Z' }, admin.token).expect(400);
      await ctx.patch(`/admin/banners/${made.body.id}`, {}, admin.token).expect(400);
      // Clearing a date is allowed.
      const open = await ctx.patch(`/admin/banners/${made.body.id}`, { ends_at: null }, admin.token).expect(200);
      expect(open.body.ends_at).toBeNull();
    });

    it('shows the public only active banners inside their window, in order, per placement', async () => {
      const mk = async (overrides: object) => (await create(base({ placement: 'SEARCH_TOP', ...overrides })).expect(201)).body.id as string;
      const second = await mk({ title: 'second', sort_order: 20 });
      const first = await mk({ title: 'first', sort_order: 10 });
      const inactive = await mk({ title: 'off', is_active: false });
      const future = await mk({ title: 'future', starts_at: new Date(Date.now() + DAY).toISOString() });
      const past = await mk({ title: 'past', ends_at: new Date(Date.now() - DAY).toISOString() });
      const running = await mk({
        title: 'running',
        sort_order: 15,
        starts_at: new Date(Date.now() - DAY).toISOString(),
        ends_at: new Date(Date.now() + DAY).toISOString(),
      });
      const home = await mk({ title: 'home one', placement: 'HOME_TOP' });

      const search = await publicIds('SEARCH_TOP');
      const mine = [first, running, second].filter((id) => search.includes(id));
      expect(mine).toEqual([first, running, second]);
      expect(search.indexOf(first)).toBeLessThan(search.indexOf(running));
      expect(search.indexOf(running)).toBeLessThan(search.indexOf(second));
      for (const hidden of [inactive, future, past, home]) expect(search).not.toContain(hidden);
      expect(await publicIds('HOME_TOP')).toContain(home);
      expect(await publicIds()).toEqual(expect.arrayContaining([first, running, second, home]));
      await ctx.get('/banners?placement=NOPE').expect(400);

      const res = await ctx.get('/banners?placement=SEARCH_TOP').expect(200);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      // The admin list still has the hidden ones.
      const everything = ((await ctx.get('/admin/banners', admin.token).expect(200)).body as Banner[]).map((b) => b.id);
      expect(everything).toEqual(expect.arrayContaining([inactive, future, past]));
    });

    it('hides a banner for a listing that can no longer be opened', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      const id = (await create(base({ placement: 'HOME_TOP', link_property_id: listing.id })).expect(201)).body.id as string;
      expect(await publicIds('HOME_TOP')).toContain(id);

      await ctx.prisma.property.update({ where: { id: listing.id }, data: { status: 'SOLD' } });
      expect(await publicIds('HOME_TOP')).not.toContain(id);
      await ctx.prisma.property.update({ where: { id: listing.id }, data: { status: 'ACTIVE' } });
      expect(await publicIds('HOME_TOP')).toContain(id);

      await ctx.post(`/admin/users/${owner.id}/ban`, { reason: 'Banner visibility test' }, admin.token).expect(200);
      expect(await publicIds('HOME_TOP')).not.toContain(id);
      await ctx.post(`/admin/users/${owner.id}/unban`, {}, admin.token).expect(200);
      expect(await publicIds('HOME_TOP')).toContain(id);
    });
  });

  describe('prices', () => {
    afterEach(async () => {
      await ctx.prisma.pricingOverride.deleteMany({});
    });

    const entry = (list: PricingEntry[], key: string) => list.find((e) => e.key === key)!;

    it('lists every product with its default and whether it was changed', async () => {
      const res = await ctx.get('/admin/pricing', admin.token).expect(200);
      const list = res.body as PricingEntry[];
      expect(list.map((e) => e.key).sort()).toEqual(
        ['CONTACT_CREDITS', 'FEATURED_AD', 'LADDER', 'MAP_LOCATION', 'SUBSCRIPTION_MONTHLY', 'SUBSCRIPTION_QUARTERLY', 'SUBSCRIPTION_SEMIANNUAL', 'SUBSCRIPTION_YEARLY'],
      );
      expect(entry(list, 'LADDER')).toMatchObject({ price: 50, default_price: 50, overridden: false, quantity: null, updated_at: null });
      expect(entry(list, 'FEATURED_AD')).toMatchObject({ price: 100, quantity: 7, default_quantity: 7, overridden: false });
      expect(entry(list, 'CONTACT_CREDITS')).toMatchObject({ price: 40, quantity: 10 });
    });

    it('changes what new payments cost, the public price list, and nothing already agreed', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      const before = await ctx.post('/hesabpay/payments', { purpose: 'LADDER', property_id: listing.id }, owner.token).expect(201);
      expect(before.body.amount).toBe(50);

      const set = await ctx.put('/admin/pricing/LADDER', { price: 75.25 }, admin.token).expect(200);
      expect(entry(set.body, 'LADDER')).toMatchObject({ price: 75.25, default_price: 50, overridden: true });
      expect((await ctx.get('/hesabpay/pricing').expect(200)).body.ladder).toBe(75.25);

      const after = await ctx.post('/hesabpay/payments', { purpose: 'LADDER', property_id: listing.id }, owner.token).expect(201);
      expect(after.body.amount).toBe(75.25);
      // The earlier payment keeps the price it was started at, and still confirms at that amount.
      const stored = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: before.body.id } });
      expect(stored.amount.toNumber()).toBe(50);
      await ctx.confirmPayment(before.body.id);
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: before.body.id } })).status).toBe('SUCCESS');

      const reset = await ctx.del('/admin/pricing/LADDER', admin.token).expect(200);
      expect(entry(reset.body, 'LADDER')).toMatchObject({ price: 50, overridden: false });
      expect((await ctx.get('/hesabpay/pricing')).body.ladder).toBe(50);
    });

    it('sets how many days a featured purchase gives, and the payment honours it even if the price changes again', async () => {
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      await ctx.put('/admin/pricing/FEATURED_AD', { price: 200, quantity: 3 }, admin.token).expect(200);
      const pricing = (await ctx.get('/hesabpay/pricing')).body;
      expect(pricing).toMatchObject({ featured_ad: 200, featured_ad_days: 3 });

      const id = await ctx.pay(owner, { purpose: 'FEATURED_AD', property_id: listing.id }, false);
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id } })).quantity).toBe(3);
      // The admin changes the days before the owner's payment is confirmed; the owner still gets what they were quoted.
      await ctx.put('/admin/pricing/FEATURED_AD', { price: 200, quantity: 30 }, admin.token).expect(200);
      await ctx.confirmPayment(id);
      const row = await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } });
      near(row.featuredUntil, Date.now() + 3 * DAY);
    });

    it('sets how many reveals a credit pack gives', async () => {
      const buyer = await ctx.user();
      await ctx.put('/admin/pricing/CONTACT_CREDITS', { price: 99, quantity: 25 }, admin.token).expect(200);
      const id = await ctx.pay(buyer, { purpose: 'CONTACT_CREDITS' });
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id } })).amount.toNumber()).toBe(99);
      const credits = await ctx.prisma.userCredit.findMany({ where: { userId: buyer.id } });
      expect(credits.reduce((sum, c) => sum + c.remaining, 0)).toBe(25);
    });

    it('validates: positive price, quantity only where it makes sense, known keys, admins only', async () => {
      await ctx.put('/admin/pricing/LADDER', { price: 0 }, admin.token).expect(400);
      await ctx.put('/admin/pricing/LADDER', { price: -5 }, admin.token).expect(400);
      await ctx.put('/admin/pricing/LADDER', {}, admin.token).expect(400);
      await ctx.put('/admin/pricing/LADDER', { price: 'free' }, admin.token).expect(400);
      const res = await ctx.put('/admin/pricing/LADDER', { price: 10, quantity: 3 }, admin.token).expect(400);
      expect(res.body.code).toBe('PRICING_QUANTITY_NOT_APPLICABLE');
      await ctx.put('/admin/pricing/FEATURED_AD', { price: 10, quantity: 366 }, admin.token).expect(400);
      await ctx.put('/admin/pricing/GOLD_PLAN', { price: 10 }, admin.token).expect(400);
      const user = await ctx.user();
      await ctx.put('/admin/pricing/LADDER', { price: 10 }, user.token).expect(403);
      await ctx.del('/admin/pricing/LADDER', user.token).expect(403);
      expect(await ctx.prisma.pricingOverride.count()).toBe(0);
    });

    it('audits changes with before and after, and resetting a default does nothing', async () => {
      await ctx.put('/admin/pricing/MAP_LOCATION', { price: 45 }, admin.token).expect(200);
      await ctx.del('/admin/pricing/MAP_LOCATION', admin.token).expect(200);
      await ctx.del('/admin/pricing/MAP_LOCATION', admin.token).expect(200); // already the default: no second line
      const log = await ctx.get('/admin/audit-log?target_type=pricing&target_id=MAP_LOCATION&limit=50', admin.token).expect(200);
      const mine = (log.body.data as { action: string; actor: { id: string } | null; metadata: Record<string, unknown> | null }[]).filter(
        (e) => e.actor?.id === admin.id,
      );
      expect(mine.map((e) => e.action)).toEqual(['PRICE_RESET', 'PRICE_CHANGED']);
      expect(mine[1].metadata).toMatchObject({ from_price: 30, to_price: 45 });
    });
  });

  describe('platform overview', () => {
    const overview = async (days?: number): Promise<AdminOverview> =>
      (await ctx.get(`/admin/analytics/overview${days ? `?days=${days}` : ''}`, admin.token).expect(200)).body;
    const afn = (o: AdminOverview, where: 'all_time' | 'in_range') =>
      o.revenue[where].find((m) => m.currency === 'AFGHANI')?.total ?? 0;

    it('reports the range, zero-filled signups and the shape the dashboard needs', async () => {
      const o = await overview();
      expect(o.range.days).toBe(30);
      expect(o.users.daily_signups).toHaveLength(30);
      expect(o.users.daily_signups.at(-1)!.day).toBe(o.range.to);
      expect(o.users.daily_signups[0].day).toBe(o.range.from);
      expect(Object.keys(o.users.by_role).sort()).toEqual(['ADMIN', 'AGENCY', 'USER']);
      expect((await overview(7)).users.daily_signups).toHaveLength(7);
      await ctx.get('/admin/analytics/overview?days=6', admin.token).expect(400);
      await ctx.get('/admin/analytics/overview?days=91', admin.token).expect(400);
      await ctx.get('/admin/analytics/overview?days=abc', admin.token).expect(400);
    });

    it('moves by exactly what happens: revenue, payments, users, listings, moderation', async () => {
      const before = await overview();

      // Revenue: one confirmed 900-afghani subscription, one confirmed 50 ladder, one unpaid payment.
      const agency = await ctx.agency(false);
      const owner = await ctx.user();
      const listing = await ctx.listing(owner);
      await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await ctx.pay(owner, { purpose: 'LADDER', property_id: listing.id });
      await ctx.pay(owner, { purpose: 'LADDER', property_id: listing.id }, false);
      // A payment stuck for two hours.
      const stuck = await ctx.pay(owner, { purpose: 'LADDER', property_id: listing.id }, false);
      await ctx.prisma.transaction.update({ where: { id: stuck }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
      // Moderation: an open report, a pending agency (created above), a ban and a takedown.
      const reporter = await ctx.user();
      await ctx.post('/reports', { target_type: 'USER', target_id: owner.id, reason: 'SPAM' }, reporter.token).expect(201);
      const banned = await ctx.user();
      await ctx.post(`/admin/users/${banned.id}/ban`, { reason: 'Overview test' }, admin.token).expect(200);
      await ctx.post(`/admin/properties/${listing.id}/remove`, { reason: 'Overview test' }, admin.token).expect(200);
      // Active users: signing in counts.
      const signedIn = await ctx.signUp();

      const after = await overview();
      expect(afn(after, 'all_time') - afn(before, 'all_time')).toBe(950);
      expect(afn(after, 'in_range') - afn(before, 'in_range')).toBe(950);
      expect(after.payments.succeeded - before.payments.succeeded).toBe(2);
      expect(after.payments.pending - before.payments.pending).toBe(2);
      expect(after.payments.pending_over_one_hour - before.payments.pending_over_one_hour).toBe(1);

      const purposeTotal = (o: AdminOverview, purpose: string) =>
        o.revenue.by_purpose.find((p) => p.purpose === purpose && p.currency === 'AFGHANI')?.total ?? 0;
      expect(purposeTotal(after, 'SUBSCRIPTION') - purposeTotal(before, 'SUBSCRIPTION')).toBe(900);
      expect(purposeTotal(after, 'LADDER') - purposeTotal(before, 'LADDER')).toBe(50);
      const today = after.range.to;
      const day = (o: AdminOverview) => o.revenue.daily.find((d) => d.day === today && d.currency === 'AFGHANI')?.total ?? 0;
      expect(day(after) - day(before)).toBe(950);

      expect(after.users.total - before.users.total).toBe(5); // agency owner, listing owner, reporter, banned, signed-up
      expect(after.users.banned - before.users.banned).toBe(1);
      expect(after.users.active_30d - before.users.active_30d).toBe(1);
      expect(after.users.new_in_range - before.users.new_in_range).toBe(5);
      expect(after.users.by_role.AGENCY - before.users.by_role.AGENCY).toBe(1);
      expect(after.listings.removed_by_admin - before.listings.removed_by_admin).toBe(1);
      expect(after.listings.archived - before.listings.archived).toBe(1);
      expect(after.moderation.open_reports - before.moderation.open_reports).toBe(1);
      expect(after.moderation.pending_verifications - before.moderation.pending_verifications).toBe(1);
      expect(after.agencies.with_active_subscription - before.agencies.with_active_subscription).toBe(1);
      expect(signedIn.id).toBeDefined();
    });

    it('counts signups on the Kabul calendar day, not the UTC one', async () => {
      const user = await ctx.user();
      const a = await overview(7);
      const first = a.range.from;
      const second = a.users.daily_signups[1].day;
      const today = a.range.to;
      const count = (o: AdminOverview, day: string) => o.users.daily_signups.find((d) => d.day === day)!.count;

      // Mid-morning in Kabul on the first day of the range.
      // (Set in SQL with an explicit UTC instant: the day buckets are computed in SQL from the true instant.)
      const setCreatedAt = (iso: string) =>
        ctx.prisma.$executeRaw`UPDATE users SET created_at = ${iso}::timestamptz WHERE id = ${user.id}::uuid`;
      await setCreatedAt(`${first}T06:00:00Z`);
      const b = await overview(7);
      expect(count(b, first) - count(a, first)).toBe(1);
      expect(count(b, today) - count(a, today)).toBe(-1);

      // 19:45 UTC is 00:15 the NEXT day in Kabul (UTC+4:30).
      await setCreatedAt(`${first}T19:45:00Z`);
      const c = await overview(7);
      expect(count(c, first)).toBe(count(a, first));
      expect(count(c, second) - count(a, second)).toBe(1);
    });

    it('does not count failed or unpaid payments as revenue', async () => {
      const before = await overview();
      const user = await ctx.user();
      const listing = await ctx.listing(user);
      const id = await ctx.pay(user, { purpose: 'LADDER', property_id: listing.id }, false);
      await ctx.prisma.transaction.update({ where: { id }, data: { status: 'FAILED' } });
      const after = await overview();
      expect(afn(after, 'all_time')).toBe(afn(before, 'all_time'));
      expect(after.payments.failed - before.payments.failed).toBe(1);
    });
  });
});
