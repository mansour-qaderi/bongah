import { kabulDayKey } from '../src/contact/contact.time.js';
import { hasDb, TestContext, type TestUser } from './helpers.js';

const DAY = 86_400_000;

describe.skipIf(!hasDb)('Contact reveal (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** A new seller with one active listing. */
  const seller = async () => {
    const owner = await ctx.user();
    return { owner, listing: await ctx.listing(owner) };
  };
  const sellers = (n: number) => Promise.all(Array.from({ length: n }, seller));

  const peek = (viewer: TestUser, listingId: string) => ctx.get(`/properties/${listingId}/contact`, viewer.token);
  const unlock = (viewer: TestUser, listingId: string, body: object = {}) =>
    ctx.post(`/properties/${listingId}/contact/unlock`, body, viewer.token);
  const logs = (userId: string) => ctx.prisma.contactUnlockLog.findMany({ where: { userId } });
  const credits = async (userId: string) =>
    (await ctx.prisma.userCredit.aggregate({ where: { userId }, _sum: { remaining: true } }))._sum.remaining ?? 0;

  /** Uses up the 3 free reveals of the day. */
  const useFreeReveals = async (viewer: TestUser) => {
    for (const { listing } of await sellers(3)) await unlock(viewer, listing.id).expect(200);
  };

  describe('the daily free allowance', () => {
    it('starts with 3 free reveals and a locked number', async () => {
      const viewer = await ctx.user();
      const { owner, listing } = await seller();
      const res = await peek(viewer, listing.id).expect(200);
      expect(res.body).toMatchObject({
        unlocked: false,
        is_owner: false,
        contact: null,
        paid_with: null,
        quota: { free_limit: 3, free_used: 0, free_remaining: 3, credits: 0, referral_credits: 0, unlimited: false, unlimited_reason: null },
      });
      expect(JSON.stringify(res.body)).not.toContain(owner.phone);
      // The quota says when the allowance refills: a future time.
      expect(new Date(res.body.quota.resets_at).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(res.body.quota.resets_at).getTime()).toBeLessThanOrEqual(Date.now() + DAY);
    });

    it('peeking never counts as a reveal', async () => {
      const viewer = await ctx.user();
      const { listing } = await seller();
      for (let i = 0; i < 5; i++) await peek(viewer, listing.id).expect(200);
      expect(await logs(viewer.id)).toHaveLength(0);
    });

    it('reveals 3 different numbers for free, then refuses the 4th with the quota', async () => {
      const viewer = await ctx.user();
      const [a, b, c, d] = await sellers(4);
      for (const s of [a, b, c]) {
        const res = await unlock(viewer, s.listing.id).expect(200);
        expect(res.body).toMatchObject({ unlocked: true, paid_with: 'FREE_DAILY', contact: { phone_number: s.owner.phone } });
      }
      const refused = await unlock(viewer, d.listing.id).expect(403);
      expect(refused.body).toMatchObject({
        code: 'CONTACT_LIMIT_REACHED',
        quota: { free_limit: 3, free_used: 3, free_remaining: 0, credits: 0, unlimited: false },
      });
      expect(JSON.stringify(refused.body)).not.toContain(d.owner.phone);
      expect(await logs(viewer.id)).toHaveLength(3);
    });

    it('reveals the same seller again, on any of their listings and for phone or WhatsApp, without using another free reveal', async () => {
      const viewer = await ctx.user();
      const first = await seller();
      const second = await ctx.listing(first.owner);
      await unlock(viewer, first.listing.id).expect(200);
      const again = await unlock(viewer, second.id).expect(200);
      expect(again.body).toMatchObject({ unlocked: true, paid_with: null, contact: { phone_number: first.owner.phone } });
      expect(again.body.quota.free_used).toBe(1);
      expect(await logs(viewer.id)).toHaveLength(1);
    });

    it('keeps already revealed numbers available after the allowance is gone', async () => {
      const viewer = await ctx.user();
      const [a, b, c, d] = await sellers(4);
      for (const s of [a, b, c]) await unlock(viewer, s.listing.id).expect(200);
      await unlock(viewer, d.listing.id).expect(403);
      const res = await peek(viewer, a.listing.id).expect(200);
      expect(res.body).toMatchObject({ unlocked: true, contact: { phone_number: a.owner.phone } });
      await unlock(viewer, a.listing.id).expect(200);
    });

    it('counts per person: one user using their reveals does not touch another', async () => {
      const [one, two] = [await ctx.user(), await ctx.user()];
      await useFreeReveals(one);
      const { listing } = await seller();
      await unlock(two, listing.id).expect(200);
    });

    it('starts a new Kabul day with a fresh allowance, and does not count yesterday', async () => {
      const viewer = await ctx.user();
      const yesterday = new Date(kabulDayKey(new Date()).getTime() - DAY);
      const old = await sellers(3);
      for (const s of old) {
        await ctx.prisma.contactUnlockLog.create({
          data: { userId: viewer.id, contactUserId: s.owner.id, propertyId: s.listing.id, dayKey: yesterday, method: 'FREE_DAILY' },
        });
      }
      const today = await peek(viewer, old[0].listing.id).expect(200);
      expect(today.body).toMatchObject({ unlocked: false, quota: { free_used: 0, free_remaining: 3 } });
      // Yesterday's reveal of the same number does not carry over: it costs a free reveal again.
      const res = await unlock(viewer, old[0].listing.id).expect(200);
      expect(res.body).toMatchObject({ paid_with: 'FREE_DAILY', quota: { free_used: 1 } });
    });

    it('never lets two simultaneous requests exceed the allowance', async () => {
      const viewer = await ctx.user();
      const all = await sellers(8);
      const results = await Promise.all(all.map((s) => unlock(viewer, s.listing.id)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 200, 403, 403, 403, 403, 403]);
      expect(await logs(viewer.id)).toHaveLength(3);
    });

    it('treats a double tap on one number as one reveal', async () => {
      const viewer = await ctx.user();
      const { listing } = await seller();
      const results = await Promise.all(Array.from({ length: 5 }, () => unlock(viewer, listing.id)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await logs(viewer.id)).toHaveLength(1);
    });
  });

  describe('your own listing and unknown listings', () => {
    it('shows owners their own number without counting or logging anything', async () => {
      const { owner, listing } = await seller();
      const res = await unlock(owner, listing.id).expect(200);
      expect(res.body).toMatchObject({ unlocked: true, is_owner: true, paid_with: null, contact: { phone_number: owner.phone } });
      expect(res.body.quota.free_used).toBe(0);
      expect(await logs(owner.id)).toHaveLength(0);
      expect((await peek(owner, listing.id).expect(200)).body.is_owner).toBe(true);
    });

    it('does not reveal archived or missing listings, or accept a malformed id or body', async () => {
      const viewer = await ctx.user();
      const owner = await ctx.user();
      const archived = await ctx.listing(owner, { status: 'ARCHIVED' });
      await unlock(viewer, archived.id).expect(404);
      await unlock(viewer, '00000000-0000-4000-8000-000000000000').expect(404);
      await unlock(viewer, 'nope').expect(400);
      const { listing } = await seller();
      await unlock(viewer, listing.id, { use_credit: 'yes' }).expect(400);
      await unlock(viewer, listing.id, { amount: 1 }).expect(400);
      expect(await logs(viewer.id)).toHaveLength(0);
    });

    it('reveals a SOLD listing (the owner may still be reached about it)', async () => {
      const viewer = await ctx.user();
      const owner = await ctx.user();
      const sold = await ctx.listing(owner, { status: 'SOLD' });
      await unlock(viewer, sold.id).expect(200);
    });
  });

  describe('credits', () => {
    it('never spends a credit unless the request asks for it', async () => {
      const viewer = await ctx.user();
      await useFreeReveals(viewer);
      await ctx.giveContactCredits(viewer.id, 2);
      const { listing } = await seller();

      const refused = await unlock(viewer, listing.id).expect(403);
      expect(refused.body).toMatchObject({ code: 'CONTACT_LIMIT_REACHED', quota: { credits: 2 } });
      await unlock(viewer, listing.id, { use_credit: false }).expect(403);
      expect(await credits(viewer.id)).toBe(2);
    });

    it('spends exactly one credit when asked, and a repeat of the same number is free', async () => {
      const viewer = await ctx.user();
      await useFreeReveals(viewer);
      await ctx.giveContactCredits(viewer.id, 2);
      const { owner, listing } = await seller();

      const res = await unlock(viewer, listing.id, { use_credit: true }).expect(200);
      expect(res.body).toMatchObject({ paid_with: 'CREDIT', contact: { phone_number: owner.phone }, quota: { credits: 1 } });
      const again = await unlock(viewer, listing.id, { use_credit: true }).expect(200);
      expect(again.body).toMatchObject({ paid_with: null, quota: { credits: 1 } });
      expect(await credits(viewer.id)).toBe(1);

      const log = (await logs(viewer.id)).find((l) => l.method === 'CREDIT')!;
      expect(log.creditId).not.toBeNull();
    });

    it('prefers a free reveal to a credit when both are available', async () => {
      const viewer = await ctx.user();
      await ctx.giveContactCredits(viewer.id, 2);
      const { listing } = await seller();
      const res = await unlock(viewer, listing.id, { use_credit: true }).expect(200);
      expect(res.body.paid_with).toBe('FREE_DAILY');
      expect(await credits(viewer.id)).toBe(2);
    });

    it('refuses when there are no credits, even if the request asks to use one', async () => {
      const viewer = await ctx.user();
      await useFreeReveals(viewer);
      const { listing } = await seller();
      const res = await unlock(viewer, listing.id, { use_credit: true }).expect(403);
      expect(res.body.code).toBe('CONTACT_LIMIT_REACHED');
    });

    it('spends the oldest batch first, and reports referral credits separately', async () => {
      const viewer = await ctx.user();
      await useFreeReveals(viewer);
      await ctx.prisma.userCredit.create({
        data: { userId: viewer.id, source: 'REFERRAL', amount: 1, remaining: 1, inviteeId: viewer.id, createdAt: new Date(Date.now() - DAY) },
      });
      await ctx.giveContactCredits(viewer.id, 5);

      const [one, two] = await sellers(2);
      const first = await unlock(viewer, one.listing.id, { use_credit: true }).expect(200);
      expect(first.body.quota).toMatchObject({ credits: 5, referral_credits: 0 }); // the older referral batch went first
      const second = await unlock(viewer, two.listing.id, { use_credit: true }).expect(200);
      expect(second.body.quota.credits).toBe(4);

      const batches = await ctx.prisma.userCredit.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: 'asc' } });
      expect(batches.map((b) => b.remaining)).toEqual([0, 4]);
    });

    it('spends one credit per number when taps race, never more', async () => {
      const viewer = await ctx.user();
      await useFreeReveals(viewer);
      await ctx.giveContactCredits(viewer.id, 3);
      const [one, two] = await sellers(2);

      // A double tap on each of two numbers, all at once.
      const results = await Promise.all([
        unlock(viewer, one.listing.id, { use_credit: true }),
        unlock(viewer, one.listing.id, { use_credit: true }),
        unlock(viewer, two.listing.id, { use_credit: true }),
        unlock(viewer, two.listing.id, { use_credit: true }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(await credits(viewer.id)).toBe(1);
      expect((await logs(viewer.id)).filter((l) => l.method === 'CREDIT')).toHaveLength(2);
    });

    it('never goes below zero when more reveals race than there are credits', async () => {
      const viewer = await ctx.user();
      await useFreeReveals(viewer);
      await ctx.giveContactCredits(viewer.id, 1);
      const all = await sellers(4);
      const results = await Promise.all(all.map((s) => unlock(viewer, s.listing.id, { use_credit: true })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 403)).toHaveLength(3);
      expect(await credits(viewer.id)).toBe(0);
    });
  });

  describe('agency perks', () => {
    it('gives an agency with an active subscription unlimited, uncounted reveals', async () => {
      const agency = await ctx.agency(true);
      for (const { listing } of await sellers(6)) {
        const res = await unlock(agency, listing.id).expect(200);
        expect(res.body.paid_with).toBe('PERK');
        expect(res.body.quota).toMatchObject({ unlimited: true, unlimited_reason: 'AGENCY_SUBSCRIPTION', free_used: 0 });
      }
      expect(await logs(agency.id)).toHaveLength(6);
    });

    it('gives admins the same, and nothing to a lapsed or never-subscribed agency', async () => {
      const admin = await ctx.user('ADMIN');
      for (const { listing } of await sellers(4)) await unlock(admin, listing.id).expect(200);

      for (const agency of [await ctx.lapsedAgency(), await ctx.agency(false)]) {
        await useFreeReveals(agency);
        const { listing } = await seller();
        expect((await unlock(agency, listing.id).expect(403)).body.code).toBe('CONTACT_LIMIT_REACHED');
      }
    });

    it('goes by the database, not by what the token claims', async () => {
      const user = await ctx.user(); // a regular user...
      const forged = await ctx.tokenFor(user.id, 'ADMIN'); // ...with a token that says ADMIN
      await useFreeReveals({ ...user, token: forged });
      const { listing } = await seller();
      await ctx.post(`/properties/${listing.id}/contact/unlock`, {}, forged).expect(403);
    });

    it('stops being unlimited the moment the subscription ends', async () => {
      const agency = await ctx.agency(true);
      const first = await seller();
      await unlock(agency, first.listing.id).expect(200);
      await ctx.prisma.subscription.updateMany({ where: { agencyId: agency.agencyId }, data: { endDate: new Date(Date.now() - 1000) } });
      expect((await peek(agency, first.listing.id).expect(200)).body.quota.unlimited).toBe(false);
    });

    it('does not use up the free reveals of the day when an agency reveals as a perk', async () => {
      const agency = await ctx.agency(true);
      for (const { listing } of await sellers(4)) await unlock(agency, listing.id).expect(200);
      const free = (await ctx.prisma.contactUnlockLog.count({ where: { userId: agency.id, method: 'FREE_DAILY' } }));
      expect(free).toBe(0);
    });
  });

  describe('referral credits', () => {
    it('gives the new user and the inviter contact credits for a signup with a code, within the inviter cap', async () => {
      const inviter = await ctx.signUp();
      const code = await ctx.codeOf(inviter.id);
      const invitees = [];
      for (let i = 0; i < 4; i++) invitees.push(await ctx.signUp(code)); // the cap in tests is 3 rewarded invites

      // 2 credits per side (REFERRAL_CONTACT_CREDITS in test/setup-env.ts).
      for (const invitee of invitees) expect(await credits(invitee.id)).toBe(2);
      expect(await credits(inviter.id)).toBe(6);

      const batches = await ctx.prisma.userCredit.findMany({ where: { userId: inviter.id } });
      expect(batches).toHaveLength(3);
      expect(batches.every((b) => b.source === 'REFERRAL' && b.inviteeId !== null)).toBe(true);
    });

    it('lets a referral credit pay for a reveal and shows it as a referral credit', async () => {
      const inviter = await ctx.signUp();
      const friend = await ctx.signUp(await ctx.codeOf(inviter.id));
      await useFreeReveals(friend);
      const { listing } = await seller();
      const quota = (await peek(friend, listing.id).expect(200)).body.quota;
      expect(quota).toMatchObject({ credits: 2, referral_credits: 2 });
      expect((await unlock(friend, listing.id, { use_credit: true }).expect(200)).body.quota).toMatchObject({
        credits: 1,
        referral_credits: 1,
      });
    });

    it('gives nothing without a code', async () => {
      const user = await ctx.signUp();
      expect(await credits(user.id)).toBe(0);
    });
  });

  describe('database rules', () => {
    it('refuses nonsense credit batches and unlock logs', async () => {
      const user = await ctx.user();
      const { owner, listing } = await seller();
      const create = (data: object) => ctx.prisma.userCredit.create({ data: { userId: user.id, source: 'ADMIN_GRANT', amount: 3, remaining: 3, ...data } });
      await expect(create({ remaining: 4 })).rejects.toThrow();
      await expect(create({ remaining: -1 })).rejects.toThrow();
      await expect(create({ amount: 0, remaining: 0 })).rejects.toThrow();
      await expect(create({ source: 'PURCHASE' })).rejects.toThrow(); // a purchase needs its payment
      await expect(create({ source: 'REFERRAL' })).rejects.toThrow(); // a referral names the friend

      // A CREDIT reveal must point at a batch, and only a CREDIT reveal may.
      const base = { userId: user.id, contactUserId: owner.id, propertyId: listing.id, dayKey: kabulDayKey(new Date()) };
      await expect(ctx.prisma.contactUnlockLog.create({ data: { ...base, method: 'CREDIT' } })).rejects.toThrow();
      const batch = await create({});
      await expect(
        ctx.prisma.contactUnlockLog.create({ data: { ...base, method: 'FREE_DAILY', creditId: batch.id } }),
      ).rejects.toThrow();
    });

    it('allows one reveal per (viewer, seller, day) however it is inserted', async () => {
      const user = await ctx.user();
      const { owner, listing } = await seller();
      const data = { userId: user.id, contactUserId: owner.id, propertyId: listing.id, dayKey: kabulDayKey(new Date()), method: 'FREE_DAILY' as const };
      await ctx.prisma.contactUnlockLog.create({ data });
      await expect(ctx.prisma.contactUnlockLog.create({ data })).rejects.toThrow();
    });
  });
});
