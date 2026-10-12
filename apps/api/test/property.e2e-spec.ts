import { Role } from '../src/generated/prisma/client.js';
import { hasDb, propertyBody, TestContext, uniqueProvince, type TestUser } from './helpers.js';

describe.skipIf(!hasDb)('Properties (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** Inserts a listing directly, bypassing the quota. */
  const seed = (owner: TestUser, overrides: Record<string, unknown> = {}) =>
    ctx.prisma.property.create({
      data: {
        userId: owner.id,
        title: 'Seeded',
        description: 'Seeded listing',
        type: 'APARTMENT',
        dealType: 'SALE',
        price: 1000,
        currency: 'USD',
        areaSqm: 50,
        province: 'Kabul',
        district: 'Shar-e-Naw',
        neighborhood: 'Qala-e-Fathullah',
        address: 'Somewhere',
        lat: 34.5,
        lng: 69.2,
        ...overrides,
      },
    });

  describe('POST /properties: free quota for regular users', () => {
    it('rejects anonymous requests', async () => {
      await ctx.post('/properties', propertyBody()).expect(401);
    });

    it('lets a user publish one listing and returns the public shape', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', propertyBody({ province: 'كابل' }), user.token).expect(201);

      expect(res.body).toMatchObject({
        user_id: user.id,
        agency_id: null,
        title: 'Two bedroom apartment',
        type: 'APARTMENT',
        deal_type: 'SALE',
        price: 85000,
        currency: 'USD',
        status: 'ACTIVE',
        is_featured: false,
        featured_until: null,
        images: ['https://example.com/a.jpg'],
        province: 'کابل', // Arabic kaf folded to the Persian letter
      });
      // New listings enter the feed at creation time.
      expect(res.body.laddered_at).toBe(res.body.created_at);
    });

    it('accepts every property type, including GARDEN_VILLA, and returns it unchanged', async () => {
      const admin = await ctx.user(Role.ADMIN); // no monthly cap, so one user can try every type
      for (const type of ['APARTMENT', 'HOUSE_HAWILI', 'LAND', 'OFFICE_SHOP', 'GARDEN_VILLA']) {
        const res = await ctx.post('/properties', propertyBody({ type }), admin.token).expect(201);
        expect(res.body.type).toBe(type);
        const stored = await ctx.prisma.property.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(stored.type).toBe(type);
      }
    });

    it('refuses the second listing in the same month and says when the quota resets', async () => {
      const user = await ctx.user();
      await ctx.post('/properties', propertyBody(), user.token).expect(201);
      const res = await ctx.post('/properties', propertyBody(), user.token).expect(403);

      expect(res.body.code).toBe('FREE_LISTING_LIMIT_REACHED');
      expect(res.body.limit).toBe(1);
      const resetsAt = new Date(res.body.resets_at);
      expect(resetsAt.getTime()).toBeGreaterThan(Date.now());
      // 00:00 Kabul time is 19:30 UTC the day before.
      expect(resetsAt.toISOString().slice(10)).toBe('T19:30:00.000Z');
    });

    it('does not give the quota back when the listing is archived or marked sold', async () => {
      const user = await ctx.user();
      const created = await ctx.post('/properties', propertyBody(), user.token).expect(201);
      await ctx.del(`/properties/${created.body.id}`, user.token).expect(204);
      await ctx.post('/properties', propertyBody(), user.token).expect(403);
    });

    it('does not count listings from earlier months', async () => {
      const user = await ctx.user();
      await seed(user, { createdAt: new Date(Date.now() - 40 * 86_400_000) });
      await ctx.post('/properties', propertyBody(), user.token).expect(201);
    });

    it('keeps quotas independent between users', async () => {
      const [a, b] = [await ctx.user(), await ctx.user()];
      await ctx.post('/properties', propertyBody(), a.token).expect(201);
      await ctx.post('/properties', propertyBody(), b.token).expect(201);
    });

    it('lets exactly one of many simultaneous requests through', async () => {
      const user = await ctx.user();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => ctx.post('/properties', propertyBody(), user.token)),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 403, 403, 403, 403, 403]);
      expect(await ctx.prisma.property.count({ where: { userId: user.id } })).toBe(1);
    });

    it('makes creates wait for each other on the user row (so the quota check cannot be raced)', async () => {
      // Deterministic version of the test above: hold the row lock ourselves and check that creates
      // queue behind it instead of racing past, then that exactly one of them wins once it is released.
      const user = await ctx.user();
      let release!: () => void;
      let locked!: () => void;
      const lockAcquired = new Promise<void>((resolve) => (locked = resolve));
      const holder = ctx.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
          locked();
          await new Promise<void>((resolve) => (release = resolve));
        },
        { timeout: 20_000 },
      );
      await lockAcquired;

      const attempts = [0, 1].map(() => {
        const state = { settled: false };
        const response = Promise.resolve(ctx.post('/properties', propertyBody(), user.token)).then((r) => {
          state.settled = true;
          return r;
        });
        return { state, response };
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(attempts.map((a) => a.state.settled)).toEqual([false, false]);

      release();
      await holder;
      const statuses = (await Promise.all(attempts.map((a) => a.response))).map((r) => r.status).sort();
      expect(statuses).toEqual([201, 403]);
    });

    it('rejects a token for an account that no longer exists', async () => {
      const ghost = await ctx.user();
      await ctx.prisma.user.delete({ where: { id: ghost.id } });
      await ctx.post('/properties', propertyBody(), ghost.token).expect(401);
    });
  });

  describe('POST /properties: agencies need an active subscription', () => {
    it('refuses an AGENCY account that never registered an agency', async () => {
      const user = await ctx.user(Role.AGENCY);
      const res = await ctx.post('/properties', propertyBody(), user.token).expect(403);
      expect(res.body.code).toBe('AGENCY_PROFILE_REQUIRED');
    });

    it('refuses an agency with no subscription', async () => {
      const agency = await ctx.agency(false);
      const res = await ctx.post('/properties', propertyBody(), agency.token).expect(403);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it.each([
      ['has ended', { startDate: new Date(Date.now() - 60 * 86_400_000), endDate: new Date(Date.now() - 1000) }, 'ACTIVE'],
      ['has not started yet', { startDate: new Date(Date.now() + 86_400_000), endDate: new Date(Date.now() + 30 * 86_400_000) }, 'ACTIVE'],
      ['is marked EXPIRED', { startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000) }, 'EXPIRED'],
    ] as const)('refuses an agency whose subscription %s', async (_label, dates, status) => {
      const agency = await ctx.agency(false);
      await ctx.prisma.subscription.create({
        data: { agencyId: agency.agencyId, packageType: 'MONTHLY', status, ...dates },
      });
      const res = await ctx.post('/properties', propertyBody(), agency.token).expect(403);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('lets a subscribed agency publish without a monthly cap, tagged with its agency', async () => {
      const agency = await ctx.agency(true);
      for (let i = 0; i < 3; i++) {
        const res = await ctx.post('/properties', propertyBody(), agency.token).expect(201);
        expect(res.body.agency_id).toBe(agency.agencyId);
      }
    });

    it('trusts the database role, not the (possibly stale) role inside the token', async () => {
      // Token says USER, database says AGENCY with a subscription: no cap.
      const agency = await ctx.agency(true);
      const staleToken = await ctx.tokenFor(agency.id, Role.USER);
      await ctx.post('/properties', propertyBody(), staleToken).expect(201);
      await ctx.post('/properties', propertyBody(), staleToken).expect(201);

      // Token says AGENCY, database says USER: the free quota applies.
      const user = await ctx.user();
      const forged = await ctx.tokenFor(user.id, Role.AGENCY);
      await ctx.post('/properties', propertyBody(), forged).expect(201);
      await ctx.post('/properties', propertyBody(), forged).expect(403);
    });

    it('lets an admin publish without limits', async () => {
      const admin = await ctx.user(Role.ADMIN);
      for (let i = 0; i < 3; i++) {
        const res = await ctx.post('/properties', propertyBody(), admin.token).expect(201);
        expect(res.body.agency_id).toBeNull();
      }
    });
  });

  describe('POST /properties: validation', () => {
    const bad = async (overrides: Record<string, unknown>, field: string) => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', propertyBody(overrides), user.token).expect(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
      // A rejected request must not use up the free quota.
      expect(await ctx.prisma.property.count({ where: { userId: user.id } })).toBe(0);
    };

    it('rejects coordinates outside Afghanistan', async () => {
      await bad({ lat: 51.5, lng: -0.12 }, 'lat');
      await bad({ lat: 34.5, lng: 120 }, 'lng');
    });
    it('rejects prices with more than 2 decimals, zero, negative or too large', async () => {
      await bad({ price: 10.123 }, 'price');
      await bad({ price: 0 }, 'price');
      await bad({ price: -5 }, 'price');
      await bad({ price: 1e12 }, 'price');
    });
    it('rejects unknown enum values and the wrong currency spelling', async () => {
      await bad({ type: 'VILLA' }, 'type');
      await bad({ deal_type: 'BUY' }, 'deal_type');
      await bad({ currency: 'AFN' }, 'currency');
    });
    it('rejects non-http image URLs', async () => {
      await bad({ images: ['javascript:alert(1)'] }, 'images.0');
    });
    it('rejects fields the client must not set', async () => {
      await bad({ status: 'SOLD' }, '');
      await bad({ is_featured: true }, '');
      await bad({ laddered_at: '2030-01-01T00:00:00Z' }, '');
      await bad({ user_id: '00000000-0000-4000-8000-000000000000' }, '');
    });
    it('rejects non-integer room counts and missing fields', async () => {
      await bad({ bedrooms: 2.5 }, 'bedrooms');
      await bad({ title: undefined }, 'title');
    });
  });

  describe('GET /properties', () => {
    it('filters by province, district, type, deal type and price range (public, no token)', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      await seed(owner, { province, district: 'DistA', type: 'APARTMENT', dealType: 'SALE', price: 100, currency: 'USD' });
      await seed(owner, { province, district: 'DistA', type: 'LAND', dealType: 'SALE', price: 500, currency: 'USD' });
      await seed(owner, { province, district: 'DistB', type: 'LAND', dealType: 'RENT', price: 700, currency: 'USD' });
      await seed(owner, { province, district: 'DistB', type: 'LAND', dealType: 'SALE', price: 600, currency: 'AFGHANI' });
      await seed(owner, { province: 'Other', district: 'DistA', type: 'LAND', dealType: 'SALE', price: 500, currency: 'USD' });

      const ids = async (qs: string) =>
        (await ctx.get(`/properties?province=${encodeURIComponent(province)}&${qs}`).expect(200)).body.data.length;

      expect(await ids('')).toBe(4);
      expect(await ids('district=DistA')).toBe(2);
      expect(await ids('type=LAND')).toBe(3);
      expect(await ids('deal_type=RENT')).toBe(1);
      expect(await ids('type=LAND&deal_type=SALE&district=DistA')).toBe(1);
      // Price filters only compare within one currency.
      expect(await ids('min_price=200&currency=USD')).toBe(2);
      expect(await ids('min_price=200&max_price=600&currency=USD')).toBe(1);
      expect(await ids('max_price=600&currency=AFGHANI')).toBe(1);
    });

    it('filters by GARDEN_VILLA', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      await seed(owner, { province, type: 'GARDEN_VILLA' });
      await seed(owner, { province, type: 'LAND' });
      const res = await ctx.get(`/properties?province=${province}&type=GARDEN_VILLA`).expect(200);
      expect(res.body.data.map((p: { type: string }) => p.type)).toEqual(['GARDEN_VILLA']);
    });

    it('treats Arabic and Persian spellings of a place as the same place', async () => {
      const owner = await ctx.user();
      await ctx.post('/properties', propertyBody({ province: 'كابل', district: 'ده‌افغانان' }), owner.token).expect(201);
      const res = await ctx.get(`/properties?province=${encodeURIComponent('کابل')}`).expect(200);
      expect(res.body.data.some((p: { user_id: string }) => p.user_id === owner.id)).toBe(true);
    });

    it('only lists ACTIVE listings', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      await seed(owner, { province, status: 'ACTIVE' });
      await seed(owner, { province, status: 'SOLD' });
      await seed(owner, { province, status: 'ARCHIVED' });
      const res = await ctx.get(`/properties?province=${province}`).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('paginates with stable ordering and accurate totals', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      const base = Date.now();
      for (let i = 0; i < 5; i++) {
        await seed(owner, { province, title: `P${i}`, ladderedAt: new Date(base - i * 1000) });
      }
      const page = (n: number) => ctx.get(`/properties?province=${province}&limit=2&page=${n}`).expect(200);

      const [p1, p2, p3, p4] = [await page(1), await page(2), await page(3), await page(4)];
      expect(p1.body.meta).toEqual({ page: 1, limit: 2, total: 5, total_pages: 3 });
      expect(p1.body.data.map((p: { title: string }) => p.title)).toEqual(['P0', 'P1']);
      expect(p2.body.data.map((p: { title: string }) => p.title)).toEqual(['P2', 'P3']);
      expect(p3.body.data.map((p: { title: string }) => p.title)).toEqual(['P4']);
      expect(p4.body.data).toEqual([]);
      expect(p4.body.meta.total).toBe(5);
    });

    it('orders by ladder time, putting a laddered older listing first and legacy null rows last', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      const old = await seed(owner, { province, title: 'old', createdAt: new Date(Date.now() - 5 * 86_400_000), ladderedAt: new Date(Date.now() - 5 * 86_400_000) });
      await seed(owner, { province, title: 'new', ladderedAt: new Date(Date.now() - 1000) });
      await seed(owner, { province, title: 'legacy', ladderedAt: null });
      let titles = (await ctx.get(`/properties?province=${province}`).expect(200)).body.data.map((p: { title: string }) => p.title);
      expect(titles).toEqual(['new', 'old', 'legacy']);

      await ctx.prisma.property.update({ where: { id: old.id }, data: { ladderedAt: new Date() } });
      titles = (await ctx.get(`/properties?province=${province}`).expect(200)).body.data.map((p: { title: string }) => p.title);
      expect(titles).toEqual(['old', 'new', 'legacy']);
    });

    it('shows a featured badge only while the promotion is running', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      await seed(owner, { province, title: 'running', isFeatured: true, featuredUntil: new Date(Date.now() + 86_400_000) });
      await seed(owner, { province, title: 'expired', isFeatured: true, featuredUntil: new Date(Date.now() - 1000) });
      await seed(owner, { province, title: 'plain' });
      const res = await ctx.get(`/properties?province=${province}`).expect(200);
      const badge = Object.fromEntries(res.body.data.map((p: { title: string; is_featured: boolean }) => [p.title, p.is_featured]));
      expect(badge).toEqual({ running: true, expired: false, plain: false });
    });

    it.each([
      ['a price filter without a currency', 'min_price=100', 'currency'],
      ['min_price above max_price', 'min_price=500&max_price=100&currency=USD', 'min_price'],
      ['a page size over the maximum', 'limit=51', 'limit'],
      ['page 0', 'page=0', 'page'],
      ['a non-numeric price', 'min_price=abc&currency=USD', 'min_price'],
      ['hex numbers', 'limit=0x10', 'limit'],
      ['an unknown filter', 'provnce=Kabul', ''],
      ['an unknown type', 'type=VILLA', 'type'],
    ])('rejects %s', async (_label, qs, field) => {
      const res = await ctx.get(`/properties?${qs}`).expect(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    });
  });

  describe('GET /properties/:id', () => {
    it('returns an active listing publicly and still shows sold ones', async () => {
      const owner = await ctx.user();
      const active = await seed(owner);
      const sold = await seed(owner, { status: 'SOLD' });
      expect((await ctx.get(`/properties/${active.id}`).expect(200)).body.id).toBe(active.id);
      expect((await ctx.get(`/properties/${sold.id}`).expect(200)).body.status).toBe('SOLD');
    });
    it('hides archived listings, unknown ids and rejects malformed ids', async () => {
      const owner = await ctx.user();
      const archived = await seed(owner, { status: 'ARCHIVED' });
      await ctx.get(`/properties/${archived.id}`).expect(404);
      await ctx.get('/properties/00000000-0000-4000-8000-000000000000').expect(404);
      await ctx.get('/properties/not-a-uuid').expect(400);
    });
  });

  describe('GET /properties/:id/contact', () => {
    it('gives a signed-in user the owner name and phone, and the agency name for agency listings', async () => {
      const [viewer, owner] = [await ctx.user(), await ctx.user()];
      await ctx.prisma.user.update({ where: { id: owner.id }, data: { fullName: 'Ahmad Zia' } });
      const listing = await seed(owner);
      const res = await ctx.get(`/properties/${listing.id}/contact`, viewer.token).expect(200);
      expect(res.body).toEqual({ full_name: 'Ahmad Zia', phone_number: owner.phone, agency_name: null });

      const agency = await ctx.agency(true);
      const agencyListing = (await ctx.post('/properties', propertyBody(), agency.token).expect(201)).body;
      const res2 = await ctx.get(`/properties/${agencyListing.id}/contact`, viewer.token).expect(200);
      expect(res2.body).toMatchObject({ phone_number: agency.phone, agency_name: 'Test Agency' });
    });

    it('is not available anonymously, and never leaks into public listing responses', async () => {
      const owner = await ctx.user();
      const listing = await seed(owner);
      await ctx.get(`/properties/${listing.id}/contact`).expect(401);
      const detail = await ctx.get(`/properties/${listing.id}`).expect(200);
      expect(JSON.stringify(detail.body)).not.toContain(owner.phone);
      const list = await ctx.get(`/properties?province=${listing.province}&limit=5`).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(owner.phone);
    });

    it('hides archived and unknown listings and rejects malformed ids', async () => {
      const [viewer, owner] = [await ctx.user(), await ctx.user()];
      const archived = await seed(owner, { status: 'ARCHIVED' });
      await ctx.get(`/properties/${archived.id}/contact`, viewer.token).expect(404);
      await ctx.get('/properties/00000000-0000-4000-8000-000000000000/contact', viewer.token).expect(404);
      await ctx.get('/properties/nope/contact', viewer.token).expect(400);
    });
  });

  describe('GET /properties/mine', () => {
    it('lists only my listings, in every status, and needs a token', async () => {
      const [me, other] = [await ctx.user(), await ctx.user()];
      await seed(me, { status: 'ACTIVE' });
      await seed(me, { status: 'ARCHIVED' });
      await seed(other);
      await ctx.get('/properties/mine').expect(401);
      const res = await ctx.get('/properties/mine', me.token).expect(200);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.data.every((p: { user_id: string }) => p.user_id === me.id)).toBe(true);
    });
  });

  describe('PATCH /properties/:id', () => {
    it('lets the owner edit, leaving everything not sent untouched', async () => {
      const owner = await ctx.user();
      const created = (await ctx.post('/properties', propertyBody(), owner.token).expect(201)).body;
      const res = await ctx.patch(`/properties/${created.id}`, { title: 'New title', price: 90000.5, bedrooms: null }, owner.token).expect(200);

      expect(res.body).toMatchObject({ title: 'New title', price: 90000.5, bedrooms: null, bathrooms: 1 });
      // A PATCH must not reset fields it did not mention (images, ladder position, ...).
      expect(res.body.images).toEqual(created.images);
      expect(res.body.laddered_at).toBe(created.laddered_at);
    });

    it('lets the owner change a listing to GARDEN_VILLA', async () => {
      const owner = await ctx.user();
      const target = await seed(owner);
      const res = await ctx.patch(`/properties/${target.id}`, { type: 'GARDEN_VILLA' }, owner.token).expect(200);
      expect(res.body.type).toBe('GARDEN_VILLA');
    });

    it('lets the owner mark a listing sold, which removes it from search', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      const created = (await ctx.post('/properties', propertyBody({ province }), owner.token).expect(201)).body;
      await ctx.patch(`/properties/${created.id}`, { status: 'SOLD' }, owner.token).expect(200);
      expect((await ctx.get(`/properties?province=${province}`).expect(200)).body.data).toHaveLength(0);
    });

    it('forbids other users but allows an admin (checked against the database)', async () => {
      const [owner, stranger, admin] = [await ctx.user(), await ctx.user(), await ctx.user(Role.ADMIN)];
      const target = await seed(owner);
      await ctx.patch(`/properties/${target.id}`, { title: 'Hijack' }, stranger.token).expect(403);
      // A token that merely claims ADMIN is not enough.
      const forged = await ctx.tokenFor(stranger.id, Role.ADMIN);
      await ctx.patch(`/properties/${target.id}`, { title: 'Hijack' }, forged).expect(403);
      await ctx.patch(`/properties/${target.id}`, { title: 'Moderated' }, admin.token).expect(200);
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: target.id } })).title).toBe('Moderated');
    });

    it.each([
      ['an empty body', {}],
      ['lat without lng', { lat: 34.5 }],
      ['a field that cannot be edited', { user_id: '00000000-0000-4000-8000-000000000000' }],
      ['is_featured', { is_featured: true }],
      ['out-of-range coordinates', { lat: 10, lng: 10 }],
    ])('rejects %s', async (_label, body) => {
      const owner = await ctx.user();
      const target = await seed(owner);
      await ctx.patch(`/properties/${target.id}`, body, owner.token).expect(400);
    });

    it('needs a token and an existing listing', async () => {
      const owner = await ctx.user();
      const target = await seed(owner);
      await ctx.patch(`/properties/${target.id}`, { title: 'abc' }).expect(401);
      await ctx.patch('/properties/00000000-0000-4000-8000-000000000000', { title: 'abc' }, owner.token).expect(404);
    });
  });

  describe('DELETE /properties/:id', () => {
    it('archives instead of deleting, so history and payments stay intact', async () => {
      const owner = await ctx.user();
      const target = await seed(owner);
      await ctx.del(`/properties/${target.id}`, owner.token).expect(204);
      const row = await ctx.prisma.property.findUniqueOrThrow({ where: { id: target.id } });
      expect(row.status).toBe('ARCHIVED');
      await ctx.get(`/properties/${target.id}`).expect(404);
      await ctx.del(`/properties/${target.id}`, owner.token).expect(204); // repeating is harmless
    });

    it('forbids other users and anonymous callers', async () => {
      const [owner, stranger] = [await ctx.user(), await ctx.user()];
      const target = await seed(owner);
      await ctx.del(`/properties/${target.id}`).expect(401);
      await ctx.del(`/properties/${target.id}`, stranger.token).expect(403);
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('ACTIVE');
    });
  });
});
