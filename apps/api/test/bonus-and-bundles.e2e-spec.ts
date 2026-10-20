import { SUBSCRIPTION_PLAN_BENEFITS, type SubscriptionPackage } from '@bongah/shared-types';
import { hasDb, propertyBody, TestContext, uniqueProvince, type TestUser } from './helpers.js';

const DAY = 86_400_000;
const PLANS: SubscriptionPackage[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY'];

describe.skipIf(!hasDb)('Launch gifts, plan listing allowances, featured bundles and featured-first listing (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const me = async (user: TestUser) => (await ctx.get('/users/me', user.token).expect(200)).body;
  const row = (user: TestUser) => ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

  describe('GET /hesabpay/pricing', () => {
    it('prices the four plans from one monthly list price of 1000: 10, 20, 35 and 50 percent off', async () => {
      const pricing = (await ctx.get('/hesabpay/pricing').expect(200)).body;
      expect(pricing.subscription).toEqual({ MONTHLY: 900, QUARTERLY: 2400, SEMIANNUAL: 3900, YEARLY: 6000 });
      expect(pricing.subscription_list).toEqual({ MONTHLY: 1000, QUARTERLY: 3000, SEMIANNUAL: 6000, YEARLY: 12000 });
    });

    it('says what each plan includes: listings, gift listings, featured gifts, accounting, portfolio', async () => {
      const { plans } = (await ctx.get('/hesabpay/pricing').expect(200)).body;
      expect(plans).toEqual(SUBSCRIPTION_PLAN_BENEFITS);
      expect(plans.MONTHLY).toMatchObject({ listings: 8, gift_listings: 2, gift_featured: 1 });
      expect(plans.QUARTERLY).toMatchObject({ listings: 18, gift_listings: 6, gift_featured: 3 });
      expect(plans.SEMIANNUAL).toMatchObject({ listings: 30, gift_listings: 9, gift_featured: 6 });
      expect(plans.YEARLY).toMatchObject({ listings: 60, gift_listings: 15, gift_featured: 12 });
    });

    it('offers 1, 3, 5, 10 and 20 featured listings at 100, 270, 400, 650 and 1100 (single price 100)', async () => {
      const pricing = (await ctx.get('/hesabpay/pricing').expect(200)).body;
      expect(pricing.featured_ad).toBe(100);
      expect(pricing.featured_bundles).toEqual([
        { size: 1, price: 100, list_price: 100, discount_percent: 0 },
        { size: 3, price: 270, list_price: 300, discount_percent: 10 },
        { size: 5, price: 400, list_price: 500, discount_percent: 20 },
        { size: 10, price: 650, list_price: 1000, discount_percent: 35 },
        { size: 20, price: 1100, list_price: 2000, discount_percent: 45 },
      ]);
    });
  });

  describe('the launch gifts for a first subscription', () => {
    it.each(PLANS)('%s: gives the plan\'s gift listings and featured gifts once it is paid, and not before', async (plan) => {
      const gifts = SUBSCRIPTION_PLAN_BENEFITS[plan];
      const agency = await ctx.agency(false);
      expect(await me(agency)).toMatchObject({ bonus_listing_credits: 0, featured_credits: 0 });

      const id = await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: plan }, false);
      expect(await me(agency)).toMatchObject({ bonus_listing_credits: 0, featured_credits: 0 });
      // The app offers the gifts while they are still on offer...
      expect((await me(agency)).first_subscription_bonus_available).toBe(true);

      await ctx.confirmPayment(id);
      expect(await me(agency)).toMatchObject({
        bonus_listing_credits: gifts.gift_listings,
        featured_credits: gifts.gift_featured,
        // ...and stops offering them once they have been given.
        first_subscription_bonus_available: false,
      });
      expect((await row(agency)).firstSubscriptionBonusAt).not.toBeNull();
    });

    it('gives them only once: a second purchase and a repeated confirmation add nothing', async () => {
      const agency = await ctx.agency(false);
      const first = await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'QUARTERLY' });
      await ctx.confirmPayment(first); // HesabPay retries the same webhook
      await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'YEARLY' });
      const { QUARTERLY } = SUBSCRIPTION_PLAN_BENEFITS;
      expect(await me(agency)).toMatchObject({
        bonus_listing_credits: QUARTERLY.gift_listings,
        featured_credits: QUARTERLY.gift_featured,
      });
    });

    it('are not given to an agency that had subscribed before, and do not touch what it has', async () => {
      const agency = await ctx.agency(true); // an existing subscription
      await ctx.prisma.user.update({ where: { id: agency.id }, data: { firstSubscriptionBonusAt: new Date() } });
      await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
      expect(await me(agency)).toMatchObject({ bonus_listing_credits: 0, featured_credits: 0 });
    });

    it('are given to simultaneous first purchases once', async () => {
      const agency = await ctx.agency(false);
      const a = await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' }, false);
      const b = await ctx.pay(agency, { purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' }, false);
      await Promise.all([ctx.confirmPayment(a), ctx.confirmPayment(b)]);
      const { MONTHLY } = SUBSCRIPTION_PLAN_BENEFITS;
      expect(await me(agency)).toMatchObject({
        bonus_listing_credits: MONTHLY.gift_listings,
        featured_credits: MONTHLY.gift_featured,
      });
    });
  });

  describe('the listing allowance of a plan', () => {
    const publish = (user: TestUser) => ctx.post('/properties', propertyBody(), user.token);
    const subscriptionOf = (agencyId: string) =>
      ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId }, orderBy: { startDate: 'asc' } });

    it('MONTHLY allows 8 listings, then refuses with the limit and no reset date', async () => {
      const quota = SUBSCRIPTION_PLAN_BENEFITS.MONTHLY.listings;
      const agency = await ctx.agency(true);
      for (let i = 0; i < quota; i += 1) await publish(agency).expect(201);
      const refused = await publish(agency).expect(403);
      expect(refused.body).toMatchObject({ code: 'AGENCY_LISTING_LIMIT_REACHED', limit: quota });
      expect(refused.body.resets_at).toBeUndefined();
      expect((await subscriptionOf(agency.agencyId)).listingsUsed).toBe(quota);
    });

    it.each(PLANS)('%s allows exactly its quota, counted on the subscription', async (plan) => {
      const quota = SUBSCRIPTION_PLAN_BENEFITS[plan].listings;
      const agency = await ctx.agency(plan);
      const subscription = await subscriptionOf(agency.agencyId);
      await ctx.prisma.subscription.update({ where: { id: subscription.id }, data: { listingsUsed: quota - 1 } });
      await publish(agency).expect(201);
      const refused = await publish(agency).expect(403);
      expect(refused.body).toMatchObject({ code: 'AGENCY_LISTING_LIMIT_REACHED', limit: quota });
      expect((await subscriptionOf(agency.agencyId)).listingsUsed).toBe(quota);
    });

    it('lets gift listings pay for the listings past the quota, one each, then refuses', async () => {
      const quota = SUBSCRIPTION_PLAN_BENEFITS.MONTHLY.listings;
      const agency = await ctx.agency(true);
      await ctx.prisma.user.update({ where: { id: agency.id }, data: { bonusListingCredits: 3 } });
      for (let i = 0; i < quota; i += 1) await publish(agency).expect(201);
      expect((await row(agency)).bonusListingCredits).toBe(3); // the plan's own listings are used first
      for (let left = 2; left >= 0; left -= 1) {
        await publish(agency).expect(201);
        expect((await row(agency)).bonusListingCredits).toBe(left);
      }
      await publish(agency).expect(403);
      expect(await ctx.prisma.property.count({ where: { userId: agency.id } })).toBe(quota + 3);
    });

    it('does not let two simultaneous requests spend the last plan listing or the same gift', async () => {
      const quota = SUBSCRIPTION_PLAN_BENEFITS.MONTHLY.listings;
      const agency = await ctx.agency(true);
      const subscription = await subscriptionOf(agency.agencyId);
      await ctx.prisma.subscription.update({ where: { id: subscription.id }, data: { listingsUsed: quota - 1 } });
      const lastOne = await Promise.all([publish(agency), publish(agency)]);
      expect(lastOne.map((r) => r.status).sort()).toEqual([201, 403]);

      await ctx.prisma.user.update({ where: { id: agency.id }, data: { bonusListingCredits: 1 } });
      const gift = await Promise.all([publish(agency), publish(agency)]);
      expect(gift.map((r) => r.status).sort()).toEqual([201, 403]);
      expect((await row(agency)).bonusListingCredits).toBe(0);
    });

    it('counts per subscription: a plan queued behind a used-up one brings its own quota once it runs', async () => {
      const quota = SUBSCRIPTION_PLAN_BENEFITS.MONTHLY.listings;
      const agency = await ctx.agency(true);
      const first = await subscriptionOf(agency.agencyId);
      await ctx.prisma.subscription.update({ where: { id: first.id }, data: { listingsUsed: quota } });
      await ctx.prisma.subscription.create({
        data: {
          agencyId: agency.agencyId,
          packageType: 'QUARTERLY',
          startDate: first.endDate, // bought in advance: starts when the first one ends
          endDate: new Date(first.endDate.getTime() + 90 * DAY),
        },
      });
      // Still on the first plan, which is used up: the queued plan's listings are not available yet.
      await publish(agency).expect(403);

      // The first plan ends; the queued one is running and starts from zero.
      await ctx.prisma.subscription.update({
        where: { id: first.id },
        data: { startDate: new Date(Date.now() - 31 * DAY), endDate: new Date(Date.now() - DAY) },
      });
      await ctx.prisma.subscription.updateMany({
        where: { agencyId: agency.agencyId, packageType: 'QUARTERLY' },
        data: { startDate: new Date(Date.now() - DAY) },
      });
      await publish(agency).expect(201);
      const running = await ctx.prisma.subscription.findFirstOrThrow({
        where: { agencyId: agency.agencyId, packageType: 'QUARTERLY' },
      });
      expect(running.listingsUsed).toBe(1);
    });

    it('does not limit an admin, and a lapsed agency still needs its subscription', async () => {
      const admin = await ctx.admin();
      for (let i = 0; i < SUBSCRIPTION_PLAN_BENEFITS.MONTHLY.listings + 1; i += 1) await publish(admin).expect(201);
      const lapsed = await ctx.lapsedAgency();
      expect((await publish(lapsed).expect(403)).body.code).toBe('SUBSCRIPTION_REQUIRED');
    });
  });

  describe('featured bundles', () => {
    it.each([
      [1, 100],
      [3, 270],
      [5, 400],
      [10, 650],
      [20, 1100],
    ])('sells %i featured listings for %i and records the size', async (size, amount) => {
      const user = await ctx.user();
      const res = (await ctx.post('/hesabpay/payments', { purpose: 'FEATURED_CREDITS', bundle_size: size }, user.token).expect(201)).body;
      expect(res).toMatchObject({ purpose: 'FEATURED_CREDITS', status: 'PENDING', amount });
      expect((await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: res.id } })).quantity).toBe(size);
      expect((await row(user)).featuredCredits).toBe(0); // starting to pay delivers nothing
    });

    it('adds the credits when the payment is confirmed, once', async () => {
      const user = await ctx.user();
      const id = await ctx.pay(user, { purpose: 'FEATURED_CREDITS', bundle_size: 20 });
      await ctx.confirmPayment(id);
      expect((await me(user)).featured_credits).toBe(20);
    });

    it.each([[7], [2], [0], [4], ['5'], [undefined]])('rejects a bundle of %s and takes no money', async (bundle_size) => {
      const user = await ctx.user();
      await ctx.post('/hesabpay/payments', { purpose: 'FEATURED_CREDITS', bundle_size }, user.token).expect(400);
      await ctx.post('/hesabpay/payments', { purpose: 'FEATURED_CREDITS', bundle_size: 5, amount: 1 }, user.token).expect(400);
      expect(await ctx.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  describe('GET /properties: featured listings come first', () => {
    const ids = (body: { data: { id: string }[] }) => body.data.map((d) => d.id);

    it('puts running featured listings ahead of the rest across page boundaries, with correct totals', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      const future = new Date(Date.now() + 3 * DAY);
      const past = new Date(Date.now() - DAY);
      const seed = (extra: Record<string, unknown>) => ctx.listing(owner, { province, ...extra });
      // Created oldest to newest, so on their own the plain ones would sort ahead of the older featured ones.
      const f1 = await seed({ title: 'F1', isFeatured: true, featuredUntil: future });
      const expired = await seed({ title: 'Expired', isFeatured: true, featuredUntil: past });
      const f2 = await seed({ title: 'F2', isFeatured: true, featuredUntil: future });
      const n1 = await seed({ title: 'N1' });
      const f3 = await seed({ title: 'F3', isFeatured: true, featuredUntil: future });
      const n2 = await seed({ title: 'N2' });
      const flagOnly = await seed({ title: 'FlagNoDate', isFeatured: true, featuredUntil: null });

      const featured = new Set([f1.id, f2.id, f3.id]);
      const others = new Set([expired.id, n1.id, n2.id, flagOnly.id]);
      const get = async (page: number) =>
        (await ctx.get(`/properties?province=${encodeURIComponent(province)}&limit=2&page=${page}`).expect(200)).body;

      const [p1, p2, p3, p4] = [await get(1), await get(2), await get(3), await get(4)];
      expect(p1.meta).toEqual({ page: 1, limit: 2, total: 7, total_pages: 4 });
      expect(ids(p1).every((id) => featured.has(id))).toBe(true); // 2 featured
      expect(featured.has(ids(p2)[0])).toBe(true); // the last featured one...
      expect(others.has(ids(p2)[1])).toBe(true); // ...then the boundary: the first of the others
      expect(ids(p3).every((id) => others.has(id))).toBe(true);
      expect(ids(p4).every((id) => others.has(id))).toBe(true);

      const all = [...ids(p1), ...ids(p2), ...ids(p3), ...ids(p4)];
      expect(new Set(all).size).toBe(7); // no listing twice, none missing
      expect(all.slice(0, 3).sort()).toEqual([...featured].sort());
      expect(p1.data.every((d: { is_featured: boolean }) => d.is_featured)).toBe(true);
    });
  });

  describe('POST /hesabpay/featured-credits/use', () => {
    const use = (user: TestUser | null, property_id: string) =>
      ctx.post('/hesabpay/featured-credits/use', { property_id }, user?.token);
    const listingOf = async (user: TestUser) => (await ctx.post('/properties', propertyBody(), user.token).expect(201)).body.id as string;

    it('needs a token', async () => {
      await use(null, '00000000-0000-4000-8000-000000000000').expect(401);
    });

    it('features the listing for the usual 7 days and takes one credit', async () => {
      const owner = await ctx.user();
      await ctx.prisma.user.update({ where: { id: owner.id }, data: { featuredCredits: 2 } });
      const id = await listingOf(owner);
      const res = await use(owner, id).expect(200);
      expect(res.body.featured_credits).toBe(1);
      const until = new Date(res.body.featured_until).getTime();
      expect(Math.abs(until - (Date.now() + 7 * DAY))).toBeLessThan(10_000);
      const property = await ctx.prisma.property.findUniqueOrThrow({ where: { id } });
      expect(property.isFeatured).toBe(true);
      expect(property.featuredUntil!.getTime()).toBe(until);
      expect((await me(owner)).featured_credits).toBe(1);
    });

    it('adds the days to a listing that is already featured', async () => {
      const owner = await ctx.user();
      await ctx.prisma.user.update({ where: { id: owner.id }, data: { featuredCredits: 2 } });
      const id = await listingOf(owner);
      await use(owner, id).expect(200);
      const second = await use(owner, id).expect(200);
      expect(Math.abs(new Date(second.body.featured_until).getTime() - (Date.now() + 14 * DAY))).toBeLessThan(10_000);
    });

    it('refuses with NO_FEATURED_CREDITS when there are none, and changes nothing', async () => {
      const owner = await ctx.user();
      const id = await listingOf(owner);
      expect((await use(owner, id).expect(409)).body.code).toBe('NO_FEATURED_CREDITS');
      expect((await ctx.prisma.property.findUniqueOrThrow({ where: { id } })).isFeatured).toBe(false);
    });

    it("keeps the credit when the listing is someone else's, gone or archived", async () => {
      const [owner, stranger] = [await ctx.user(), await ctx.user()];
      await ctx.prisma.user.update({ where: { id: stranger.id }, data: { featuredCredits: 1 } });
      const id = await listingOf(owner);
      await use(stranger, id).expect(403);
      await use(stranger, '00000000-0000-4000-8000-000000000000').expect(404);
      await ctx.del(`/properties/${id}`, owner.token).expect(204);
      await ctx.prisma.user.update({ where: { id: owner.id }, data: { featuredCredits: 1 } });
      await use(owner, id).expect(404);
      expect((await row(stranger)).featuredCredits).toBe(1);
      expect((await row(owner)).featuredCredits).toBe(1);
    });

    it('does not let two simultaneous requests spend the same credit', async () => {
      const owner = await ctx.agency(true); // a private account may publish only one listing a month
      await ctx.prisma.user.update({ where: { id: owner.id }, data: { featuredCredits: 1 } });
      const [a, b] = [await listingOf(owner), await listingOf(owner)];
      const results = await Promise.all([use(owner, a), use(owner, b)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await row(owner)).featuredCredits).toBe(0);
    });

    it('rejects a malformed body', async () => {
      const owner = await ctx.user();
      await use(owner, 'nope').expect(400);
    });
  });
});
