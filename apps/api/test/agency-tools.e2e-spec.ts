import { SUBSCRIPTION_PLAN_BENEFITS } from '@bongah/shared-types';
import { randomUUID } from 'node:crypto';
import type {
  AgencyAnalytics,
  BulkResponse,
  Paginated,
  Property,
  PropertyImageItem,
  PropertyImageUploaded,
} from '@bongah/shared-types';
import { hasDb, jpegBytes, PIN, pngBytes, propertyBody, TestContext, type TestUser } from './helpers.js';

describe.skipIf(!hasDb)('Agency tools: analytics, bulk listings, listing pictures (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  // ───────────── analytics ─────────────

  describe('GET /agencies/me/analytics', () => {
    const analytics = async (user: TestUser, query = '') =>
      (await ctx.get(`/agencies/me/analytics${query}`, user.token).expect(200)).body as AgencyAnalytics;
    const view = (listingId: string) => ctx.post(`/properties/${listingId}/view`, {}).expect(204);
    const text = (body = 'salaam') => ({ type: 'TEXT', client_id: randomUUID(), body });

    it('is for agencies only', async () => {
      await ctx.get('/agencies/me/analytics').expect(401);
      const user = await ctx.user();
      const res = await ctx.get('/agencies/me/analytics', user.token).expect(404);
      expect(res.body.code).toBe('AGENCY_PROFILE_REQUIRED');
    });

    it('starts at zero, with one entry per day', async () => {
      const agency = await ctx.agency(true);
      const result = await analytics(agency);
      expect(result.range.days).toBe(30);
      expect(result.series).toHaveLength(30);
      expect(result.series[0].day).toBe(result.range.from);
      expect(result.series.at(-1)!.day).toBe(result.range.to);
      expect(result.totals).toEqual({ views: 0, leads: 0, phone_reveals: 0 });
      expect(result.listings).toEqual([]);
      expect(result.lifetime_views).toBe(0);
      expect((await analytics(agency, '?days=7')).series).toHaveLength(7);
      await ctx.get('/agencies/me/analytics?days=3', agency.token).expect(400);
      await ctx.get('/agencies/me/analytics?days=500', agency.token).expect(400);
    });

    it('counts views, leads and phone reveals per day and per listing', async () => {
      const agency = await ctx.agency(true);
      const busy = await ctx.listing(agency, { title: 'Busy house' });
      const quiet = await ctx.listing(agency, { title: 'Quiet house' });

      for (let i = 0; i < 3; i++) await view(busy.id);
      await view(quiet.id);

      // Two buyers start chats and write; a third opens a chat but never writes (not a lead).
      const [b1, b2, b3] = await Promise.all([ctx.user(), ctx.user(), ctx.user()]);
      for (const buyer of [b1, b2]) {
        const chat = await ctx.post('/chat/conversations', { property_id: busy.id }, buyer.token).expect(200);
        await ctx.post(`/chat/conversations/${chat.body.id}/messages`, text(), buyer.token).expect(201);
      }
      await ctx.post('/chat/conversations', { property_id: quiet.id }, b3.token).expect(200);
      // The agency answering its own chat does not make a lead either.

      // One buyer reveals the number from the busy listing.
      await ctx.post(`/properties/${busy.id}/contact/unlock`, {}, b1.token).expect(200);

      const result = await analytics(agency);
      expect(result.totals).toEqual({ views: 4, leads: 2, phone_reveals: 1 });
      const today = result.series.at(-1)!;
      expect(today).toEqual({ day: result.range.to, views: 4, leads: 2, phone_reveals: 1 });
      expect(result.series.slice(0, -1).every((d) => d.views === 0 && d.leads === 0 && d.phone_reveals === 0)).toBe(true);
      expect(result.listings.map((l) => l.id)).toEqual([busy.id, quiet.id]); // busiest first
      expect(result.listings[0]).toMatchObject({ title: 'Busy house', status: 'ACTIVE', views: 3, leads: 2, phone_reveals: 1 });
      expect(result.listings[1]).toMatchObject({ title: 'Quiet house', views: 1, leads: 0, phone_reveals: 0 });
      expect(result.lifetime_views).toBe(4);
    });

    it('places events on the Kabul day they happened and leaves out what is outside the range', async () => {
      const agency = await ctx.agency(true);
      const listing = await ctx.listing(agency);
      const first = await analytics(agency, '?days=7');
      const earliest = first.range.from;
      const [{ gap }] = await ctx.prisma.$queryRaw<{ gap: string }[]>`SELECT (${earliest}::date - 1)::text AS gap`;
      await ctx.prisma.$executeRaw`
        INSERT INTO property_view_days (property_id, day, count)
        VALUES (${listing.id}::uuid, ${earliest}::date, 5), (${listing.id}::uuid, ${gap}::date, 9)`;

      const result = await analytics(agency, '?days=7');
      expect(result.series[0]).toEqual({ day: earliest, views: 5, leads: 0, phone_reveals: 0 });
      expect(result.totals.views).toBe(5); // the day before the range is not counted
    });

    it('does not include other agencies, or listings the owner posted before registering', async () => {
      const mine = await ctx.agency(true);
      const other = await ctx.agency(true);
      const theirs = await ctx.listing(other);
      const unattached = await ctx.listing(mine, { agencyId: null });
      await view(theirs.id);
      await view(unattached.id);
      const result = await analytics(mine);
      expect(result.totals.views).toBe(0);
      expect(result.lifetime_views).toBe(0);
    });

    it('keeps working after the subscription ends (the numbers stay readable)', async () => {
      const lapsed = await ctx.lapsedAgency();
      await analytics(lapsed);
    });
  });

  // ───────────── bulk listings ─────────────

  describe('bulk listings', () => {
    const bulkCreate = (user: TestUser, items: unknown[]) => ctx.post('/agencies/me/properties/bulk', { items }, user.token);
    const bulkUpdate = (user: TestUser, items: unknown[]) => ctx.patch('/agencies/me/properties/bulk', { items }, user.token);
    const body = (overrides: Record<string, unknown> = {}) => propertyBody(overrides);

    it('creates every valid row and reports the bad ones by position', async () => {
      const agency = await ctx.agency(true);
      const res = await bulkCreate(agency, [
        body({ title: 'Row zero' }),
        body({ title: '' }), // invalid
        body({ title: 'Row two', ...PIN }), // pinned: unlimited for a subscribed agency
        { nonsense: true }, // invalid
        body({ title: 'Row four', price: -5 }), // invalid
        body({ title: 'Row five' }),
      ]).expect(200);

      const result = res.body as BulkResponse<Property>;
      expect(result).toMatchObject({ total: 6, succeeded: 3, failed: 3 });
      expect(result.results.map((r) => [r.index, r.ok])).toEqual([[0, true], [1, false], [2, true], [3, false], [4, false], [5, true]]);
      const bad = result.results[1];
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.code).toBe('VALIDATION_FAILED');
        expect(bad.errors?.some((e) => e.field === 'title')).toBe(true);
      }
      const pinned = result.results[2];
      if (pinned.ok) expect(pinned.property).toMatchObject({ title: 'Row two', lat: PIN.lat });

      // Created under the agency, in the database.
      const rows = await ctx.prisma.property.findMany({ where: { userId: agency.id }, orderBy: { title: 'asc' } });
      expect(rows.map((r) => r.title)).toEqual(['Row five', 'Row two', 'Row zero']);
      expect(rows.every((r) => r.agencyId === agency.agencyId)).toBe(true);
    });

    it('gives a row that fails a business rule the same code the single endpoint would', async () => {
      const agency = await ctx.agency(true);
      // A pin outside Afghanistan is refused by the same rule as POST /properties.
      const single = await ctx.post('/properties', body({ lat: 10, lng: 10 }), agency.token);
      const res = await bulkCreate(agency, [body({ lat: 10, lng: 10 }), body()]).expect(200);
      const first = (res.body as BulkResponse<Property>).results[0];
      expect(single.status).toBeGreaterThanOrEqual(400);
      expect(first.ok).toBe(false);
      if (!first.ok) expect(first.code).toBe(single.body.code ?? 'VALIDATION_FAILED');
      expect(res.body).toMatchObject({ succeeded: 1, failed: 1 });
    });

    it('refuses the whole request without the agency perks, and for ordinary accounts', async () => {
      const lapsed = await ctx.lapsedAgency();
      const user = await ctx.user();
      const noPlan = await ctx.agency(false);
      for (const who of [lapsed, user, noPlan]) {
        const res = await bulkCreate(who, [body()]).expect(403);
        expect(res.body.code).toBe('PERKS_REQUIRED');
        await bulkUpdate(who, [{ id: randomUUID(), title: 'Anything' }]).expect(403);
      }
      await ctx.post('/agencies/me/properties/bulk', { items: [body()] }).expect(401);
      expect(await ctx.prisma.property.count({ where: { userId: { in: [lapsed.id, user.id, noPlan.id] } } })).toBe(0);
    });

    it('validates the envelope: at least one row, at most 50, nothing extra', async () => {
      const agency = await ctx.agency(true);
      await bulkCreate(agency, []).expect(400);
      await bulkCreate(agency, Array.from({ length: 51 }, () => body())).expect(400);
      await ctx.post('/agencies/me/properties/bulk', { items: [body()], dry_run: true }, agency.token).expect(400);
      await ctx.post('/agencies/me/properties/bulk', {}, agency.token).expect(400);
      expect(await ctx.prisma.property.count({ where: { userId: agency.id } })).toBe(0);

      // Bulk rows go through the same code as POST /properties, so the plan's listing allowance applies to them too.
      const quota = SUBSCRIPTION_PLAN_BENEFITS.MONTHLY.listings;
      const fifty = await bulkCreate(agency, Array.from({ length: 50 }, (_, i) => body({ title: `Bulk ${i}` }))).expect(200);
      expect(fifty.body).toMatchObject({ total: 50, succeeded: quota, failed: 50 - quota });
      expect(fifty.body.results.filter((r: { ok: boolean }) => !r.ok).every((r: { code: string }) => r.code === 'AGENCY_LISTING_LIMIT_REACHED')).toBe(true);
    });

    it('edits many listings, and reports rows that are not the agency\'s, missing, or malformed', async () => {
      const agency = await ctx.agency(true);
      const other = await ctx.agency(true);
      const a = await ctx.listing(agency, { title: 'Edit A', price: 100 });
      const b = await ctx.listing(agency, { title: 'Edit B', price: 200 });
      const foreign = await ctx.listing(other, { title: 'Not mine' });

      const res = await bulkUpdate(agency, [
        { id: a.id, price: 111 },
        { id: b.id, status: 'SOLD' },
        { id: foreign.id, price: 1 },
        { id: randomUUID(), price: 1 },
        { id: 'nope', price: 1 },
        { price: 1 },
        { id: a.id, price: -1 },
        'not an object',
        { id: a.id, user_id: other.id }, // unknown field
      ]).expect(200);

      const result = res.body as BulkResponse<Property>;
      expect(result).toMatchObject({ total: 9, succeeded: 2, failed: 7 });
      const codes = result.results.map((r) => (r.ok ? 'OK' : r.code));
      expect(codes[0]).toBe('OK');
      expect(codes[1]).toBe('OK');
      expect(codes[2]).toBe('HTTP_403');
      expect(codes[3]).toBe('HTTP_404');
      expect(codes.slice(4)).toEqual(['VALIDATION_FAILED', 'VALIDATION_FAILED', 'VALIDATION_FAILED', 'VALIDATION_FAILED', 'VALIDATION_FAILED']);

      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: a.id } })).price.toNumber()).toBe(111);
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('SOLD');
      const untouched = await ctx.prisma.property.findUniqueOrThrow({ where: { id: foreign.id } });
      expect(untouched.price.toNumber()).not.toBe(1);
    });

    it('cannot bring back a listing the team took down', async () => {
      const agency = await ctx.agency(true);
      const admin = await ctx.admin();
      const listing = await ctx.listing(agency);
      await ctx.post(`/admin/properties/${listing.id}/remove`, { reason: 'Bulk test' }, admin.token).expect(200);
      const res = await bulkUpdate(agency, [{ id: listing.id, status: 'ACTIVE' }]).expect(200);
      const row = (res.body as BulkResponse<Property>).results[0];
      expect(row.ok).toBe(false);
      if (!row.ok) expect(row.code).toBe('LISTING_REMOVED');
    });
  });

  // ───────────── pictures ─────────────

  describe('listing pictures', () => {
    const upload = (user: TestUser | null, bytes: Buffer, type = 'image/jpeg') => ctx.upload('/property-images', user, bytes, type);
    const mine = async (user: TestUser, query = '') =>
      (await ctx.get(`/property-images/mine${query}`, user.token).expect(200)).body as Paginated<PropertyImageItem>;

    it('stores a JPEG, PNG or WebP and serves it publicly with the right headers', async () => {
      const user = await ctx.user();
      const bytes = jpegBytes(3000);
      const res = await upload(user, bytes).expect(201);
      const stored = res.body as PropertyImageUploaded;
      expect(stored).toMatchObject({ content_type: 'image/jpeg', byte_size: 3000 });
      expect(stored.url).toMatch(new RegExp(`/property-images/${stored.id}$`));

      // No token needed to load it: it is a listing photo.
      const download = await ctx.get(`/property-images/${stored.id}`).expect(200);
      expect(download.headers['content-type']).toMatch(/^image\/jpeg/);
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['cache-control']).toContain('immutable');
      expect(Buffer.compare(download.body, bytes)).toBe(0);

      await upload(user, pngBytes(), 'image/png').expect(201);
      await upload(user, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(40)]), 'image/webp').expect(201);
    });

    it('turns away what is not a picture: wrong type, wrong bytes, empty, no token', async () => {
      const user = await ctx.user();
      expect((await upload(user, jpegBytes(), 'image/gif').expect(415)).body.code).toBe('UNSUPPORTED_IMAGE_TYPE');
      expect((await upload(user, jpegBytes(), 'application/json').expect(415)).body.code).toBe('UNSUPPORTED_IMAGE_TYPE');
      // PNG bytes claiming to be a JPEG.
      expect((await upload(user, pngBytes(), 'image/jpeg').expect(415)).body.code).toBe('UNSUPPORTED_IMAGE_TYPE');
      // A script renamed to .jpg.
      await upload(user, Buffer.from('<script>alert(1)</script>'.repeat(20))).expect(415);
      await upload(user, Buffer.alloc(0)).expect(400);
      await upload(null, jpegBytes()).expect(401);
      expect((await mine(user)).meta.total).toBe(0);
    });

    it('allows 3 MB to an ordinary account and 15 MB to an agency with a plan', async () => {
      const user = await ctx.user();
      const agency = await ctx.agency(true);
      const lapsed = await ctx.lapsedAgency();
      const big = jpegBytes(3_500_000);

      expect((await upload(user, big).expect(413)).body.code).toBeDefined();
      await upload(lapsed, big).expect(413);
      const ok = await upload(agency, big).expect(201);
      expect(ok.body.byte_size).toBe(3_500_000);
      await upload(agency, jpegBytes(15_500_000)).expect(413);
      // Within the ordinary cap is fine for everyone.
      await upload(user, jpegBytes(2_900_000)).expect(201);
    });

    it('lists my pictures newest first with the listings that use them, and only mine', async () => {
      const user = await ctx.user();
      const other = await ctx.user();
      const a = (await upload(user, jpegBytes(1000)).expect(201)).body as PropertyImageUploaded;
      await new Promise((resolve) => setTimeout(resolve, 15));
      const b = (await upload(user, jpegBytes(1100)).expect(201)).body as PropertyImageUploaded;
      await upload(other, jpegBytes(1200)).expect(201);
      const listing = await ctx.listing(user, { images: [a.url, 'https://example.com/elsewhere.jpg'] });

      const list = await mine(user);
      expect(list.data.map((i) => i.id)).toEqual([b.id, a.id]);
      expect(list.data[0].used_by_property_ids).toEqual([]);
      expect(list.data[1].used_by_property_ids).toEqual([listing.id]);
      expect(list.meta.total).toBe(2);
      expect((await mine(user, '?limit=1&page=2')).data.map((i) => i.id)).toEqual([a.id]);
      await ctx.get('/property-images/mine?limit=999', user.token).expect(400);
      await ctx.get('/property-images/mine').expect(401);
    });

    it('can be put on a listing by URL, and deleting is refused while a listing uses it', async () => {
      const agency = await ctx.agency(true);
      const stored = (await upload(agency, jpegBytes(1500)).expect(201)).body as PropertyImageUploaded;
      const created = await ctx.post('/properties', propertyBody({ images: [stored.url] }), agency.token).expect(201);
      expect(created.body.images).toEqual([stored.url]);

      const blocked = await ctx.del(`/property-images/${stored.id}`, agency.token).expect(409);
      expect(blocked.body.code).toBe('IMAGE_IN_USE');
      await ctx.get(`/property-images/${stored.id}`).expect(200);

      // Take it off the listing, then it can go.
      await ctx.patch(`/properties/${created.body.id}`, { images: ['https://example.com/other.jpg'] }, agency.token).expect(200);
      await ctx.del(`/property-images/${stored.id}`, agency.token).expect(204);
      await ctx.get(`/property-images/${stored.id}`).expect(404);
      await ctx.del(`/property-images/${stored.id}`, agency.token).expect(404);
    });

    it('cannot be deleted by anyone else, and a made-up id is a 404/400', async () => {
      const owner = await ctx.user();
      const stranger = await ctx.user();
      const stored = (await upload(owner, jpegBytes(900)).expect(201)).body as PropertyImageUploaded;
      await ctx.del(`/property-images/${stored.id}`, stranger.token).expect(404);
      await ctx.del(`/property-images/${stored.id}`).expect(401);
      await ctx.get(`/property-images/${stored.id}`).expect(200); // still there
      await ctx.get(`/property-images/${randomUUID()}`).expect(404);
      await ctx.get('/property-images/not-a-uuid').expect(400);
    });

    it('stops at the account quota, with room again after a delete', async () => {
      const user = await ctx.user();
      const quota = 100;
      await ctx.prisma.propertyImage.createMany({
        data: Array.from({ length: quota }, () => ({ uploaderId: user.id, contentType: 'image/jpeg', byteSize: 10 })),
      });
      const res = await upload(user, jpegBytes()).expect(403);
      expect(res.body).toMatchObject({ code: 'IMAGE_QUOTA_REACHED', limit: quota });

      const one = await ctx.prisma.propertyImage.findFirstOrThrow({ where: { uploaderId: user.id } });
      await ctx.del(`/property-images/${one.id}`, user.token).expect(204);
      await upload(user, jpegBytes()).expect(201);
    });

    it('refuses a banned account', async () => {
      const admin = await ctx.admin();
      const user = await ctx.user();
      await ctx.post(`/admin/users/${user.id}/ban`, { reason: 'Picture test' }, admin.token).expect(200);
      expect((await upload(user, jpegBytes()).expect(403)).body.code).toBe('ACCOUNT_BANNED');
    });
  });
});
