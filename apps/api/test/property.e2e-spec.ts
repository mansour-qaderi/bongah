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

    it('accepts every property type, each as its own kind, and returns it unchanged', async () => {
      const admin = await ctx.user(Role.ADMIN); // no monthly cap, so one user can try every type
      for (const type of ['HOUSE_HAWILI', 'APARTMENT', 'SHOP', 'OFFICE', 'LAND', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER']) {
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

  describe('POST /properties: the welcome gift', () => {
    const credits = async (user: TestUser) => (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).welcomeListingCredits;
    const withGift = async () => {
      const user = await ctx.user();
      await ctx.prisma.user.update({ where: { id: user.id }, data: { welcomeListingCredits: 1 } });
      return user;
    };

    it('pays for the first listing, and the month\'s free listing is still there afterwards', async () => {
      const user = await withGift();
      const first = await ctx.post('/properties', propertyBody(), user.token).expect(201);
      expect(await credits(user)).toBe(0);
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: first.body.id } })).usedWelcomeCredit).toBe(true);

      const second = await ctx.post('/properties', propertyBody(), user.token).expect(201); // the monthly free one
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: second.body.id } })).usedWelcomeCredit).toBe(false);
      await ctx.post('/properties', propertyBody(), user.token).expect(403); // now both are used
    });

    it('is not spent by an invalid listing', async () => {
      const user = await withGift();
      await ctx.post('/properties', propertyBody({ price: -1 }), user.token).expect(400);
      expect(await credits(user)).toBe(1);
    });

    it('can only be spent once however many requests arrive together', async () => {
      const user = await withGift();
      const results = await Promise.all(Array.from({ length: 5 }, () => ctx.post('/properties', propertyBody(), user.token)));
      // One for the gift and one for the monthly free listing; the rest are refused.
      expect(results.map((r) => r.status).sort()).toEqual([201, 201, 403, 403, 403]);
      expect(await credits(user)).toBe(0);
      expect(await ctx.prisma.property.count({ where: { userId: user.id, usedWelcomeCredit: true } })).toBe(1);
    });

    it('does not make a user with no gift any different', async () => {
      const user = await ctx.user();
      await ctx.post('/properties', propertyBody(), user.token).expect(201);
      await ctx.post('/properties', propertyBody(), user.token).expect(403);
      expect(await credits(user)).toBe(0);
    });

    it('is left alone for an admin, who has no limit to pay for', async () => {
      const admin = await ctx.user(Role.ADMIN);
      await ctx.prisma.user.update({ where: { id: admin.id }, data: { welcomeListingCredits: 1 } });
      for (let i = 0; i < 4; i++) await ctx.post('/properties', propertyBody(), admin.token).expect(201);
      expect(await credits(admin)).toBe(1);
    });

    it('is shown to the app on the user\'s own profile', async () => {
      const user = await withGift();
      const me = await ctx.get('/users/me', user.token).expect(200);
      expect(me.body.welcome_listing_credits).toBe(1);
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
      await bad({ type: 'CASTLE' }, 'type');
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

    it('filters by several types at once (types=A,B), and still by the single older `type`', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      await seed(owner, { province, type: 'APARTMENT' });
      await seed(owner, { province, type: 'HOUSE_HAWILI' });
      await seed(owner, { province, type: 'LAND' });
      const kinds = async (qs: string) =>
        (await ctx.get(`/properties?province=${province}&${qs}`).expect(200)).body.data
          .map((p: { type: string }) => p.type)
          .sort();
      expect(await kinds('types=APARTMENT,HOUSE_HAWILI')).toEqual(['APARTMENT', 'HOUSE_HAWILI']);
      expect(await kinds('types=LAND')).toEqual(['LAND']);
      expect(await kinds('type=LAND')).toEqual(['LAND']);
      await ctx.get(`/properties?province=${province}&types=APARTMENT,CASTLE`).expect(400);
      await ctx.get(`/properties?province=${province}&type=LAND&types=LAND`).expect(400);
    });

    it('filters by GARAGE, and by each of the types that used to be paired', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      const kinds = ['SHOP', 'OFFICE', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER'];
      for (const type of kinds) await seed(owner, { province, type });
      await seed(owner, { province, type: 'LAND' });
      for (const type of kinds) {
        const res = await ctx.get(`/properties?province=${province}&type=${type}`).expect(200);
        expect(res.body.data.map((p: { type: string }) => p.type)).toEqual([type]);
      }
      // The old combined names are gone.
      await ctx.get(`/properties?province=${province}&type=OFFICE_SHOP`).expect(400);
      await ctx.get(`/properties?province=${province}&type=GARDEN_VILLA`).expect(400);
      await ctx.get(`/properties?province=${province}&type=GARAGE_OTHER`).expect(400);
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
      ['an unknown type', 'type=CASTLE', 'type'],
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
    it('keeps the number locked until the user unlocks it, then gives the owner name, phone and agency name', async () => {
      const [viewer, owner] = [await ctx.user(), await ctx.user()];
      await ctx.prisma.user.update({ where: { id: owner.id }, data: { fullName: 'Ahmad Zia' } });
      const listing = await seed(owner);

      const locked = await ctx.get(`/properties/${listing.id}/contact`, viewer.token).expect(200);
      expect(locked.body).toMatchObject({ unlocked: false, contact: null });
      expect(JSON.stringify(locked.body)).not.toContain(owner.phone);

      const res = await ctx.post(`/properties/${listing.id}/contact/unlock`, {}, viewer.token).expect(200);
      expect(res.body.contact).toEqual({ full_name: 'Ahmad Zia', phone_number: owner.phone, agency_name: null });

      const agency = await ctx.agency(true);
      const agencyListing = (await ctx.post('/properties', propertyBody(), agency.token).expect(201)).body;
      const res2 = await ctx.post(`/properties/${agencyListing.id}/contact/unlock`, {}, viewer.token).expect(200);
      expect(res2.body.contact).toMatchObject({ phone_number: agency.phone, agency_name: 'Test Agency' });
    });

    it('is not available anonymously, and never leaks into public listing responses', async () => {
      const owner = await ctx.user();
      const listing = await seed(owner);
      await ctx.get(`/properties/${listing.id}/contact`).expect(401);
      await ctx.post(`/properties/${listing.id}/contact/unlock`, {}).expect(401);
      const detail = await ctx.get(`/properties/${listing.id}`).expect(200);
      expect(JSON.stringify(detail.body)).not.toContain(owner.phone);
      const list = await ctx.get(`/properties?province=${listing.province}&limit=5`).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(owner.phone);
    });

    it('hides archived and unknown listings and rejects malformed ids', async () => {
      const [viewer, owner] = [await ctx.user(), await ctx.user()];
      const archived = await seed(owner, { status: 'ARCHIVED' });
      await ctx.get(`/properties/${archived.id}/contact`, viewer.token).expect(404);
      await ctx.post(`/properties/${archived.id}/contact/unlock`, {}, viewer.token).expect(404);
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

    it('lets the owner change a listing to VILLA', async () => {
      const owner = await ctx.user();
      const target = await seed(owner);
      const res = await ctx.patch(`/properties/${target.id}`, { type: 'VILLA' }, owner.token).expect(200);
      expect(res.body.type).toBe('VILLA');
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

  describe('the unit of a property', () => {
    it('is stored and returned as the owner wrote it, and is null when none is given', async () => {
      const admin = await ctx.user(Role.ADMIN);
      const plain = await ctx.post('/properties', propertyBody(), admin.token).expect(201);
      expect(plain.body.unit).toBeNull();
      expect(plain.body).not.toHaveProperty('unit_type');

      const third = await ctx.post('/properties', propertyBody({ unit: '  واحد   ۳ ' }), admin.token).expect(201);
      expect(third.body.unit).toBe('واحد ۳');
      const stored = await ctx.prisma.property.findUniqueOrThrow({ where: { id: third.body.id } });
      expect(stored.unit).toBe('واحد ۳');
      expect((await ctx.get(`/properties/${third.body.id}`).expect(200)).body.unit).toBe('واحد ۳');
    });

    it('stores a blank unit as null, and refuses one that is too long or the old unit_type', async () => {
      const admin = await ctx.user(Role.ADMIN);
      const blank = await ctx.post('/properties', propertyBody({ unit: '   ' }), admin.token).expect(201);
      expect(blank.body.unit).toBeNull();
      await ctx.post('/properties', propertyBody({ unit: 'x'.repeat(41) }), admin.token).expect(400);
      await ctx.post('/properties', propertyBody({ unit_type: 'DUPLEX' }), admin.token).expect(400);
    });

    it('lets the owner set, change and clear it', async () => {
      const owner = await ctx.user();
      const target = await seed(owner, { type: 'APARTMENT' });
      const set = await ctx.patch(`/properties/${target.id}`, { unit: 'واحد ۲' }, owner.token).expect(200);
      expect(set.body.unit).toBe('واحد ۲');
      const changed = await ctx.patch(`/properties/${target.id}`, { unit: 'طبقه سوم' }, owner.token).expect(200);
      expect(changed.body.unit).toBe('طبقه سوم');
      const cleared = await ctx.patch(`/properties/${target.id}`, { unit: null }, owner.token).expect(200);
      expect(cleared.body.unit).toBeNull();
      const again = await ctx.patch(`/properties/${target.id}`, { unit: 'واحد ۲' }, owner.token).expect(200);
      const blank = await ctx.patch(`/properties/${target.id}`, { unit: '' }, owner.token).expect(200);
      expect(again.body.unit).toBe('واحد ۲');
      expect(blank.body.unit).toBeNull();
    });

    it('is kept when something else is edited, including the type', async () => {
      const owner = await ctx.user();
      const target = await seed(owner, { type: 'APARTMENT', unit: 'واحد ۵' });
      const res = await ctx.patch(`/properties/${target.id}`, { type: 'OFFICE', title: 'Now an office' }, owner.token).expect(200);
      expect(res.body).toMatchObject({ type: 'OFFICE', unit: 'واحد ۵' });
    });
  });

  describe('the mortgage duration and the price terms', () => {
    it('are null when not given and returned as the owner sent them', async () => {
      const admin = await ctx.user(Role.ADMIN);
      const plain = await ctx.post('/properties', propertyBody(), admin.token).expect(201);
      expect(plain.body).toMatchObject({ mortgage_months: null, price_terms: null });

      const mortgage = await ctx
        .post('/properties', propertyBody({ deal_type: 'MORTGAGE_GROWI', mortgage_months: 24, price_terms: 'NEGOTIABLE' }), admin.token)
        .expect(201);
      expect(mortgage.body).toMatchObject({ deal_type: 'MORTGAGE_GROWI', mortgage_months: 24, price_terms: 'NEGOTIABLE' });
      const stored = await ctx.prisma.property.findUniqueOrThrow({ where: { id: mortgage.body.id } });
      expect(stored).toMatchObject({ mortgageMonths: 24, priceTerms: 'NEGOTIABLE' });
      expect((await ctx.get(`/properties/${mortgage.body.id}`).expect(200)).body).toMatchObject({ mortgage_months: 24 });

      const rent = await ctx.post('/properties', propertyBody({ deal_type: 'RENT', price_terms: 'FIXED' }), admin.token).expect(201);
      expect(rent.body).toMatchObject({ mortgage_months: null, price_terms: 'FIXED' });
    });

    it('refuse a duration on a sale or rent, a zero or absurd duration and an unknown term', async () => {
      const admin = await ctx.user(Role.ADMIN);
      await ctx.post('/properties', propertyBody({ deal_type: 'SALE', mortgage_months: 12 }), admin.token).expect(400);
      await ctx.post('/properties', propertyBody({ deal_type: 'RENT', mortgage_months: 12 }), admin.token).expect(400);
      const mortgage = { deal_type: 'MORTGAGE_GROWI' };
      await ctx.post('/properties', propertyBody({ ...mortgage, mortgage_months: 0 }), admin.token).expect(400);
      await ctx.post('/properties', propertyBody({ ...mortgage, mortgage_months: 601 }), admin.token).expect(400);
      await ctx.post('/properties', propertyBody({ ...mortgage, mortgage_months: 1.5 }), admin.token).expect(400);
      await ctx.post('/properties', propertyBody({ ...mortgage, price_terms: 'HALF' }), admin.token).expect(400);
      // A mortgage may leave the duration out.
      await ctx.post('/properties', propertyBody(mortgage), admin.token).expect(201);
    });

    it('can be set, changed and cleared by the owner', async () => {
      const owner = await ctx.user();
      const target = await seed(owner, { dealType: 'MORTGAGE_GROWI' });
      const set = await ctx.patch(`/properties/${target.id}`, { mortgage_months: 12, price_terms: 'FIXED' }, owner.token).expect(200);
      expect(set.body).toMatchObject({ mortgage_months: 12, price_terms: 'FIXED' });
      const changed = await ctx.patch(`/properties/${target.id}`, { mortgage_months: 36, price_terms: 'NEGOTIABLE' }, owner.token).expect(200);
      expect(changed.body).toMatchObject({ mortgage_months: 36, price_terms: 'NEGOTIABLE' });
      const cleared = await ctx.patch(`/properties/${target.id}`, { mortgage_months: null, price_terms: null }, owner.token).expect(200);
      expect(cleared.body).toMatchObject({ mortgage_months: null, price_terms: null });
    });

    it('are kept when something else is edited', async () => {
      const owner = await ctx.user();
      const target = await seed(owner, { dealType: 'MORTGAGE_GROWI', mortgageMonths: 18, priceTerms: 'FIXED' });
      const res = await ctx.patch(`/properties/${target.id}`, { title: 'Renamed' }, owner.token).expect(200);
      expect(res.body).toMatchObject({ mortgage_months: 18, price_terms: 'FIXED' });
    });

    it('drop the duration when the listing moves to another deal, and refuse one for a deal that has none', async () => {
      const owner = await ctx.user();
      const target = await seed(owner, { dealType: 'MORTGAGE_GROWI', mortgageMonths: 18, priceTerms: 'NEGOTIABLE' });
      const moved = await ctx.patch(`/properties/${target.id}`, { deal_type: 'RENT' }, owner.token).expect(200);
      expect(moved.body).toMatchObject({ deal_type: 'RENT', mortgage_months: null, price_terms: 'NEGOTIABLE' });

      // Now a rent: a duration alone is refused (the stored deal decides), and so is one sent with the rent.
      await ctx.patch(`/properties/${target.id}`, { mortgage_months: 12 }, owner.token).expect(400);
      await ctx.patch(`/properties/${target.id}`, { deal_type: 'SALE', mortgage_months: 12 }, owner.token).expect(400);
      // The way back to a mortgage carries its duration.
      const back = await ctx.patch(`/properties/${target.id}`, { deal_type: 'MORTGAGE_GROWI', mortgage_months: 6 }, owner.token).expect(200);
      expect(back.body).toMatchObject({ deal_type: 'MORTGAGE_GROWI', mortgage_months: 6 });
      // Clearing a duration on a rent is not an error.
      await ctx.patch(`/properties/${target.id}`, { deal_type: 'SALE', mortgage_months: null }, owner.token).expect(200);
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
