import request from 'supertest';
import { PropertyStatus } from '../src/generated/prisma/client.js';
import { hasDb, propertyBody, signWebhook, TestContext, uniqueProvince, type TestUser } from './helpers.js';

const DAY = 86_400_000;

describe.skipIf(!hasDb)('Agency dashboard and listing views (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const dashboard = (user: TestUser) => ctx.get('/agencies/me/dashboard', user.token);
  const publish = async (agency: TestUser, overrides: Record<string, unknown> = {}) =>
    (await ctx.post('/properties', propertyBody({ province: uniqueProvince(), ...overrides }), agency.token).expect(201))
      .body as { id: string };
  const view = (id: string, times = 1) =>
    Promise.all(Array.from({ length: times }, () => ctx.post(`/properties/${id}/view`, {}).expect(204)));
  const row = (id: string) => ctx.prisma.property.findUniqueOrThrow({ where: { id } });

  /** Pays for a promotion the way the app does: start the payment, then HesabPay's webhook confirms it. */
  const pay = async (user: TestUser, body: object) => {
    const started = await ctx.post('/hesabpay/payments', body, user.token).expect(201);
    const tx = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.body.id } });
    const raw = JSON.stringify({ transaction_id: tx.hesabpayTxId, status: 'SUCCESS' });
    await request(ctx.http)
      .post('/hesabpay/webhook')
      .set('content-type', 'application/json')
      .set('x-hesabpay-signature', signWebhook(raw))
      .send(raw)
      .expect(200);
  };

  describe('GET /agencies/me/dashboard: access', () => {
    it('needs a token', async () => {
      await ctx.get('/agencies/me/dashboard').expect(401);
    });

    it('tells an account without an agency profile to register one', async () => {
      const user = await ctx.user();
      const res = await dashboard(user).expect(404);
      expect(res.body.code).toBe('AGENCY_PROFILE_REQUIRED');
    });

    it('shows an agency only its own figures', async () => {
      const [a, b] = [await ctx.agency(true), await ctx.agency(true)];
      await publish(a);
      const res = await dashboard(b).expect(200);
      expect(res.body.agency.id).toBe(b.agencyId);
      expect(res.body.stats).toEqual({ total_properties: 0, active_listings: 0, featured_listings: 0, total_views: 0 });
      expect(res.body.top_listings).toEqual([]);
    });
  });

  describe('listing counts and views', () => {
    it('counts active and sold listings, leaves archived ones out, but keeps the views they earned', async () => {
      const agency = await ctx.agency(true);
      const [active, sold, archived] = [await publish(agency), await publish(agency), await publish(agency)];
      await view(active.id, 3);
      await view(sold.id, 2);
      await view(archived.id, 4);
      await ctx.prisma.property.update({ where: { id: sold.id }, data: { status: PropertyStatus.SOLD } });
      await ctx.del(`/properties/${archived.id}`, agency.token).expect(204);

      const { stats } = (await dashboard(agency).expect(200)).body;
      expect(stats).toEqual({ total_properties: 2, active_listings: 1, featured_listings: 0, total_views: 9 });
    });

    it('ignores listings the owner posted as a regular user before the agency existed', async () => {
      const agency = await ctx.agency(true);
      await publish(agency);
      await ctx.prisma.property.create({
        data: {
          userId: agency.id, // theirs, but not published under the agency profile
          title: 'Before the agency',
          description: 'Posted as a regular user',
          type: 'APARTMENT',
          dealType: 'SALE',
          price: 1000,
          currency: 'USD',
          areaSqm: 50,
          province: 'Kabul',
          district: 'Shar-e-Naw',
          neighborhood: 'Qala-e-Fathullah',
          address: 'Somewhere',
          viewCount: 7,
        },
      });
      const { stats } = (await dashboard(agency).expect(200)).body;
      expect(stats.total_properties).toBe(1);
      expect(stats.total_views).toBe(0);
    });

    it('lists the most viewed active listings first, at most five', async () => {
      const agency = await ctx.agency(true);
      const listings = [];
      for (let i = 0; i < 6; i++) listings.push(await publish(agency, { title: `Listing ${i}` }));
      await view(listings[4].id, 5);
      await view(listings[1].id, 3);
      await view(listings[0].id, 1);

      const { top_listings } = (await dashboard(agency).expect(200)).body;
      expect(top_listings).toHaveLength(5);
      expect(top_listings.slice(0, 3).map((l: { id: string }) => l.id)).toEqual([listings[4].id, listings[1].id, listings[0].id]);
      expect(top_listings[0]).toMatchObject({ title: 'Listing 4', view_count: 5, is_featured: false, currency: 'USD', price: 85000 });
    });

    it('does not rank an archived listing', async () => {
      const agency = await ctx.agency(true);
      const popular = await publish(agency);
      const quiet = await publish(agency);
      await view(popular.id, 10);
      await ctx.del(`/properties/${popular.id}`, agency.token).expect(204);
      const { top_listings } = (await dashboard(agency).expect(200)).body;
      expect(top_listings.map((l: { id: string }) => l.id)).toEqual([quiet.id]);
    });
  });

  describe('subscription', () => {
    it('reports no subscription for an agency that never bought one', async () => {
      const agency = await ctx.agency(false);
      const { subscription } = (await dashboard(agency).expect(200)).body;
      expect(subscription).toEqual({ is_active: false, package_type: null, ends_at: null, remaining_days: 0 });
    });

    it('reports the days left on the running plan', async () => {
      const agency = await ctx.agency(true); // started yesterday, runs 30 more days
      const { subscription } = (await dashboard(agency).expect(200)).body;
      expect(subscription).toMatchObject({ is_active: true, package_type: 'MONTHLY', remaining_days: 30 });
      expect(Math.abs(Date.parse(subscription.ends_at) - (Date.now() + 30 * DAY))).toBeLessThan(10_000);
    });

    it('rounds a part-day up: 3 hours left is still 1 day, never 0 while the agency can publish', async () => {
      const agency = await ctx.agency(true);
      await ctx.prisma.subscription.updateMany({ where: { agencyId: agency.agencyId }, data: { endDate: new Date(Date.now() + 3 * 3_600_000) } });
      expect((await dashboard(agency).expect(200)).body.subscription).toMatchObject({ is_active: true, remaining_days: 1 });
    });

    it('counts plans bought in advance, but not one that starts after a gap', async () => {
      const agency = await ctx.agency(true);
      const running = (await ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId: agency.agencyId } })).endDate;
      await ctx.prisma.subscription.create({
        data: { agencyId: agency.agencyId, packageType: 'MONTHLY', startDate: running, endDate: new Date(running.getTime() + 30 * DAY) },
      });
      expect((await dashboard(agency).expect(200)).body.subscription.remaining_days).toBe(60);

      const gapStart = new Date(running.getTime() + 40 * DAY);
      await ctx.prisma.subscription.create({
        data: { agencyId: agency.agencyId, packageType: 'YEARLY', startDate: gapStart, endDate: new Date(gapStart.getTime() + 365 * DAY) },
      });
      expect((await dashboard(agency).expect(200)).body.subscription.remaining_days).toBe(60);
    });

    it('is inactive once the plan has ended, even though its row is still marked ACTIVE', async () => {
      const agency = await ctx.lapsedAgency();
      const { subscription } = (await dashboard(agency).expect(200)).body;
      expect(subscription).toMatchObject({ is_active: false, remaining_days: 0 });
    });

    it('agrees with what the agency is actually allowed to do', async () => {
      const [active, lapsed] = [await ctx.agency(true), await ctx.lapsedAgency()];
      expect((await dashboard(active).expect(200)).body.subscription.is_active).toBe(true);
      await ctx.post('/properties', propertyBody(), active.token).expect(201);
      expect((await dashboard(lapsed).expect(200)).body.subscription.is_active).toBe(false);
      await ctx.post('/properties', propertyBody(), lapsed.token).expect(403);
    });
  });

  describe('promotions', () => {
    it('shows a paid featured ad and a ladder on the dashboard', async () => {
      const agency = await ctx.agency(true);
      const listing = await publish(agency);
      const before = (await row(listing.id)).ladderedAt!;
      await new Promise((resolve) => setTimeout(resolve, 20));

      await pay(agency, { purpose: 'FEATURED_AD', property_id: listing.id });
      await pay(agency, { purpose: 'LADDER', property_id: listing.id });

      const { stats, top_listings } = (await dashboard(agency).expect(200)).body;
      expect(stats.featured_listings).toBe(1);
      expect(top_listings[0]).toMatchObject({ id: listing.id, is_featured: true });
      expect(Date.parse(top_listings[0].laddered_at)).toBeGreaterThan(before.getTime());
    });

    it('stops counting a featured ad once it has expired, even though the flag is still set', async () => {
      const agency = await ctx.agency(true);
      const [running, expired] = [await publish(agency), await publish(agency)];
      await ctx.prisma.property.update({ where: { id: running.id }, data: { isFeatured: true, featuredUntil: new Date(Date.now() + DAY) } });
      await ctx.prisma.property.update({ where: { id: expired.id }, data: { isFeatured: true, featuredUntil: new Date(Date.now() - DAY) } });

      const { stats, top_listings } = (await dashboard(agency).expect(200)).body;
      expect(stats.featured_listings).toBe(1);
      const byId = Object.fromEntries(top_listings.map((l: { id: string; is_featured: boolean }) => [l.id, l.is_featured]));
      expect(byId).toEqual({ [running.id]: true, [expired.id]: false });
    });
  });

  describe('POST /properties/:id/view', () => {
    it('is public, answers 204 and adds one view', async () => {
      const agency = await ctx.agency(true);
      const listing = await publish(agency);
      await ctx.post(`/properties/${listing.id}/view`, {}).expect(204);
      expect((await row(listing.id)).viewCount).toBe(1);
    });

    it('loses no views when many arrive at once', async () => {
      const agency = await ctx.agency(true);
      const listing = await publish(agency);
      await view(listing.id, 25);
      expect((await row(listing.id)).viewCount).toBe(25);
    });

    it('does not touch updated_at: a view is not an edit', async () => {
      const agency = await ctx.agency(true);
      const listing = await publish(agency);
      const before = (await row(listing.id)).updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 20));
      await view(listing.id, 2);
      expect((await row(listing.id)).updatedAt).toEqual(before);
    });

    it('ignores archived and unknown listings without an error', async () => {
      const agency = await ctx.agency(true);
      const listing = await publish(agency);
      await ctx.del(`/properties/${listing.id}`, agency.token).expect(204);
      await ctx.post(`/properties/${listing.id}/view`, {}).expect(204);
      await ctx.post('/properties/00000000-0000-4000-8000-000000000000/view', {}).expect(204);
      expect((await row(listing.id)).viewCount).toBe(0);
    });

    it('rejects a malformed id', async () => {
      await ctx.post('/properties/nope/view', {}).expect(400);
    });

    it('is not part of the public listing, so counts cannot be read without the dashboard', async () => {
      const agency = await ctx.agency(true);
      const listing = await publish(agency);
      await view(listing.id);
      expect((await ctx.get(`/properties/${listing.id}`).expect(200)).body).not.toHaveProperty('view_count');
    });
  });
});
