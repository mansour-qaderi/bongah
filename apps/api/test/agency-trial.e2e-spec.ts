import type { Wallet } from '@bongah/shared-types';
import { hasDb, propertyBody, TestContext, type TestUser } from './helpers.js';

// A small allowance so the limit can be reached; the length of the trial is the default (30 days).
process.env.AGENCY_TRIAL_LISTINGS = '3';
process.env.AGENCY_TRIAL_DAYS = '30';

const DAY = 86_400_000;
const agencyBody = () => ({
  agency_name: 'Noor Real Estate',
  license_photo: 'https://example.com/license.jpg',
  address: 'Shar-e-Naw, Kabul',
});

describe.skipIf(!hasDb)('Agency free trial (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const publish = (user: TestUser, overrides: Record<string, unknown> = {}) =>
    ctx.post('/properties', propertyBody(overrides), user.token);
  const wallet = async (user: TestUser) => (await ctx.get('/wallet', user.token).expect(200)).body as Wallet;
  const trialOf = (agencyId: string) =>
    ctx.prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { trialEndsAt: true, trialListingsUsed: true } });

  /** A user who registers an agency through the API, so the trial starts the way it does for real. */
  async function registeredAgency(): Promise<TestUser & { agencyId: string }> {
    const user = await ctx.user();
    const res = await ctx.post('/agencies/register', agencyBody(), user.token).expect(201);
    return { ...user, agencyId: res.body.id as string };
  }

  it('starts when the agency registers and lasts the configured number of days', async () => {
    const agency = await registeredAgency();
    const { trialEndsAt, trialListingsUsed } = await trialOf(agency.agencyId);
    expect(Math.abs(trialEndsAt!.getTime() - (Date.now() + 30 * DAY))).toBeLessThan(60_000);
    expect(trialListingsUsed).toBe(0);
  });

  it('lets an agency with no subscription publish, up to the trial limit', async () => {
    const agency = await registeredAgency();
    for (let i = 0; i < 3; i++) await publish(agency, { title: `Trial listing ${i}` }).expect(201);

    const refused = await publish(agency).expect(403);
    expect(refused.body).toMatchObject({ code: 'TRIAL_LISTING_LIMIT_REACHED', limit: 3 });
    expect((await trialOf(agency.agencyId)).trialListingsUsed).toBe(3);
    expect(await ctx.prisma.property.count({ where: { userId: agency.id } })).toBe(3);
  });

  it('never publishes more than the limit when requests arrive together', async () => {
    const agency = await registeredAgency();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => publish(agency, { title: `Race ${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 403).every((r) => r.body.code === 'TRIAL_LISTING_LIMIT_REACHED')).toBe(true);
    expect((await trialOf(agency.agencyId)).trialListingsUsed).toBe(3);
  });

  it('is over when its days are: publishing then needs a subscription', async () => {
    const agency = await registeredAgency();
    await ctx.prisma.agency.update({ where: { id: agency.agencyId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const refused = await publish(agency).expect(403);
    expect(refused.body.code).toBe('SUBSCRIPTION_REQUIRED');
    expect((await trialOf(agency.agencyId)).trialListingsUsed).toBe(0);
  });

  it('does not exist for an agency that was registered without one', async () => {
    const agency = await ctx.agency(false); // created directly: trial_ends_at is null
    expect((await publish(agency).expect(403)).body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('is not spent while a subscription is running: the plan pays first', async () => {
    const agency = await registeredAgency();
    await ctx.prisma.subscription.create({
      data: {
        agencyId: agency.agencyId,
        packageType: 'MONTHLY',
        startDate: new Date(Date.now() - DAY),
        endDate: new Date(Date.now() + 30 * DAY),
      },
    });
    await publish(agency).expect(201);
    expect((await trialOf(agency.agencyId)).trialListingsUsed).toBe(0);
    const sub = await ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId: agency.agencyId } });
    expect(sub.listingsUsed).toBe(1);
  });

  it('works for quick-add (bulk) too, row by row, and reports the limit on the rows it cannot publish', async () => {
    const agency = await registeredAgency();
    const items = Array.from({ length: 5 }, (_, i) => propertyBody({ title: `Bulk ${i}` }));
    const res = await ctx.post('/agencies/me/properties/bulk', { items }, agency.token).expect(200);
    expect(res.body).toMatchObject({ total: 5, succeeded: 3, failed: 2 });
    expect(res.body.results.filter((r: { ok: boolean }) => !r.ok).map((r: { code: string }) => r.code)).toEqual([
      'TRIAL_LISTING_LIMIT_REACHED',
      'TRIAL_LISTING_LIMIT_REACHED',
    ]);
  });

  it('still refuses bulk to an agency whose trial is over and has no plan', async () => {
    const agency = await registeredAgency();
    await ctx.prisma.agency.update({ where: { id: agency.agencyId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const res = await ctx.post('/agencies/me/properties/bulk', { items: [propertyBody()] }, agency.token).expect(403);
    expect(res.body.code).toBe('PERKS_REQUIRED');
  });

  it('is not the subscription: no unlimited contact reveals, no office pin', async () => {
    const agency = await registeredAgency();
    const w = await wallet(agency);
    expect(w.contact_unlimited).toBe(false);
    const pin = await ctx.put('/agencies/me/location', { lat: 34.53, lng: 69.16 }, agency.token).expect(403);
    expect(pin.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('shows in the wallet: days left, the limit, how many are used, and the listing quota', async () => {
    const agency = await registeredAgency();
    await publish(agency).expect(201);
    const w = await wallet(agency);
    expect(w.trial).toMatchObject({ is_active: true, listings_limit: 3, listings_used: 1, remaining_days: 30 });
    expect(w.listing_quota).toMatchObject({ limit: 3, used: 1, extra: 0 });
    expect(w.listing_quota?.resets_at).toBe(w.trial?.ends_at);
    expect(w.subscription?.is_active).toBe(false);
  });

  it('is null in the wallet of a regular user, and shows as over once it has ended', async () => {
    const user = await ctx.user();
    expect((await wallet(user)).trial).toBeNull();

    const agency = await registeredAgency();
    await ctx.prisma.agency.update({ where: { id: agency.agencyId }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
    const w = await wallet(agency);
    expect(w.trial).toMatchObject({ is_active: false, remaining_days: 0 });
    expect(w.listing_quota).toMatchObject({ limit: 0 });
  });
});
