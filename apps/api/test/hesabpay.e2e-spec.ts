import { BadGatewayException } from '@nestjs/common';
import { SUBSCRIPTION_PLAN_BENEFITS } from '@bongah/shared-types';
import request from 'supertest';
import { HesabPayGateway } from '../src/hesabpay/gateway/hesabpay-gateway.js';
import { hasDb, PIN, propertyBody, signWebhook, TestContext, uniqueProvince, type TestUser } from './helpers.js';

const DAY = 86_400_000;

describe.skipIf(!hasDb)('HesabPay (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const pay = (user: TestUser, body: object) => ctx.post('/hesabpay/payments', body, user.token);
  const subscribe = (user: TestUser, package_type = 'MONTHLY') =>
    pay(user, { purpose: 'SUBSCRIPTION', package_type });

  /** POSTs a webhook with a correct signature over the exact bytes sent (unless overridden). */
  const webhook = (
    payload: unknown,
    opts: { signature?: string | null; raw?: string } = {},
  ) => {
    const raw = opts.raw ?? JSON.stringify(payload);
    const req = request(ctx.http).post('/hesabpay/webhook').set('content-type', 'application/json');
    if (opts.signature !== null) {
      req.set('x-hesabpay-signature', opts.signature ?? signWebhook(raw));
    }
    return req.send(raw);
  };
  const confirm = (sessionId: string, extra: object = {}) =>
    webhook({ transaction_id: sessionId, status: 'SUCCESS', ...extra });

  /** Starts a payment and returns its HesabPay session id. */
  const start = async (user: TestUser, body: object) => {
    const res = await pay(user, body).expect(201);
    const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: res.body.id } });
    return { id: res.body.id as string, sessionId: row.hesabpayTxId, body: res.body };
  };
  const status = async (id: string) =>
    (await ctx.prisma.transaction.findUniqueOrThrow({ where: { id } })).status;
  const subscriptions = (agencyId: string) =>
    ctx.prisma.subscription.findMany({ where: { agencyId }, orderBy: { startDate: 'asc' } });
  const near = (actual: Date | null, expected: number, toleranceMs = 10_000) =>
    expect(Math.abs(actual!.getTime() - expected)).toBeLessThan(toleranceMs);

  describe('POST /hesabpay/payments', () => {
    it('needs a token', async () => {
      await ctx.post('/hesabpay/payments', { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' }).expect(401);
    });

    it('lets the server set the price: a client-supplied amount is rejected', async () => {
      const agency = await ctx.agency(false);
      await pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY', amount: 1 }).expect(400);
      await pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY', currency: 'USD' }).expect(400);
    });

    it.each([
      ['an unknown purpose', { purpose: 'GIFT' }],
      ['a subscription without a package', { purpose: 'SUBSCRIPTION' }],
      ['an unknown package', { purpose: 'SUBSCRIPTION', package_type: 'WEEKLY' }],
      ['a ladder without a property', { purpose: 'LADDER' }],
      ['a malformed property id', { purpose: 'LADDER', property_id: 'nope' }],
    ])('rejects %s', async (_label, body) => {
      const agency = await ctx.agency(false);
      await pay(agency, body).expect(400);
    });

    it('records a PENDING subscription purchase at the configured price', async () => {
      const agency = await ctx.agency(false);
      const expected = { MONTHLY: 900, QUARTERLY: 2400, SEMIANNUAL: 3900, YEARLY: 6000 } as const;
      for (const [pkg, amount] of Object.entries(expected)) {
        const res = await subscribe(agency, pkg).expect(201);
        expect(res.body).toMatchObject({ purpose: 'SUBSCRIPTION', status: 'PENDING', amount, currency: 'AFGHANI' });
        expect(res.body.payment_url).toMatch(/^https:\/\//);

        const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(row).toMatchObject({ userId: agency.id, agencyId: agency.agencyId, packageType: pkg, propertyId: null });
        expect(row.amount.toString()).toBe(String(amount));
      }
      // Starting to pay delivers nothing.
      expect(await subscriptions(agency.agencyId)).toHaveLength(0);
    });

    it('only sells subscriptions to registered agencies', async () => {
      const user = await ctx.user();
      const res = await subscribe(user).expect(403);
      expect(res.body.code).toBe('AGENCY_PROFILE_REQUIRED');
      expect(await ctx.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    });

    it('prices ladder and featured promotions for the listing owner', async () => {
      const owner = await ctx.user();
      const listing = (await ctx.post('/properties', propertyBody(), owner.token).expect(201)).body;

      const ladder = await pay(owner, { purpose: 'LADDER', property_id: listing.id }).expect(201);
      expect(ladder.body).toMatchObject({ purpose: 'LADDER', amount: 50, status: 'PENDING' });
      const featured = await pay(owner, { purpose: 'FEATURED_AD', property_id: listing.id }).expect(201);
      expect(featured.body).toMatchObject({ purpose: 'FEATURED_AD', amount: 100 });

      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: featured.body.id } });
      expect(row.propertyId).toBe(listing.id);
      expect(row.amount.toString()).toBe('100');
    });

    it("refuses to promote someone else's, archived or missing listings", async () => {
      const [owner, stranger] = [await ctx.user(), await ctx.user()];
      const listing = (await ctx.post('/properties', propertyBody(), owner.token).expect(201)).body;
      await pay(stranger, { purpose: 'LADDER', property_id: listing.id }).expect(403);
      await pay(owner, { purpose: 'LADDER', property_id: '00000000-0000-4000-8000-000000000000' }).expect(404);
      await ctx.del(`/properties/${listing.id}`, owner.token).expect(204);
      await pay(owner, { purpose: 'FEATURED_AD', property_id: listing.id }).expect(404);
      expect(await ctx.prisma.transaction.count({ where: { userId: { in: [owner.id, stranger.id] } } })).toBe(0);
    });

    it('records nothing when the payment provider is down', async () => {
      const agency = await ctx.agency(false);
      vi.spyOn(ctx.app.get(HesabPayGateway), 'createSession').mockRejectedValue(
        new BadGatewayException('The payment provider is unavailable.'),
      );
      await subscribe(agency).expect(502);
      expect(await ctx.prisma.transaction.count({ where: { userId: agency.id } })).toBe(0);
    });
  });

  describe('GET /hesabpay/pricing', () => {
    it('is public and reports the configured prices', async () => {
      const res = await ctx.get('/hesabpay/pricing').expect(200);
      expect(res.body).toEqual({
        currency: 'AFGHANI',
        subscription: { MONTHLY: 900, QUARTERLY: 2400, SEMIANNUAL: 3900, YEARLY: 6000 },
        subscription_list: { MONTHLY: 1000, QUARTERLY: 3000, SEMIANNUAL: 6000, YEARLY: 12000 },
        ladder: 50,
        featured_ad: 100,
        map_location: 30,
        featured_ad_days: 7,
        contact_credits: 40,
        contact_credits_per_pack: 10,
        featured_bundles: [
          { size: 3, price: 270, list_price: 300, discount_percent: 10 },
          { size: 5, price: 400, list_price: 500, discount_percent: 20 },
          { size: 10, price: 650, list_price: 1000, discount_percent: 35 },
          { size: 20, price: 1100, list_price: 2000, discount_percent: 45 },
        ],
        plans: SUBSCRIPTION_PLAN_BENEFITS,
      });
    });
  });

  describe('GET /hesabpay/payments/:id', () => {
    it('shows the owner their payment status, which follows the webhook', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      const before = await ctx.get(`/hesabpay/payments/${id}`, agency.token).expect(200);
      expect(before.body).toMatchObject({ id, status: 'PENDING', purpose: 'SUBSCRIPTION', amount: 900, currency: 'AFGHANI' });

      await confirm(sessionId).expect(200);
      expect((await ctx.get(`/hesabpay/payments/${id}`, agency.token).expect(200)).body.status).toBe('SUCCESS');
    });

    it("treats someone else's payment as missing, and needs a token and a valid id", async () => {
      const [agency, stranger] = [await ctx.agency(false), await ctx.user()];
      const { id } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await ctx.get(`/hesabpay/payments/${id}`, stranger.token).expect(404);
      await ctx.get(`/hesabpay/payments/${id}`).expect(401);
      await ctx.get('/hesabpay/payments/nope', agency.token).expect(400);
    });
  });

  describe('POST /hesabpay/webhook: authenticity', () => {
    it('rejects missing, malformed and wrong signatures and changes nothing', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      const payload = { transaction_id: sessionId, status: 'SUCCESS' };
      const raw = JSON.stringify(payload);

      await webhook(payload, { signature: null }).expect(401);
      await webhook(payload, { signature: 'not-hex' }).expect(401);
      await webhook(payload, { signature: 'a'.repeat(64) }).expect(401);
      await webhook(payload, { signature: signWebhook(raw, 'some-other-secret-entirely-0123') }).expect(401);

      expect(await status(id)).toBe('PENDING');
      expect(await subscriptions(agency.agencyId)).toHaveLength(0);
    });

    it('rejects a body altered after signing', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      const failedRaw = JSON.stringify({ transaction_id: sessionId, status: 'FAILED' });
      const signatureForFailed = signWebhook(failedRaw);
      // An attacker replays a captured FAILED signature over a SUCCESS body.
      const successRaw = JSON.stringify({ transaction_id: sessionId, status: 'SUCCESS' });
      await webhook(null, { raw: successRaw, signature: signatureForFailed }).expect(401);
      expect(await status(id)).toBe('PENDING');
    });

    it('rejects a validly signed but malformed payload', async () => {
      await webhook(null, { raw: 'not json' }).expect(400);
      await webhook({ status: 'SUCCESS' }).expect(400);
      await webhook({ transaction_id: 'x', status: 'PAID' }).expect(400);
      await webhook({ transaction_id: 'x', status: 'SUCCESS', amount: 'lots' }).expect(400);
      await webhook([1, 2]).expect(400);
    });

    it('acknowledges a signed event for an unknown payment without changing anything', async () => {
      const res = await confirm('mock_does-not-exist').expect(200);
      expect(res.body).toEqual({ received: true });
    });
  });

  describe('POST /hesabpay/webhook: subscriptions', () => {
    it('activates the subscription on success, and the agency can then publish', async () => {
      const agency = await ctx.agency(false);
      await ctx.post('/properties', propertyBody(), agency.token).expect(403); // blocked before paying

      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'QUARTERLY' });
      const res = await confirm(sessionId).expect(200);
      expect(res.body).toEqual({ received: true });

      expect(await status(id)).toBe('SUCCESS');
      const [sub, ...rest] = await subscriptions(agency.agencyId);
      expect(rest).toHaveLength(0);
      expect(sub).toMatchObject({ packageType: 'QUARTERLY', status: 'ACTIVE', transactionId: id });
      near(sub.startDate, Date.now());
      const monthsApart = (sub.endDate.getUTCFullYear() - sub.startDate.getUTCFullYear()) * 12 + sub.endDate.getUTCMonth() - sub.startDate.getUTCMonth();
      expect(monthsApart).toBe(3);

      await ctx.post('/properties', propertyBody(), agency.token).expect(201); // unlocked by paying
    });

    it('runs the six-month plan for six months', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'SEMIANNUAL' });
      await confirm(sessionId).expect(200);
      const [sub] = await subscriptions(agency.agencyId);
      expect(sub).toMatchObject({ packageType: 'SEMIANNUAL', status: 'ACTIVE', transactionId: id });
      const monthsApart = (sub.endDate.getUTCFullYear() - sub.startDate.getUTCFullYear()) * 12 + sub.endDate.getUTCMonth() - sub.startDate.getUTCMonth();
      expect(monthsApart).toBe(6);
    });

    it('delivers once however many times the same confirmation arrives', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      for (let i = 0; i < 3; i++) await confirm(sessionId).expect(200);
      expect(await subscriptions(agency.agencyId)).toHaveLength(1);
      expect(await status(id)).toBe('SUCCESS');
    });

    it('delivers once when the same confirmation arrives simultaneously', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      const results = await Promise.all(Array.from({ length: 8 }, () => confirm(sessionId)));
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(await subscriptions(agency.agencyId)).toHaveLength(1);
      expect(await status(id)).toBe('SUCCESS');
    });

    it('stacks a second purchase after the first instead of overlapping it', async () => {
      const agency = await ctx.agency(false);
      const first = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await confirm(first.sessionId).expect(200);
      const second = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await confirm(second.sessionId).expect(200);

      const [a, b] = await subscriptions(agency.agencyId);
      expect(b.startDate.getTime()).toBe(a.endDate.getTime());
      expect(b.endDate.getTime()).toBeGreaterThan(a.endDate.getTime());
    });

    it('stacks purchases confirmed at the same moment', async () => {
      const agency = await ctx.agency(false);
      const payments = await Promise.all([1, 2, 3].map(() => start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' })));
      await Promise.all(payments.map((p) => confirm(p.sessionId)));

      const subs = await subscriptions(agency.agencyId);
      expect(subs).toHaveLength(3);
      expect(subs[1].startDate.getTime()).toBe(subs[0].endDate.getTime());
      expect(subs[2].startDate.getTime()).toBe(subs[1].endDate.getTime());
    });

    it('extends from the end of an existing active subscription', async () => {
      const agency = await ctx.agency(true); // active for ~30 more days
      const existing = (await subscriptions(agency.agencyId))[0];
      const { sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await confirm(sessionId).expect(200);
      const subs = await subscriptions(agency.agencyId);
      expect(subs).toHaveLength(2);
      expect(subs[1].startDate.getTime()).toBe(existing.endDate.getTime());
    });

    it('marks failures FAILED, delivers nothing, and ignores later contradictory events', async () => {
      const agency = await ctx.agency(false);
      const failed = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await webhook({ transaction_id: failed.sessionId, status: 'FAILED' }).expect(200);
      expect(await status(failed.id)).toBe('FAILED');
      await confirm(failed.sessionId).expect(200); // a late SUCCESS cannot revive it
      expect(await status(failed.id)).toBe('FAILED');

      const paid = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await confirm(paid.sessionId).expect(200);
      await webhook({ transaction_id: paid.sessionId, status: 'FAILED' }).expect(200); // nor can FAILED undo a payment
      expect(await status(paid.id)).toBe('SUCCESS');
      expect(await subscriptions(agency.agencyId)).toHaveLength(1);
    });

    it('does not deliver when the confirmed amount or currency differs from what was requested', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'YEARLY' }); // 6000 AFGHANI
      await confirm(sessionId, { amount: 1 }).expect(200);
      await confirm(sessionId, { amount: 6000, currency: 'USD' }).expect(200);
      expect(await status(id)).toBe('PENDING');
      expect(await subscriptions(agency.agencyId)).toHaveLength(0);

      // The correct amount (any equivalent spelling, provider currency code) still goes through.
      await confirm(sessionId, { amount: '6000.00', currency: 'AFN' }).expect(200);
      expect(await status(id)).toBe('SUCCESS');
      expect(await subscriptions(agency.agencyId)).toHaveLength(1);
    });

    it('rolls the payment back to PENDING if delivery fails, so the provider retry can succeed', async () => {
      const agency = await ctx.agency(false);
      const { id, sessionId } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      await ctx.prisma.transaction.update({ where: { id }, data: { agencyId: null } }); // corrupt the order

      await confirm(sessionId).expect(500);
      expect(await status(id)).toBe('PENDING'); // not stuck at SUCCESS with nothing delivered
      expect(await subscriptions(agency.agencyId)).toHaveLength(0);

      await ctx.prisma.transaction.update({ where: { id }, data: { agencyId: agency.agencyId } }); // repaired
      await confirm(sessionId).expect(200); // the retry
      expect(await status(id)).toBe('SUCCESS');
      expect(await subscriptions(agency.agencyId)).toHaveLength(1);
    });

    it('cannot create two subscriptions for one payment even if the status guard were bypassed', async () => {
      const agency = await ctx.agency(false);
      const { id } = await start(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      const data = { agencyId: agency.agencyId, packageType: 'MONTHLY' as const, startDate: new Date(), endDate: new Date(Date.now() + DAY), transactionId: id };
      await ctx.prisma.subscription.create({ data });
      await expect(ctx.prisma.subscription.create({ data })).rejects.toThrow();
    });
  });

  describe('POST /hesabpay/webhook: promotions', () => {
    const listingFor = async (owner: TestUser, overrides = {}) =>
      (await ctx.post('/properties', propertyBody({ province: uniqueProvince(), ...overrides }), owner.token).expect(201)).body;

    it('ladders a listing to the top of search on success', async () => {
      const owner = await ctx.user();
      const agency = await ctx.agency(true);
      const province = uniqueProvince();
      const older = await listingFor(owner, { province });
      await new Promise((r) => setTimeout(r, 20));
      await ctx.post('/properties', propertyBody({ province }), agency.token).expect(201); // newer listing, same province
      const order = async () => (await ctx.get(`/properties?province=${province}`).expect(200)).body.data.map((p: { id: string }) => p.id);
      expect((await order())[1]).toBe(older.id); // older one is second

      const { id, sessionId } = await start(owner, { purpose: 'LADDER', property_id: older.id });
      await confirm(sessionId).expect(200);

      expect(await status(id)).toBe('SUCCESS');
      expect((await order())[0]).toBe(older.id);
      near((await ctx.prisma.property.findUniqueOrThrow({ where: { id: older.id } })).ladderedAt, Date.now());
    });

    it('features a listing for the configured number of days and extends when bought again', async () => {
      const owner = await ctx.user();
      const listing = await listingFor(owner);
      expect((await ctx.get(`/properties/${listing.id}`)).body.is_featured).toBe(false);

      const first = await start(owner, { purpose: 'FEATURED_AD', property_id: listing.id });
      await confirm(first.sessionId).expect(200);
      let row = await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } });
      expect(row.isFeatured).toBe(true);
      near(row.featuredUntil, Date.now() + 7 * DAY);
      expect((await ctx.get(`/properties/${listing.id}`)).body.is_featured).toBe(true);

      const firstEnd = row.featuredUntil!.getTime();
      const second = await start(owner, { purpose: 'FEATURED_AD', property_id: listing.id });
      await confirm(second.sessionId).expect(200);
      row = await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } });
      expect(row.featuredUntil!.getTime()).toBe(firstEnd + 7 * DAY);
    });

    it('restarts from now when a featured promotion had already expired, and badges end on time', async () => {
      const owner = await ctx.user();
      const listing = await listingFor(owner);
      await ctx.prisma.property.update({ where: { id: listing.id }, data: { isFeatured: true, featuredUntil: new Date(Date.now() - DAY) } });
      expect((await ctx.get(`/properties/${listing.id}`)).body.is_featured).toBe(false);

      const { sessionId } = await start(owner, { purpose: 'FEATURED_AD', property_id: listing.id });
      await confirm(sessionId).expect(200);
      near((await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } })).featuredUntil, Date.now() + 7 * DAY);
    });

    it('extends correctly when two featured payments are confirmed at the same moment', async () => {
      const owner = await ctx.user();
      const listing = await listingFor(owner);
      const [a, b] = await Promise.all([1, 2].map(() => start(owner, { purpose: 'FEATURED_AD', property_id: listing.id })));
      await Promise.all([confirm(a.sessionId), confirm(b.sessionId)]);
      near((await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } })).featuredUntil, Date.now() + 14 * DAY);
    });

    it('keeps the money recorded but changes nothing if the listing was archived while paying', async () => {
      const owner = await ctx.user();
      const listing = await listingFor(owner);
      const { id, sessionId } = await start(owner, { purpose: 'LADDER', property_id: listing.id });
      await ctx.del(`/properties/${listing.id}`, owner.token).expect(204);
      const before = (await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } })).ladderedAt;

      await confirm(sessionId).expect(200);
      expect(await status(id)).toBe('SUCCESS');
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } })).ladderedAt).toEqual(before);
    });
  });

  describe('MAP_LOCATION add-on', () => {
    const tokensOf = (userId: string) => ctx.prisma.mapLocationToken.findMany({ where: { userId } });
    const buy = (user: TestUser) => start(user, { purpose: 'MAP_LOCATION' });

    it('records a PENDING purchase at the configured price and delivers nothing until it is paid', async () => {
      const user = await ctx.user();
      const res = await pay(user, { purpose: 'MAP_LOCATION' }).expect(201);
      expect(res.body).toMatchObject({ purpose: 'MAP_LOCATION', status: 'PENDING', amount: 30, currency: 'AFGHANI' });
      expect(await tokensOf(user.id)).toHaveLength(0);
    });

    it('does not take a property id or an amount', async () => {
      const user = await ctx.user();
      await pay(user, { purpose: 'MAP_LOCATION', amount: 1 }).expect(400);
      await pay(user, { purpose: 'MAP_LOCATION', property_id: '00000000-0000-4000-8000-000000000000' }).expect(400);
    });

    it('grants exactly one token when the payment succeeds, and the payment is linked to it', async () => {
      const user = await ctx.user();
      const { id, sessionId } = await buy(user);
      await confirm(sessionId).expect(200);

      expect(await status(id)).toBe('SUCCESS');
      const tokens = await tokensOf(user.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ source: 'PURCHASE', transactionId: id, propertyId: null, consumedAt: null });
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body.tokens_available).toBe(1);
    });

    it('grants one token however many times the webhook arrives, even simultaneously', async () => {
      const user = await ctx.user();
      const { sessionId } = await buy(user);
      const results = await Promise.all(Array.from({ length: 5 }, () => confirm(sessionId)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      await confirm(sessionId).expect(200);
      expect(await tokensOf(user.id)).toHaveLength(1);
    });

    it('grants nothing for a failed payment or a mismatched amount', async () => {
      const user = await ctx.user();
      const failed = await buy(user);
      await webhook({ transaction_id: failed.sessionId, status: 'FAILED' }).expect(200);
      const wrong = await buy(user);
      await confirm(wrong.sessionId, { amount: '1' }).expect(200);
      expect(await status(failed.id)).toBe('FAILED');
      expect(await status(wrong.id)).toBe('PENDING');
      expect(await tokensOf(user.id)).toHaveLength(0);
    });

    it('lets each paying user keep their own tokens', async () => {
      const [a, b] = [await ctx.user(), await ctx.user()];
      await confirm((await buy(a)).sessionId).expect(200);
      await confirm((await buy(a)).sessionId).expect(200);
      expect(await tokensOf(a.id)).toHaveLength(2);
      expect(await tokensOf(b.id)).toHaveLength(0);
    });

    it('refuses to sell the add-on to accounts that already pin for free', async () => {
      const subscribed = await ctx.agency(true);
      const admin = await ctx.user('ADMIN');
      for (const buyer of [subscribed, admin]) {
        const res = await pay(buyer, { purpose: 'MAP_LOCATION' }).expect(409);
        expect(res.body.code).toBe('MAP_LOCATION_ALREADY_UNLIMITED');
      }
      expect(await ctx.prisma.transaction.count({ where: { userId: { in: [subscribed.id, admin.id] } } })).toBe(0);
    });

    it('sells it to an agency whose subscription has lapsed, and to one that never subscribed', async () => {
      for (const agency of [await ctx.lapsedAgency(), await ctx.agency(false)]) {
        await pay(agency, { purpose: 'MAP_LOCATION' }).expect(201);
      }
    });

    it('is not needed to publish a pinned listing, and a balance bought earlier is not used up by one', async () => {
      const user = await ctx.user();
      await confirm((await buy(user)).sessionId).expect(200);
      const res = await ctx.post('/properties', propertyBody({ ...PIN }), user.token).expect(201);
      expect(res.body).toMatchObject(PIN);
      expect((await ctx.get('/map-location/status', user.token).expect(200)).body.tokens_available).toBe(1);
    });
  });
  describe('CONTACT_CREDITS pack', () => {
    const creditsOf = (userId: string) => ctx.prisma.userCredit.findMany({ where: { userId } });
    const buy = (user: TestUser) => start(user, { purpose: 'CONTACT_CREDITS' });

    it('records a PENDING purchase at the configured price with the pack size, and delivers nothing until it is paid', async () => {
      const user = await ctx.user();
      const { id, body } = await buy(user);
      expect(body).toMatchObject({ purpose: 'CONTACT_CREDITS', status: 'PENDING', amount: 40, currency: 'AFGHANI' });
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id } })).quantity).toBe(10);
      expect(await creditsOf(user.id)).toHaveLength(0);
    });

    it('does not take an amount, a quantity or a property id', async () => {
      const user = await ctx.user();
      await pay(user, { purpose: 'CONTACT_CREDITS', amount: 1 }).expect(400);
      await pay(user, { purpose: 'CONTACT_CREDITS', quantity: 999 }).expect(400);
      await pay(user, { purpose: 'CONTACT_CREDITS', property_id: '00000000-0000-4000-8000-000000000000' }).expect(400);
    });

    it('grants one batch of the quoted size when the payment succeeds, linked to the payment', async () => {
      const user = await ctx.user();
      const { id, sessionId } = await buy(user);
      await confirm(sessionId).expect(200);
      expect(await status(id)).toBe('SUCCESS');
      const batches = await creditsOf(user.id);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({ source: 'PURCHASE', transactionId: id, amount: 10, remaining: 10, inviteeId: null });
    });

    it('grants the pack size that was quoted, even if the configured size changes before the payment lands', async () => {
      const user = await ctx.user();
      const { id, sessionId } = await buy(user);
      // The pack was 10 when the user was quoted; pretend it changed since.
      await ctx.prisma.$executeRaw`UPDATE transactions SET quantity = 7 WHERE id = ${id}::uuid`;
      await confirm(sessionId).expect(200);
      expect((await creditsOf(user.id))[0].amount).toBe(7);
    });

    it('grants one batch however many times the webhook arrives, even simultaneously', async () => {
      const user = await ctx.user();
      const { sessionId } = await buy(user);
      const results = await Promise.all(Array.from({ length: 5 }, () => confirm(sessionId)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      await confirm(sessionId).expect(200);
      expect(await creditsOf(user.id)).toHaveLength(1);
    });

    it('grants nothing for a failed payment or a mismatched amount', async () => {
      const user = await ctx.user();
      const failed = await buy(user);
      await webhook({ transaction_id: failed.sessionId, status: 'FAILED' }).expect(200);
      const wrong = await buy(user);
      await confirm(wrong.sessionId, { amount: '1' }).expect(200);
      expect(await status(failed.id)).toBe('FAILED');
      expect(await status(wrong.id)).toBe('PENDING');
      expect(await creditsOf(user.id)).toHaveLength(0);
    });

    it('refuses to sell credits to accounts that already reveal for free', async () => {
      const subscribed = await ctx.agency(true);
      const admin = await ctx.user('ADMIN');
      for (const buyer of [subscribed, admin]) {
        const res = await pay(buyer, { purpose: 'CONTACT_CREDITS' }).expect(409);
        expect(res.body.code).toBe('CONTACT_ALREADY_UNLIMITED');
      }
      expect(await ctx.prisma.transaction.count({ where: { userId: { in: [subscribed.id, admin.id] } } })).toBe(0);
    });

    it('sells them to an agency whose subscription has lapsed, and to a regular user', async () => {
      for (const buyer of [await ctx.lapsedAgency(), await ctx.user()]) {
        await pay(buyer, { purpose: 'CONTACT_CREDITS' }).expect(201);
      }
    });
  });
});
