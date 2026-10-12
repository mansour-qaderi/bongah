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
    it('lets a regular user publish with province, district and neighborhood but no pin', async () => {
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

    it('requires the neighborhood', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', propertyBody({ neighborhood: undefined }), user.token).expect(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain('neighborhood');
    });

    it('refuses a pin from a regular user with no token, with a code the app can act on', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(403);
      expect(res.body.code).toBe('MAP_LOCATION_REQUIRED');
    });

    it('publishes nothing and uses up no free listing when the pin is refused', async () => {
      const user = await ctx.user();
      await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(403);
      expect(await ctx.prisma.property.count({ where: { userId: user.id } })).toBe(0);
      // The month's free listing is still there.
      await ctx.post('/properties', propertyBody(), user.token).expect(201);
    });

    it('spends one token for a pinned listing and records which listing it went to', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 2);
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(201);

      expect(res.body).toMatchObject(PIN);
      const spent = (await tokens(user.id)).filter((t) => t.consumedAt !== null);
      expect(spent).toHaveLength(1);
      expect(spent[0].propertyId).toBe(res.body.id);
      expect(await unspent(user.id)).toBe(1);
    });

    it('spends no token on a listing without a pin', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 1);
      await ctx.post('/properties', propertyBody(), user.token).expect(201);
      expect(await unspent(user.id)).toBe(1);
    });

    it('does not spend the token when the free monthly limit stops the listing', async () => {
      const user = await ctx.user();
      await ctx.post('/properties', propertyBody(), user.token).expect(201);
      await ctx.giveTokens(user.id, 1);
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(403);
      expect(res.body.code).toBe('FREE_LISTING_LIMIT_REACHED');
      expect(await unspent(user.id)).toBe(1);
    });

    it('rejects half a pin and out-of-range pins before any entitlement check', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 1);
      await ctx.post('/properties', propertyBody({ lat: 34.5 }), user.token).expect(400);
      await ctx.post('/properties', propertyBody({ lng: 69.1 }), user.token).expect(400);
      await ctx.post('/properties', propertyBody({ lat: null, lng: null }), user.token).expect(400);
      await ctx.post('/properties', propertyBody({ lat: 51.5, lng: -0.1 }), user.token).expect(400);
      expect(await unspent(user.id)).toBe(1);
    });

    it('lets an agency with an active subscription pin every listing, without tokens', async () => {
      const agency = await ctx.agency(true);
      for (let i = 0; i < 3; i += 1) {
        const res = await ctx.post('/properties', propertyBody({ ...PIN }), agency.token).expect(201);
        expect(res.body).toMatchObject({ ...PIN, agency_id: agency.agencyId });
      }
      expect(await tokens(agency.id)).toHaveLength(0);
    });

    it('does not use up an agency\'s prepaid tokens', async () => {
      const agency = await ctx.agency(true);
      await ctx.giveTokens(agency.id, 1);
      await ctx.post('/properties', propertyBody({ ...PIN }), agency.token).expect(201);
      expect(await unspent(agency.id)).toBe(1);
    });

    it('lets an admin pin without tokens', async () => {
      const admin = await ctx.user(Role.ADMIN);
      await ctx.post('/properties', propertyBody({ ...PIN }), admin.token).expect(201);
    });

    it('treats an agency whose subscription lapsed like a regular user: no new listings at all', async () => {
      const lapsed = await ctx.lapsedAgency();
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), lapsed.token).expect(403);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('decides from the database, not from the role in the token', async () => {
      const user = await ctx.user();
      const forged = await ctx.tokenFor(user.id, Role.ADMIN);
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), forged).expect(403);
      expect(res.body.code).toBe('MAP_LOCATION_REQUIRED');
    });
  });

  describe('adding or moving a pin on an existing listing', () => {
    it('needs a token for the first pin and spends exactly one', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      expect((await pin(user, target.id).expect(403)).body.code).toBe('MAP_LOCATION_REQUIRED');
      expect((await row(target.id)).lat).toBeNull();

      await ctx.giveTokens(user.id, 1);
      const res = await pin(user, target.id).expect(200);
      expect(res.body).toMatchObject(PIN);
      expect(await unspent(user.id)).toBe(0);
      expect((await tokens(user.id))[0].propertyId).toBe(target.id);
    });

    it('lets the owner move a pin that is already there for free', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 1);
      const target = await seed(user);
      await pin(user, target.id).expect(200);
      expect(await unspent(user.id)).toBe(0);

      const res = await pin(user, target.id, OTHER_PIN).expect(200);
      expect(res.body).toMatchObject(OTHER_PIN);
      expect(await tokens(user.id)).toHaveLength(1); // nothing extra spent or created
    });

    it('lets a listing that already had a pin before this feature be moved for free', async () => {
      const user = await ctx.user();
      const target = await seed(user, { ...PIN });
      await pin(user, target.id, OTHER_PIN).expect(200);
    });

    it('does not need a token for edits that leave the pin alone', async () => {
      const user = await ctx.user();
      const target = await seed(user);
      await ctx.patch(`/properties/${target.id}`, { title: 'New title', neighborhood: 'Taimani' }, user.token).expect(200);
      expect((await row(target.id)).neighborhood).toBe('Taimani');
    });

    it('spends one token per listing', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 1);
      const [a, b] = [await seed(user), await seed(user)];
      await pin(user, a.id).expect(200);
      expect((await pin(user, b.id).expect(403)).body.code).toBe('MAP_LOCATION_REQUIRED');
      expect((await row(b.id)).lat).toBeNull();
    });

    it('spends the oldest token first', async () => {
      const user = await ctx.user();
      await ctx.prisma.mapLocationToken.create({
        data: { userId: user.id, source: 'REFERRAL', createdAt: new Date(Date.now() - 86_400_000) },
      });
      await ctx.giveTokens(user.id, 1);
      const target = await seed(user);
      await pin(user, target.id).expect(200);
      expect((await tokens(user.id)).find((t) => t.consumedAt)!.source).toBe('REFERRAL');
    });

    it('spends ONE token however many edits race for the same listing', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 3);
      const target = await seed(user);

      // Hold the listing's row lock while the edits arrive, so they all start at the same moment
      // instead of happening to run one after another.
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const holder = ctx.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM properties WHERE id = ${target.id}::uuid FOR UPDATE`;
          await sleep(500);
        },
        { timeout: 10_000 },
      );
      await sleep(100);
      const results = await Promise.all(
        Array.from({ length: 8 }, (_v, i) => pin(user, target.id, { lat: 34.5 + i / 100, lng: 69.1 })),
      );
      await holder;

      expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(await unspent(user.id)).toBe(2);
    });

    it('lets only as many listings be pinned at once as there are tokens', async () => {
      const user = await ctx.user();
      await ctx.giveTokens(user.id, 2);
      const listings = await Promise.all(Array.from({ length: 5 }, () => seed(user)));
      const results = await Promise.all(listings.map((l) => pin(user, l.id)));

      expect(results.filter((r) => r.status === 200)).toHaveLength(2);
      expect(results.filter((r) => r.status === 403).every((r) => r.body.code === 'MAP_LOCATION_REQUIRED')).toBe(true);
      expect(await unspent(user.id)).toBe(0);
      const pinned = await ctx.prisma.property.count({ where: { userId: user.id, lat: { not: null } } });
      expect(pinned).toBe(2);
    });

    it('lets a subscribed agency pin and move freely, but not once the subscription lapses', async () => {
      const agency = await ctx.agency(true);
      const target = await seed(agency);
      await pin(agency, target.id).expect(200);
      await pin(agency, target.id, OTHER_PIN).expect(200);
      expect(await tokens(agency.id)).toHaveLength(0);

      const lapsed = await ctx.lapsedAgency();
      const unpinned = await seed(lapsed);
      expect((await pin(lapsed, unpinned.id).expect(403)).body.code).toBe('MAP_LOCATION_REQUIRED');
      // ...but a token still works for them.
      await ctx.giveTokens(lapsed.id, 1);
      await pin(lapsed, unpinned.id).expect(200);
    });

    it('lets an admin pin someone else\'s listing without touching the owner\'s tokens', async () => {
      const [owner, admin] = [await ctx.user(), await ctx.user(Role.ADMIN)];
      await ctx.giveTokens(owner.id, 1);
      const target = await seed(owner);
      await pin(admin, target.id).expect(200);
      expect(await unspent(owner.id)).toBe(1);
      expect(await tokens(admin.id)).toHaveLength(0);
    });

    it('never lets a stranger pin (or spend tokens on) someone else\'s listing', async () => {
      const [owner, stranger] = [await ctx.user(), await ctx.user()];
      await ctx.giveTokens(stranger.id, 1);
      const target = await seed(owner);
      const res = await pin(stranger, target.id).expect(403);
      expect(res.body.code).toBeUndefined(); // "not yours", not "buy the add-on"
      expect(await unspent(stranger.id)).toBe(1);
      expect((await row(target.id)).lat).toBeNull();
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

    it('reports a regular user\'s prepaid pins', async () => {
      const user = await ctx.user();
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body).toEqual({
        unlimited: false,
        unlimited_reason: null,
        tokens_available: 0,
      });
      await ctx.giveTokens(user.id, 2);
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body.tokens_available).toBe(2);
      await pin(user, (await seed(user)).id).expect(200);
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body.tokens_available).toBe(1);
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
