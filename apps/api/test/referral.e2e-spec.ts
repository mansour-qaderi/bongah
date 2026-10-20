import { randomInt } from 'node:crypto';
import { REFERRAL_CODE_ALPHABET } from '@bongah/validation';
import { LADDERS_PER_FRAME, LADDERS_PER_LISTING } from '@bongah/shared-types';
import { RewardReason, RewardSpend, RewardType } from '../src/generated/prisma/client.js';
import { hasDb, propertyBody, randomPhone, TestContext, uniqueProvince, type TestUser } from './helpers.js';

// test/setup-env.ts sets REFERRAL_MAX_REWARDED_INVITES=3 and a link template.
const CAP = 3;
const CODE_FORMAT = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{8}$`);

describe.skipIf(!hasDb)('Referrals and rewards (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const summary = async (user: TestUser) => (await ctx.get('/referrals/me', user.token).expect(200)).body;
  const tokensOf = (userId: string, spent = false) =>
    ctx.prisma.reward.count({
      where: { userId, type: RewardType.LADDER_TOKEN, ...(spent ? { consumedAt: { not: null } } : { consumedAt: null }) },
    });
  const publish = async (user: TestUser) =>
    (await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), user.token).expect(201)).body as { id: string };
  /** Another listing of a user who has used their free one: made straight in the database. */
  const publishAnother = async (user: TestUser) => ctx.listing(user);
  const listing = (id: string) => ctx.prisma.property.findUniqueOrThrow({ where: { id } });
  const frame = (user: TestUser, propertyId: string) =>
    ctx.post('/rewards/ladders/spend', { purpose: 'FEATURED_FRAME', property_id: propertyId }, user.token);
  const unlock = (user: TestUser) => ctx.post('/rewards/ladders/spend', { purpose: 'LISTING_QUOTA' }, user.token);
  /** Gives `user` that many unspent ladders, each earned by a (made-up) invited friend, without going through signup. */
  const giveLadders = async (userId: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const friend = await ctx.user();
      await ctx.prisma.reward.create({
        data: { userId, inviteeId: friend.id, type: RewardType.LADDER_TOKEN, reason: RewardReason.REFERRER_BONUS },
      });
    }
  };
  const randomCode = () =>
    Array.from({ length: 8 }, () => REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)]).join('');

  describe('every user has a referral code', () => {
    it('gets a well-formed one however the account is created: directly in the database, or by signing up', async () => {
      const direct = await ctx.user();
      const viaOtp = await ctx.signUp();
      expect(await ctx.codeOf(direct.id)).toMatch(CODE_FORMAT);
      expect(await ctx.codeOf(viaOtp.id)).toMatch(CODE_FORMAT);
    });

    it('never repeats a code', async () => {
      const users = await Promise.all(Array.from({ length: 30 }, () => ctx.user()));
      const codes = await Promise.all(users.map((u) => ctx.codeOf(u.id)));
      expect(new Set(codes).size).toBe(30);
    });

    it('refuses a code the app could not accept, and a repeated one', async () => {
      const [a, b] = [await ctx.user(), await ctx.user()];
      await expect(ctx.prisma.user.update({ where: { id: a.id }, data: { referralCode: 'abcd2345' } })).rejects.toThrow();
      await expect(ctx.prisma.user.update({ where: { id: a.id }, data: { referralCode: 'ABCO0I12' } })).rejects.toThrow();
      await expect(ctx.prisma.user.update({ where: { id: a.id }, data: { referralCode: await ctx.codeOf(b.id) } })).rejects.toThrow();
    });
  });

  describe('signing up with a code', () => {
    it('gives the inviter one ladder, gives the new user none, and links them', async () => {
      const referrer = await ctx.signUp();
      const friend = await ctx.signUp(await ctx.codeOf(referrer.id));

      expect(friend.response.is_new_user).toBe(true);
      expect(friend.response.referral_applied).toBe(true);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: friend.id } })).referredById).toBe(referrer.id);

      const rewards = await ctx.prisma.reward.findMany({ where: { inviteeId: friend.id }, orderBy: { reason: 'asc' } });
      expect(rewards).toEqual([
        expect.objectContaining({ userId: referrer.id, reason: RewardReason.REFERRER_BONUS, type: RewardType.LADDER_TOKEN, amount: 1, consumedAt: null }),
      ]);
      // A new account starts with 0 ladders.
      expect(await tokensOf(friend.id)).toBe(0);
      expect(await tokensOf(friend.id, true)).toBe(0);
    });

    it('is not applied when nobody invited the user', async () => {
      const user = await ctx.signUp();
      expect(user.response.referral_applied).toBe(false);
      expect(await ctx.prisma.reward.count({ where: { inviteeId: user.id } })).toBe(0);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referredById).toBeNull();
    });

    it('accepts the code as people type it: lower case, spaces, hyphens, Persian digits', async () => {
      const referrer = await ctx.user();
      const known = `${randomCode().slice(0, 4)}2345`;
      await ctx.prisma.user.update({ where: { id: referrer.id }, data: { referralCode: known } });

      const typed = [
        `${known.slice(0, 4).toLowerCase()}-${known.slice(4)}`,
        ` ${known.slice(0, 2)} ${known.slice(2, 4)} ${known.slice(4)} `,
        `${known.slice(0, 4)}۲۳۴۵`,
      ];
      for (const text of typed) {
        const friend = await ctx.signUp(text);
        expect(friend.response.referral_applied, text).toBe(true);
        expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: friend.id } })).referredById, text).toBe(referrer.id);
      }
    });

    it('treats an empty code as no code', async () => {
      const friend = await ctx.signUp('');
      expect(friend.response.referral_applied).toBe(false);
    });

    it('refuses a well-formed code nobody owns, BEFORE using up the one-time code, and creates nothing', async () => {
      const phone = randomPhone();
      const otp = await ctx.otpFor(phone);
      const res = await ctx.verifyOtp(phone, otp, randomCode().slice(0, 6) + '22').expect(400);
      expect(res.body.code).toBe('INVALID_REFERRAL_CODE');
      expect(await ctx.prisma.user.count({ where: { phoneNumber: phone } })).toBe(0);
      expect(await ctx.prisma.otpCode.count({ where: { phoneNumber: phone, consumedAt: null } })).toBe(1);

      // The same one-time code still works, with no referral code this time.
      const retry = await ctx.verifyOtp(phone, otp).expect(200);
      ctx.userIds.push(retry.body.user.id);
      expect(retry.body).toMatchObject({ is_new_user: true, referral_applied: false });
    });

    it('reports a malformed code as a validation error on that field', async () => {
      const phone = randomPhone();
      const res = await ctx.verifyOtp(phone, await ctx.otpFor(phone), 'abc').expect(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'referral_code' })]);
    });

    it('does not reveal which codes exist to someone without a valid one-time code', async () => {
      const referrer = await ctx.user();
      const phone = randomPhone();
      await ctx.otpFor(phone);
      const real = await ctx.verifyOtp(phone, '000000', await ctx.codeOf(referrer.id)).expect(401);
      const fake = await ctx.verifyOtp(phone, '000000', randomCode().slice(0, 6) + '22').expect(401);
      expect(real.body.message).toBe(fake.body.message);
    });

    it('ignores the code of someone who already has an account', async () => {
      const [referrer, existing] = [await ctx.signUp(), await ctx.signUp()];
      const otp = await ctx.otpFor(existing.phone);
      const res = await ctx.verifyOtp(existing.phone, otp, await ctx.codeOf(referrer.id)).expect(200);
      expect(res.body).toMatchObject({ is_new_user: false, referral_applied: false });
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).referredById).toBeNull();
      expect(await ctx.prisma.reward.count({ where: { OR: [{ userId: existing.id }, { inviteeId: existing.id }] } })).toBe(0);

      // Not even an unknown code gets in the way of a returning user.
      const again = await ctx.verifyOtp(existing.phone, await ctx.otpFor(existing.phone), randomCode().slice(0, 6) + '22').expect(200);
      expect(again.body.referral_applied).toBe(false);
    });

    it('gives the inviter nothing more once they reached the cap, and the friends still join with 0 ladders', async () => {
      const referrer = await ctx.signUp();
      const code = await ctx.codeOf(referrer.id);
      const friends: Awaited<ReturnType<typeof ctx.signUp>>[] = [];
      for (let i = 0; i < CAP + 1; i++) friends.push(await ctx.signUp(code));

      expect(friends.every((f) => f.response.referral_applied)).toBe(true);
      expect(await tokensOf(referrer.id)).toBe(CAP);
      for (const f of friends) expect(await tokensOf(f.id)).toBe(0);

      const s = await summary(referrer);
      expect(s.stats).toMatchObject({ invited_count: CAP + 1, rewarded_invites: CAP, max_rewarded_invites: CAP });
      expect(s.invited.map((i: { reward_granted: boolean }) => i.reward_granted)).toEqual([false, true, true, true]);
    });

    it('holds the cap when several friends sign up at the same moment', async () => {
      const referrer = await ctx.signUp();
      const code = await ctx.codeOf(referrer.id);
      const friends = await Promise.all(Array.from({ length: CAP + 3 }, () => ctx.signUp(code)));

      expect(await tokensOf(referrer.id)).toBe(CAP);
      expect(await ctx.prisma.reward.count({ where: { userId: referrer.id, reason: RewardReason.REFERRER_BONUS } })).toBe(CAP);
      for (const f of friends) expect(await tokensOf(f.id)).toBe(0);
    });
  });

  describe('what the database refuses', () => {
    const make = async () => {
      const [referrer, friend] = [await ctx.signUp(), await ctx.signUp()];
      return { referrer, friend };
    };
    const reward = (data: Record<string, unknown>) =>
      ctx.prisma.reward.create({ data: { type: RewardType.LADDER_TOKEN, ...data } as never });

    it('pays the same reward for the same friend only once', async () => {
      const referrer = await ctx.signUp();
      const friend = await ctx.signUp(await ctx.codeOf(referrer.id));
      await expect(
        reward({ userId: referrer.id, inviteeId: friend.id, reason: RewardReason.REFERRER_BONUS }),
      ).rejects.toThrow();
    });

    it('does not let a user be their own inviter', async () => {
      const user = await ctx.user();
      await expect(ctx.prisma.user.update({ where: { id: user.id }, data: { referredById: user.id } })).rejects.toThrow();
    });

    it('keeps referrer and referee rewards with the right person', async () => {
      const { referrer, friend } = await make();
      // A referee bonus must go to the invitee; a referrer bonus must go to someone else.
      await expect(reward({ userId: referrer.id, inviteeId: friend.id, reason: RewardReason.REFEREE_BONUS })).rejects.toThrow();
      await expect(reward({ userId: friend.id, inviteeId: friend.id, reason: RewardReason.REFERRER_BONUS })).rejects.toThrow();
    });

    it('keeps a ladder token one unit, and "spent" and "on which listing" together', async () => {
      const { referrer, friend } = await make();
      const base = { userId: referrer.id, inviteeId: friend.id, reason: RewardReason.REFERRER_BONUS };
      await expect(reward({ ...base, amount: 2 })).rejects.toThrow();
      await expect(reward({ ...base, amount: 0 })).rejects.toThrow();
      await expect(reward({ ...base, consumedAt: new Date() })).rejects.toThrow();
    });
  });

  describe('GET /referrals/me', () => {
    it('needs a token', async () => {
      await ctx.get('/referrals/me').expect(401);
    });

    it('shows my code, my invite link and an empty history to someone nobody has invited', async () => {
      const user = await ctx.signUp();
      const code = await ctx.codeOf(user.id);
      const s = await summary(user);
      expect(s).toEqual({
        referral_code: code,
        share_url: `https://bongah.test/invite/${code}`,
        stats: { invited_count: 0, rewarded_invites: 0, max_rewarded_invites: CAP, contact_credits_per_invite: 2, ladder_tokens_available: 0, ladder_tokens_earned: 0 },
        invited: [],
        rewards: [],
      });
    });

    it('lists invited friends newest first with the phone masked, and the rewards earned', async () => {
      const referrer = await ctx.signUp();
      const code = await ctx.codeOf(referrer.id);
      const first = await ctx.signUp(code);
      const second = await ctx.signUp(code);
      await ctx.patch('/users/register', { full_name: 'Zarghona Ahmadi' }, second.token).catch(() => undefined);
      await ctx.prisma.user.update({ where: { id: second.id }, data: { fullName: 'Zarghona Ahmadi' } });

      const s = await summary(referrer);
      expect(s.stats).toMatchObject({ invited_count: 2, rewarded_invites: 2, ladder_tokens_available: 2, ladder_tokens_earned: 2 });
      expect(s.invited).toEqual([
        { name: 'Zarghona Ahmadi', phone_masked: `${second.phone.slice(0, 5)}••••${second.phone.slice(-3)}`, joined_at: expect.any(String), reward_granted: true },
        { name: null, phone_masked: `${first.phone.slice(0, 5)}••••${first.phone.slice(-3)}`, joined_at: expect.any(String), reward_granted: true },
      ]);
      // The full number is never in the payload.
      expect(JSON.stringify(s)).not.toContain(first.phone);
      expect(JSON.stringify(s)).not.toContain(second.phone);
      expect(s.rewards).toEqual([
        expect.objectContaining({ type: 'LADDER_TOKEN', reason: 'REFERRER_BONUS', amount: 1, used_at: null }),
        expect.objectContaining({ type: 'LADDER_TOKEN', reason: 'REFERRER_BONUS', amount: 1, used_at: null }),
      ]);
    });

    it("shows a friend no ladders at the start, and doesn't mention who invited them", async () => {
      const referrer = await ctx.signUp();
      const friend = await ctx.signUp(await ctx.codeOf(referrer.id));
      const s = await summary(friend);
      expect(s.stats).toMatchObject({ invited_count: 0, ladder_tokens_available: 0, ladder_tokens_earned: 0 });
      expect(s.invited).toEqual([]);
      expect(s.rewards).toEqual([]);
    });

    it("never shows another user's friends", async () => {
      const [a, b] = [await ctx.signUp(), await ctx.signUp()];
      await ctx.signUp(await ctx.codeOf(a.id));
      expect((await summary(b)).invited).toEqual([]);
    });

    it('counts spent ladders as earned but not available, and shows when they were used', async () => {
      const referrer = await ctx.user();
      await giveLadders(referrer.id, LADDERS_PER_FRAME + 1);
      const home = await publish(referrer);
      await frame(referrer, home.id).expect(200);
      const s = await summary(referrer);
      expect(s.stats).toMatchObject({ ladder_tokens_available: 1, ladder_tokens_earned: LADDERS_PER_FRAME + 1 });
      expect(s.rewards.filter((r: { used_at: string | null }) => r.used_at !== null)).toHaveLength(LADDERS_PER_FRAME);
    });
  });

  describe('POST /rewards/ladders/spend', () => {
    const SPEND = '/rewards/ladders/spend';
    /** A user with `ladders` unspent ladders (made directly, so the invite cap does not matter) and one listing. */
    const holder = async (ladders: number) => {
      const owner = await ctx.user();
      await giveLadders(owner.id, ladders);
      return { owner, property: await publish(owner) };
    };

    it('needs a sign-in, and a body that names what the ladders are for', async () => {
      await ctx.post(SPEND, { purpose: 'LISTING_QUOTA' }).expect(401);
      const user = await ctx.user();
      await ctx.post(SPEND, {}, user.token).expect(400);
      await ctx.post(SPEND, { purpose: 'BUMP' }, user.token).expect(400);
      await ctx.post(SPEND, { purpose: 'FEATURED_FRAME' }, user.token).expect(400);
      await ctx.post(SPEND, { purpose: 'FEATURED_FRAME', property_id: 'nope' }, user.token).expect(400);
      await ctx.post(SPEND, { purpose: 'LISTING_QUOTA', property_id: '00000000-0000-4000-8000-000000000000' }, user.token).expect(400);
    });

    it('is the only way to spend ladders: the old one-ladder bump route is gone', async () => {
      const { owner, property } = await holder(LADDERS_PER_FRAME);
      await ctx.post('/rewards/ladder-tokens/redeem', { property_id: property.id }, owner.token).expect(404);
      expect(await tokensOf(owner.id)).toBe(LADDERS_PER_FRAME);
    });

    describe('a featured frame (کادر ویژه) for seven ladders', () => {
      const COST = LADDERS_PER_FRAME;
      it('frames the listing for the usual seven days and spends exactly seven ladders', async () => {
        const { owner, property } = await holder(COST);
        const res = await frame(owner, property.id).expect(200);
        const row = await listing(property.id);
        expect(row.isFeatured).toBe(true);
        expect(row.featuredUntil!.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
        expect(res.body).toEqual({
          purpose: 'FEATURED_FRAME',
          ladders_available: 0,
          featured_until: row.featuredUntil!.toISOString(),
          extra_listings: null,
        });
        const spent = await ctx.prisma.reward.findMany({ where: { userId: owner.id, consumedAt: { not: null } } });
        expect(spent).toHaveLength(COST);
        expect(spent.every((r) => r.spentOn === RewardSpend.FEATURED_FRAME && r.propertyId === property.id)).toBe(true);
      });

      it('spends the oldest seven and keeps the rest', async () => {
        const { owner, property } = await holder(COST + 2);
        const all = await ctx.prisma.reward.findMany({ where: { userId: owner.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        const res = await frame(owner, property.id).expect(200);
        expect(res.body.ladders_available).toBe(2);
        const after = await ctx.prisma.reward.findMany({ where: { id: { in: all.map((r) => r.id) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        expect(after.map((r) => r.consumedAt !== null)).toEqual([true, true, true, true, true, true, true, false, false]);
      });

      it('adds seven days to a listing that is already framed', async () => {
        const { owner, property } = await holder(COST * 2);
        await frame(owner, property.id).expect(200);
        const first = (await listing(property.id)).featuredUntil!;
        await frame(owner, property.id).expect(200);
        const second = (await listing(property.id)).featuredUntil!;
        expect(second.getTime() - first.getTime()).toBe(7 * 86_400_000);
      });

      it('refuses with 409 NOT_ENOUGH_LADDERS below seven, and leaves the ladders and the listing alone', async () => {
        const { owner, property } = await holder(COST - 1);
        const res = await frame(owner, property.id).expect(409);
        expect(res.body).toMatchObject({ code: 'NOT_ENOUGH_LADDERS', needed: COST });
        expect(await tokensOf(owner.id)).toBe(COST - 1);
        expect((await listing(property.id)).isFeatured).toBe(false);
      });

      it('costs seven, not the three a listing costs: three ladders are refused and kept', async () => {
        const { owner, property } = await holder(LADDERS_PER_LISTING);
        const res = await frame(owner, property.id).expect(409);
        expect(res.body).toMatchObject({ code: 'NOT_ENOUGH_LADDERS', needed: LADDERS_PER_FRAME });
        expect(await tokensOf(owner.id)).toBe(LADDERS_PER_LISTING);
        expect((await listing(property.id)).isFeatured).toBe(false);
      });

      it("refuses someone else's listing (403) and an archived or unknown one (404) without spending a ladder", async () => {
        const [{ owner }, { property: theirs }] = [await holder(COST), await holder(0)];
        await frame(owner, theirs.id).expect(403);
        const mine = await publishAnother(owner);
        await ctx.del(`/properties/${mine.id}`, owner.token).expect(204);
        await frame(owner, mine.id).expect(404);
        await frame(owner, '00000000-0000-4000-8000-000000000000').expect(404);
        expect(await tokensOf(owner.id)).toBe(COST);
        expect((await listing(theirs.id)).isFeatured).toBe(false);
      });

      it('cannot spend ladders somebody else holds', async () => {
        const [{ owner: rich }, { owner: poor, property }] = [await holder(COST), await holder(0)];
        await frame(poor, property.id).expect(409);
        expect(await tokensOf(rich.id)).toBe(COST);
      });

      it('spends seven once, however many requests arrive together', async () => {
        const { owner, property } = await holder(COST);
        const results = await Promise.all(Array.from({ length: 5 }, () => frame(owner, property.id)));
        expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
        expect(await tokensOf(owner.id, true)).toBe(COST);
      });
    });

    describe('one more listing (listing quota) for three ladders', () => {
      const COST = LADDERS_PER_LISTING;
      it('is refused while the free listing of the month is still unused, and costs nothing', async () => {
        const owner = await ctx.user();
        await giveLadders(owner.id, COST);
        const res = await unlock(owner).expect(409);
        expect(res.body.code).toBe('LISTING_QUOTA_NOT_EXHAUSTED');
        expect(await tokensOf(owner.id)).toBe(COST);
      });

      it('once the free listing is used, turns three ladders into one more listing, which then publishes', async () => {
        const { owner } = await holder(COST + 1);
        await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), owner.token).expect(403);

        const res = await unlock(owner).expect(200);
        expect(res.body).toEqual({ purpose: 'LISTING_QUOTA', ladders_available: 1, featured_until: null, extra_listings: 1 });
        const spent = await ctx.prisma.reward.findMany({ where: { userId: owner.id, consumedAt: { not: null } } });
        expect(spent).toHaveLength(COST);
        expect(spent.every((r) => r.spentOn === RewardSpend.LISTING_QUOTA && r.propertyId === null)).toBe(true);

        const wallet = (await ctx.get('/wallet', owner.token).expect(200)).body;
        expect(wallet.ladder_tokens).toBe(1);
        expect(wallet.listing_quota).toMatchObject({ limit: 1, used: 1, extra: 1 });

        await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), owner.token).expect(201);
        await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), owner.token).expect(403);
      });

      it('does not let a second unlock pile up while an unused extra listing is still held', async () => {
        const { owner } = await holder(COST * 2);
        await unlock(owner).expect(200);
        const again = await unlock(owner).expect(409);
        expect(again.body.code).toBe('LISTING_QUOTA_NOT_EXHAUSTED');
        expect(await tokensOf(owner.id)).toBe(COST);
      });

      it('needs three ladders', async () => {
        const { owner } = await holder(COST - 1);
        const res = await unlock(owner).expect(409);
        expect(res.body).toMatchObject({ code: 'NOT_ENOUGH_LADDERS', needed: LADDERS_PER_LISTING });
        // Nothing was granted when the ladders fell short.
        expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).welcomeListingCredits).toBe(0);
        expect(await tokensOf(owner.id)).toBe(COST - 1);
      });

      it("gives an office a bonus listing once its plan's listings are used up, and refuses one without a running plan", async () => {
        const office = await ctx.agency('MONTHLY');
        await giveLadders(office.id, COST);
        expect((await unlock(office).expect(409)).body.code).toBe('LISTING_QUOTA_NOT_EXHAUSTED');

        const subscription = await ctx.prisma.subscription.findFirstOrThrow({ where: { agencyId: office.agencyId } });
        await ctx.prisma.subscription.update({ where: { id: subscription.id }, data: { listingsUsed: 8 } });
        const res = await unlock(office).expect(200);
        expect(res.body).toMatchObject({ purpose: 'LISTING_QUOTA', ladders_available: 0, extra_listings: 1 });
        expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: office.id } })).bonusListingCredits).toBe(1);
        await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), office.token).expect(201);

        const lapsed = await ctx.lapsedAgency();
        await giveLadders(lapsed.id, COST);
        expect((await unlock(lapsed).expect(403)).body.code).toBe('SUBSCRIPTION_REQUIRED');
        expect(await tokensOf(lapsed.id)).toBe(COST);
      });

      it('has nothing to unlock for an admin, whose listings are unlimited', async () => {
        const admin = await ctx.admin();
        await giveLadders(admin.id, COST);
        expect((await unlock(admin).expect(409)).body.code).toBe('LISTING_QUOTA_NOT_EXHAUSTED');
        expect(await tokensOf(admin.id)).toBe(COST);
      });

      it('grants one listing however many requests arrive together', async () => {
        const { owner } = await holder(COST * 3);
        const results = await Promise.all(Array.from({ length: 4 }, () => unlock(owner)));
        expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
        expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).welcomeListingCredits).toBe(1);
        expect(await tokensOf(owner.id, true)).toBe(COST);
      });
    });
  });
});
