import { randomInt } from 'node:crypto';
import { REFERRAL_CODE_ALPHABET } from '@bongah/validation';
import { PropertyStatus, RewardReason, RewardType } from '../src/generated/prisma/client.js';
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
  const listing = (id: string) => ctx.prisma.property.findUniqueOrThrow({ where: { id } });
  const redeem = (user: TestUser, propertyId: string) =>
    ctx.post('/rewards/ladder-tokens/redeem', { property_id: propertyId }, user.token);
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
    it('gives the new user and their inviter one free ladder token each, and links them', async () => {
      const referrer = await ctx.signUp();
      const friend = await ctx.signUp(await ctx.codeOf(referrer.id));

      expect(friend.response.is_new_user).toBe(true);
      expect(friend.response.referral_applied).toBe(true);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: friend.id } })).referredById).toBe(referrer.id);

      const rewards = await ctx.prisma.reward.findMany({ where: { inviteeId: friend.id }, orderBy: { reason: 'asc' } });
      expect(rewards).toHaveLength(2);
      expect(rewards).toEqual([
        expect.objectContaining({ userId: referrer.id, reason: RewardReason.REFERRER_BONUS, type: RewardType.LADDER_TOKEN, amount: 1, consumedAt: null }),
        expect.objectContaining({ userId: friend.id, reason: RewardReason.REFEREE_BONUS, type: RewardType.LADDER_TOKEN, amount: 1, consumedAt: null }),
      ]);
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

    it('gives the invited friend the token and the inviter nothing once the inviter reached the cap', async () => {
      const referrer = await ctx.signUp();
      const code = await ctx.codeOf(referrer.id);
      const friends: Awaited<ReturnType<typeof ctx.signUp>>[] = [];
      for (let i = 0; i < CAP + 1; i++) friends.push(await ctx.signUp(code));

      expect(friends.every((f) => f.response.referral_applied)).toBe(true);
      expect(await tokensOf(referrer.id)).toBe(CAP);
      for (const f of friends) expect(await tokensOf(f.id)).toBe(1);

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
      for (const f of friends) expect(await tokensOf(f.id)).toBe(1);
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
        stats: { invited_count: 0, rewarded_invites: 0, max_rewarded_invites: CAP, ladder_tokens_available: 0, ladder_tokens_earned: 0 },
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

    it("shows a friend their own welcome token, and doesn't mention who invited them", async () => {
      const referrer = await ctx.signUp();
      const friend = await ctx.signUp(await ctx.codeOf(referrer.id));
      const s = await summary(friend);
      expect(s.stats).toMatchObject({ invited_count: 0, ladder_tokens_available: 1, ladder_tokens_earned: 1 });
      expect(s.invited).toEqual([]);
      expect(s.rewards).toEqual([expect.objectContaining({ reason: 'REFEREE_BONUS', used_at: null })]);
    });

    it("never shows another user's friends", async () => {
      const [a, b] = [await ctx.signUp(), await ctx.signUp()];
      await ctx.signUp(await ctx.codeOf(a.id));
      expect((await summary(b)).invited).toEqual([]);
    });

    it('counts a spent token as earned but not available, and shows when it was used', async () => {
      const referrer = await ctx.signUp();
      await ctx.signUp(await ctx.codeOf(referrer.id));
      const home = await publish(referrer);
      await redeem(referrer, home.id).expect(200);
      const s = await summary(referrer);
      expect(s.stats).toMatchObject({ ladder_tokens_available: 0, ladder_tokens_earned: 1 });
      expect(s.rewards[0].used_at).toEqual(expect.any(String));
    });
  });

  describe('POST /rewards/ladder-tokens/redeem', () => {
    /** A user holding `tokens` free tokens (one per friend invited) and one listing. */
    const withTokens = async (tokens: number) => {
      const owner = await ctx.signUp();
      const code = await ctx.codeOf(owner.id);
      for (let i = 0; i < tokens; i++) await ctx.signUp(code);
      return { owner, property: await publish(owner) };
    };

    it('needs a token, and a listing id that is a uuid', async () => {
      await ctx.post('/rewards/ladder-tokens/redeem', { property_id: '00000000-0000-4000-8000-000000000000' }).expect(401);
      const user = await ctx.signUp();
      await redeem(user, 'nope').expect(400);
      await ctx.post('/rewards/ladder-tokens/redeem', {}, user.token).expect(400);
      await ctx.post('/rewards/ladder-tokens/redeem', { property_id: '00000000-0000-4000-8000-000000000000', extra: 1 }, user.token).expect(400);
    });

    it('moves the listing to the top of search and spends one token', async () => {
      const { owner, property } = await withTokens(2);
      const before = (await listing(property.id)).ladderedAt!;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const res = await redeem(owner, property.id).expect(200);
      const after = (await listing(property.id)).ladderedAt!;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
      expect(res.body).toEqual({ property_id: property.id, laddered_at: after.toISOString(), ladder_tokens_available: 1 });
      expect(await tokensOf(owner.id)).toBe(1);
      expect(await tokensOf(owner.id, true)).toBe(1);
    });

    it('spends the oldest token first and records the listing on it', async () => {
      const { owner, property } = await withTokens(2);
      const [oldest, newest] = await ctx.prisma.reward.findMany({ where: { userId: owner.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      await redeem(owner, property.id).expect(200);
      expect(await ctx.prisma.reward.findUniqueOrThrow({ where: { id: oldest.id } })).toMatchObject({ propertyId: property.id, consumedAt: expect.any(Date) });
      expect(await ctx.prisma.reward.findUniqueOrThrow({ where: { id: newest.id } })).toMatchObject({ propertyId: null, consumedAt: null });
    });

    it('lets a friend spend the welcome token on their own listing', async () => {
      const referrer = await ctx.signUp();
      const friend = await ctx.signUp(await ctx.codeOf(referrer.id));
      const home = await publish(friend);
      await redeem(friend, home.id).expect(200);
      expect(await tokensOf(friend.id)).toBe(0);
    });

    it('answers 409 NO_LADDER_TOKEN when there is none, and leaves the listing alone', async () => {
      const { owner, property } = await withTokens(0);
      const before = (await listing(property.id)).ladderedAt!;
      const res = await redeem(owner, property.id).expect(409);
      expect(res.body.code).toBe('NO_LADDER_TOKEN');
      expect((await listing(property.id)).ladderedAt).toEqual(before);
    });

    it("refuses someone else's listing (403) without spending the token", async () => {
      const [{ owner }, { property: theirs }] = [await withTokens(1), await withTokens(0)];
      await redeem(owner, theirs.id).expect(403);
      expect(await tokensOf(owner.id)).toBe(1);
    });

    it('refuses an archived or unknown listing (404) without spending the token', async () => {
      const { owner, property } = await withTokens(1);
      await ctx.del(`/properties/${property.id}`, owner.token).expect(204);
      expect((await listing(property.id)).status).toBe(PropertyStatus.ARCHIVED);
      await redeem(owner, property.id).expect(404);
      await redeem(owner, '00000000-0000-4000-8000-000000000000').expect(404);
      expect(await tokensOf(owner.id)).toBe(1);
    });

    it('cannot spend a token somebody else holds', async () => {
      const [{ owner: rich }, { owner: poor, property }] = [await withTokens(2), await withTokens(0)];
      await redeem(poor, property.id).expect(409);
      expect(await tokensOf(rich.id)).toBe(2);
    });

    it('spends one token once, however many requests arrive together', async () => {
      const { owner, property } = await withTokens(1);
      const results = await Promise.all(Array.from({ length: 6 }, () => redeem(owner, property.id)));
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409, 409]);
      expect(await tokensOf(owner.id, true)).toBe(1);
    });

    it('spends two different tokens when two requests arrive together and two are held', async () => {
      const { owner, property } = await withTokens(2);
      const results = await Promise.all([redeem(owner, property.id), redeem(owner, property.id)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await tokensOf(owner.id)).toBe(0);
      expect(await tokensOf(owner.id, true)).toBe(2);
    });
  });
});
