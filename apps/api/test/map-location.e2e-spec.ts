import { Role } from '../src/generated/prisma/client.js';
import { hasDb, PIN, propertyBody, TestContext, type TestUser } from './helpers.js';

const OTHER_PIN = { lat: 34.61, lng: 69.22 };

describe.skipIf(!hasDb)('Map location rules (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** A listing inserted directly (bypassing quota), with NO pin unless overridden. */
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
        ...overrides,
      },
    });
  const pin = (user: TestUser, propertyId: string, coords: object = PIN) =>
    ctx.patch(`/properties/${propertyId}`, coords, user.token);
  const tokens = (userId: string) => ctx.prisma.mapLocationToken.findMany({ where: { userId } });
  const unspent = async (userId: string) => (await tokens(userId)).filter((t) => t.consumedAt === null).length;
  const row = (id: string) => ctx.prisma.property.findUniqueOrThrow({ where: { id } });

  describe('creating a listing', () => {
    it('lets a regular user publish with a written place and no pin', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', propertyBody(), user.token).expect(201);
      expect(res.body).toMatchObject({
        province: 'Kabul',
        district: 'Shar-e-Naw',
        neighborhood: 'Qala-e-Fathullah',
        lat: null,
        lng: null,
      });
    });

    it('requires the written address while there is no pin (district and neighbourhood are optional)', async () => {
      const user = await ctx.user();
      const res = await ctx
        .post('/properties', propertyBody({ district: undefined, neighborhood: undefined, address: undefined }), user.token)
        .expect(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(['address']);
    });

    it('lets a regular user with no token pin a listing: the pin is free', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(201);
      expect(res.body).toMatchObject(PIN);
      expect(await tokens(user.id)).toHaveLength(0);
    });

    it('makes the written place optional once there is a pin, and stores what was left out as empty', async () => {
      const user = await ctx.user();
      const res = await ctx
        .post(
          '/properties',
          propertyBody({ ...PIN, district: undefined, neighborhood: undefined, address: undefined }),
          user.token,
        )
        .expect(201);
      expect(res.body).toMatchObject({ ...PIN, district: '', neighborhood: null, address: '' });
      const stored = await row(res.body.id);
      expect([stored.district, stored.neighborhood, stored.address]).toEqual(['', null, '']);
    });

    it('requires a description with or without a pin, and stores it as written', async () => {
      const user = await ctx.user(Role.ADMIN);
      for (const body of [propertyBody({ description: undefined }), propertyBody({ ...PIN, description: undefined })]) {
        const res = await ctx.post('/properties', body, user.token).expect(400);
        expect(JSON.stringify(res.body)).toContain('description');
      }
      await ctx.post('/properties', propertyBody({ description: '   ' }), user.token).expect(400);
      const ok = await ctx.post('/properties', propertyBody({ description: 'خانه دو منزله\nنزدیک بازار' }), user.token).expect(201);
      expect(ok.body.description).toBe('خانه دو منزله\nنزدیک بازار');
    });

    it('does not spend a token an account happens to hold', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 2);
      await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(201);
      expect(await unspent(user.id)).toBe(2);
    });

    it('still counts a pinned listing against the free monthly limit', async () => {
      const user = await ctx.user();
      await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(201);
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(403);
      expect(res.body.code).toBe('FREE_LISTING_LIMIT_REACHED');
    });

    it('rejects half a pin and out-of-range pins', async () => {
      const user = await ctx.user();
      await ctx.post('/properties', propertyBody({ lat: 34.5 }), user.token).expect(400);
      await ctx.post('/properties', propertyBody({ lng: 69.1 }), user.token).expect(400);
      await ctx.post('/properties', propertyBody({ lat: null, lng: null }), user.token).expect(400);
      await ctx.post('/properties', propertyBody({ lat: 51.5, lng: -0.1 }), user.token).expect(400);
      expect(await ctx.prisma.property.count({ where: { userId: user.id } })).toBe(0);
    });

    it('lets an agency with an active subscription pin every listing', async () => {
      const agency = await ctx.agency(true);
      for (let i = 0; i < 3; i += 1) {
        const res = await ctx.post('/properties', propertyBody({ ...PIN }), agency.token).expect(201);
        expect(res.body).toMatchObject({ ...PIN, agency_id: agency.agencyId });
      }
      expect(await tokens(agency.id)).toHaveLength(0);
    });

    it('lets an admin pin', async () => {
      const admin = await ctx.user(Role.ADMIN);
      await ctx.post('/properties', propertyBody({ ...PIN }), admin.token).expect(201);
    });

    it('still gives an agency whose subscription lapsed no new listings at all', async () => {
      const lapsed = await ctx.lapsedAgency();
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), lapsed.token).expect(403);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    });
  });

  describe('adding or moving a pin on an existing listing', () => {
    it('lets the owner add the first pin without any token', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      const res = await pin(user, target.id).expect(200);
      expect(res.body).toMatchObject(PIN);
      expect((await row(target.id)).lat).toBe(PIN.lat);
      expect(await tokens(user.id)).toHaveLength(0);
    });

    it('lets the owner move a pin as often as they like', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      await pin(user, target.id).expect(200);
      const res = await pin(user, target.id, OTHER_PIN).expect(200);
      expect(res.body).toMatchObject(OTHER_PIN);
    });

    it('spends no token on any pin, even when the account holds some', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 1);
      const [a, b] = [await seed(user), await seed(user)];
      await pin(user, a.id).expect(200);
      await pin(user, b.id).expect(200);
      expect(await unspent(user.id)).toBe(1);
    });

    it('lets edits race for the same listing without trouble', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      const results = await Promise.all(
        Array.from({ length: 8 }, (_v, i) => pin(user, target.id, { lat: 34.5 + i / 100, lng: 69.1 })),
      );
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    });

    it('lets a subscribed agency, a lapsed one and an admin pin their own or others\' listings by the usual ownership rules', async () => {
      const agency = await ctx.agency(true);
      const own = await seed(agency);
      await pin(agency, own.id).expect(200);

      const lapsed = await ctx.lapsedAgency();
      const lapsedOwn = await seed(lapsed);
      await pin(lapsed, lapsedOwn.id).expect(200); // editing what they already have is not gated by the pin

      const [owner, admin] = [await ctx.user(), await ctx.user(Role.ADMIN)];
      const target = await seed(owner);
      await pin(admin, target.id).expect(200);
    });

    it('never lets a stranger pin someone else\'s listing', async () => {
      const [owner, stranger] = [await ctx.user(), await ctx.user()];
      const target = await seed(owner);
      const res = await pin(stranger, target.id).expect(403);
      expect(res.body.code).toBeUndefined(); // "not yours"
      expect((await row(target.id)).lat).toBeNull();
    });

    it('does not need anything special for edits that leave the pin alone', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      await ctx.patch(`/properties/${target.id}`, { title: 'New title', neighborhood: 'Taimani' }, user.token).expect(200);
      expect((await row(target.id)).neighborhood).toBe('Taimani');
    });

    it('cannot clear a pin by sending null', async () => {
      const user = await ctx.user();
      const target = await seed(user, { ...PIN });
      await ctx.patch(`/properties/${target.id}`, { lat: null, lng: null }, user.token).expect(400);
    });
  });

  describe('listing search', () => {
    it('filters to pinned or unpinned listings with has_location', async () => {
      const user = await ctx.user();
      const province = `Prov-${Math.random().toString(36).slice(2, 10)}`;
      const pinned = await seed(user, { province, ...PIN });
      const plain = await seed(user, { province });

      const ids = async (query: string) =>
        (await ctx.get(`/properties?province=${province}${query}`).expect(200)).body.data.map((p: { id: string }) => p.id);
      expect((await ids('')).sort()).toEqual([pinned.id, plain.id].sort());
      expect(await ids('&has_location=true')).toEqual([pinned.id]);
      expect(await ids('&has_location=false')).toEqual([plain.id]);
      await ctx.get(`/properties?province=${province}&has_location=maybe`).expect(400);
    });
  });

  describe('GET /map-location/status', () => {
    it('needs a token', async () => {
      await ctx.get('/map-location/status').expect(401);
    });

    it('reports a regular user\'s balance of prepaid pins bought before pinning became free', async () => {
      const user = await ctx.user();
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body).toEqual({
        unlimited: false,
        unlimited_reason: null,
        tokens_available: 0,
      });
      await ctx.giveTokens(user.id, 2);
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body.tokens_available).toBe(2);
      // Pinning is free now: it leaves a balance bought earlier untouched.
      await pin(user, (await seed(user)).id).expect(200);
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body.tokens_available).toBe(2);
    });

    it('reports unlimited for a subscribed agency and for an admin', async () => {
      const [agency, admin] = [await ctx.agency(true), await ctx.user(Role.ADMIN)];
      expect((await ctx.get('/map-location/status', agency.token).expect(200)).body).toMatchObject({
        unlimited: true,
        unlimited_reason: 'AGENCY_SUBSCRIPTION',
      });
      expect((await ctx.get('/map-location/status', admin.token).expect(200)).body).toMatchObject({
        unlimited: true,
        unlimited_reason: 'ADMIN',
      });
    });

    it('does not report unlimited for an agency without a running subscription', async () => {
      for (const agency of [await ctx.lapsedAgency(), await ctx.agency(false)]) {
        expect((await ctx.get('/map-location/status', agency.token).expect(200)).body.unlimited).toBe(false);
      }
    });
  });

  describe('PUT /agencies/me/location (office pin)', () => {
    const put = (user: TestUser, body: object = PIN) =>
      ctx.put('/agencies/me/location', body, user.token);

    it('needs a token', async () => {
      await ctx.put('/agencies/me/location', PIN).expect(401);
    });

    it('is included in an active subscription, can be moved, and is returned in the agency shape', async () => {
      const agency = await ctx.agency(true);
      const res = await put(agency).expect(200);
      expect(res.body).toMatchObject({ id: agency.agencyId, ...PIN });
      expect((await put(agency, OTHER_PIN).expect(200)).body).toMatchObject(OTHER_PIN);
      const stored = await ctx.prisma.agency.findUniqueOrThrow({ where: { id: agency.agencyId } });
      expect({ lat: stored.lat, lng: stored.lng }).toEqual(OTHER_PIN);
      expect(await tokens(agency.id)).toHaveLength(0);
    });

    it('needs an active subscription: none, or a lapsed one', async () => {
      for (const agency of [await ctx.agency(false), await ctx.lapsedAgency()]) {
        const res = await put(agency).expect(403);
        expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
        const stored = await ctx.prisma.agency.findUniqueOrThrow({ where: { id: agency.agencyId } });
        expect(stored.lat).toBeNull();
      }
    });

    it('is not something a prepaid token can buy', async () => {
      const agency = await ctx.agency(false);
      await ctx.giveTokens(agency.id, 1);
      await put(agency).expect(403);
      expect(await unspent(agency.id)).toBe(1);
    });

    it('is for agencies only', async () => {
      const user = await ctx.user();
      const res = await put(user).expect(404);
      expect(res.body.code).toBe('AGENCY_PROFILE_REQUIRED');
    });

    it('validates the pin and rejects anything else in the body', async () => {
      const agency = await ctx.agency(true);
      await put(agency, { lat: 34.5 }).expect(400);
      await put(agency, { lat: 51.5, lng: -0.1 }).expect(400);
      await put(agency, { ...PIN, agency_id: agency.agencyId }).expect(400);
    });
  });

  describe('database guarantees (what holds even if the application is wrong)', () => {
    it('never stores half a pin', async () => {
      const user = await ctx.user();
      await expect(seed(user, { lat: 34.5 })).rejects.toThrow();
      await expect(seed(user, { lng: 69.1 })).rejects.toThrow();
      const agency = await ctx.agency(false);
      await expect(ctx.prisma.agency.update({ where: { id: agency.agencyId }, data: { lat: 34.5 } })).rejects.toThrow();
    });

    it('keeps "spent" and "which listing" together', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      await expect(
        ctx.prisma.mapLocationToken.create({ data: { userId: user.id, source: 'ADMIN_GRANT', consumedAt: new Date() } }),
      ).rejects.toThrow();
      await expect(
        ctx.prisma.mapLocationToken.create({ data: { userId: user.id, source: 'ADMIN_GRANT', propertyId: target.id } }),
      ).rejects.toThrow();
    });

    it('lets a listing consume at most one token', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      const spent = { userId: user.id, source: 'ADMIN_GRANT' as const, propertyId: target.id, consumedAt: new Date() };
      await ctx.prisma.mapLocationToken.create({ data: spent });
      await expect(ctx.prisma.mapLocationToken.create({ data: spent })).rejects.toThrow();
    });

    it('ties purchased tokens to a payment, and only purchased ones', async () => {
      const user = await ctx.user();
      await expect(
        ctx.prisma.mapLocationToken.create({ data: { userId: user.id, source: 'PURCHASE' } }),
      ).rejects.toThrow();
      const payment = await ctx.prisma.transaction.create({
        data: { userId: user.id, amount: 30, currency: 'AFGHANI', hesabpayTxId: `t-${Date.now()}-${Math.random()}`, purpose: 'MAP_LOCATION' },
      });
      await expect(
        ctx.prisma.mapLocationToken.create({ data: { userId: user.id, source: 'REFERRAL', transactionId: payment.id } }),
      ).rejects.toThrow();
      await ctx.prisma.mapLocationToken.create({ data: { userId: user.id, source: 'PURCHASE', transactionId: payment.id } });
      await expect(
        ctx.prisma.mapLocationToken.create({ data: { userId: user.id, source: 'PURCHASE', transactionId: payment.id } }),
      ).rejects.toThrow(); // one payment, one token
    });
  });
});
