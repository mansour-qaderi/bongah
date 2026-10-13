import { randomUUID } from 'node:crypto';
import type { DailyQuote, MorningPushDay, Paginated, TestPushResult, User, WelcomeQuote } from '@bongah/shared-types';
import { PUSH_MAX_DEVICES_PER_USER } from '@bongah/shared-types';
import { kabulDayKey } from '../src/contact/contact.time.js';
import { MockPushGateway } from '../src/notification/mock-push.gateway.js';
import { MORNING_PUSH_BATCH, MorningPushService } from '../src/notification/morning-push.service.js';
import { MorningPushScheduler } from '../src/notification/morning-push.scheduler.js';
import { PUSH_GATEWAY } from '../src/notification/push.gateway.js';
import type { NotificationSettings } from '../src/notification/notification.config.js';
import { hasDb, TestContext, type TestUser } from './helpers.js';

const DAY = 86_400_000;
/** Far from today, so the runs below never touch rows the stats test seeds for the real "today". */
const BASE = Date.parse('2031-03-10T04:00:00Z'); // 08:30 in Kabul

describe.skipIf(!hasDb)('Welcome card, preferences, devices and the morning push (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let gateway: MockPushGateway;
  let push: MorningPushService;

  beforeAll(async () => {
    ctx = await TestContext.create();
    admin = await ctx.admin();
    gateway = ctx.app.get<MockPushGateway>(PUSH_GATEWAY);
    push = ctx.app.get(MorningPushService);
    // The run tests reserve EVERY eligible user in the database, so they need a database that holds nothing else:
    // a dedicated test database (TEST_DATABASE_URL), not a development one.
    const foreign = await Promise.all([ctx.prisma.dailyQuote.count(), ctx.prisma.pushDevice.count(), ctx.prisma.morningPushSend.count()]);
    if (foreign.some((count) => count > 0)) {
      throw new Error(
        'notification.e2e-spec.ts needs a database without quotes, push devices or morning-push rows (found ' +
          `${foreign.join('/')}). Point DATABASE_URL/TEST_DATABASE_URL at a dedicated test database, or clear leftovers from a crashed run.`,
      );
    }
  });
  afterAll(async () => {
    await ctx.prisma.dailyQuote.deleteMany();
    await ctx.close();
  });
  beforeEach(async () => {
    gateway.reset();
    await ctx.prisma.dailyQuote.deleteMany();
    // Earlier tests' users must not be pushed (or counted) by this test's runs.
    await ctx.prisma.morningPushSend.deleteMany({ where: { userId: { in: ctx.userIds } } });
    await ctx.prisma.pushDevice.deleteMany({ where: { userId: { in: ctx.userIds } } });
  });

  const token = () => `fcm-token-${randomUUID()}`;
  const quote = (text: string, extra: Partial<{ category: 'WELCOME_ONBOARDING' | 'MORNING_NOTIFICATION'; language: string; isActive: boolean; createdAt: Date }> = {}) =>
    ctx.prisma.dailyQuote.create({
      data: { text, category: extra.category ?? 'MORNING_NOTIFICATION', language: extra.language ?? 'prs', isActive: extra.isActive ?? true, ...(extra.createdAt ? { createdAt: extra.createdAt } : {}) },
    });
  const device = (userId: string, extra: Partial<{ token: string; language: string; lastSeenAt: Date }> = {}) =>
    ctx.prisma.pushDevice.create({
      data: { userId, token: extra.token ?? token(), platform: 'ANDROID', language: extra.language ?? 'prs', ...(extra.lastSeenAt ? { lastSeenAt: extra.lastSeenAt } : {}) },
    });
  /** A user who would get the push: opted in (the default), not banned, one phone. */
  const recipient = async (language = 'prs') => {
    const user = await ctx.user();
    const phone = await device(user.id, { language });
    return { ...user, deviceToken: phone.token };
  };
  const sentTo = (deviceToken: string) => gateway.sent.filter((message) => message.token === deviceToken);

  // ───────────────────────── quote templates (admin) ─────────────────────────

  describe('admin quote templates', () => {
    it('is for admins only', async () => {
      const user = await ctx.user();
      await ctx.get('/admin/quotes').expect(401);
      await ctx.get('/admin/quotes', user.token).expect(403);
      await ctx.post('/admin/quotes', { text: 'سلام', category: 'WELCOME_ONBOARDING' }, user.token).expect(403);
      await ctx.get('/admin/notifications/morning', user.token).expect(403);
      await ctx.post('/admin/notifications/test', {}, user.token).expect(403);
    });

    it('creates with defaults (Dari, active), tidies whitespace, and writes an audit line', async () => {
      const res = await ctx.post('/admin/quotes', { text: '  شکرگزاری   کلید  آرامش است ', category: 'MORNING_NOTIFICATION' }, admin.token).expect(201);
      const created = res.body as DailyQuote;
      expect(created).toMatchObject({ text: 'شکرگزاری کلید آرامش است', category: 'MORNING_NOTIFICATION', language: 'prs', is_active: true });
      const audit = await ctx.prisma.adminAuditLog.findFirstOrThrow({ where: { action: 'QUOTE_CREATED', targetId: created.id } });
      expect(audit).toMatchObject({ actorId: admin.id, targetType: 'quote', metadata: { category: 'MORNING_NOTIFICATION', language: 'prs' } });
    });

    it('refuses bad input: blank, too long, unknown category or language, unknown fields', async () => {
      const bad = async (body: object) => ctx.post('/admin/quotes', body, admin.token).expect(400);
      await bad({ text: '   ', category: 'WELCOME_ONBOARDING' });
      await bad({ text: 'ab', category: 'WELCOME_ONBOARDING' });
      await bad({ text: 'ا'.repeat(501), category: 'WELCOME_ONBOARDING' });
      await bad({ text: 'متن خوب', category: 'EVENING' });
      await bad({ text: 'متن خوب', category: 'WELCOME_ONBOARDING', language: 'en' });
      await bad({ text: 'متن خوب', category: 'WELCOME_ONBOARDING', id: randomUUID() });
      await bad({ category: 'WELCOME_ONBOARDING' });
      // The longest allowed text is accepted.
      await ctx.post('/admin/quotes', { text: 'ا'.repeat(500), category: 'WELCOME_ONBOARDING' }, admin.token).expect(201);
    });

    it('lists newest first with filters, search and pages', async () => {
      const t0 = Date.now();
      const a = await quote('یک آرامش', { category: 'WELCOME_ONBOARDING', createdAt: new Date(t0 - 3000) });
      const b = await quote('دو سپاس', { category: 'MORNING_NOTIFICATION', language: 'ps', createdAt: new Date(t0 - 2000) });
      const c = await quote('سه امید', { category: 'MORNING_NOTIFICATION', isActive: false, createdAt: new Date(t0 - 1000) });

      const ids = (res: { body: Paginated<DailyQuote> }) => res.body.data.map((q) => q.id);
      expect(ids(await ctx.get('/admin/quotes', admin.token).expect(200))).toEqual([c.id, b.id, a.id]);
      expect(ids(await ctx.get('/admin/quotes?category=MORNING_NOTIFICATION', admin.token).expect(200))).toEqual([c.id, b.id]);
      expect(ids(await ctx.get('/admin/quotes?language=ps', admin.token).expect(200))).toEqual([b.id]);
      expect(ids(await ctx.get('/admin/quotes?is_active=false', admin.token).expect(200))).toEqual([c.id]);
      expect(ids(await ctx.get(`/admin/quotes?q=${encodeURIComponent('سپاس')}`, admin.token).expect(200))).toEqual([b.id]);
      const page = await ctx.get('/admin/quotes?limit=2&page=2', admin.token).expect(200);
      expect(ids(page)).toEqual([a.id]);
      expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, total_pages: 2 });
      await ctx.get('/admin/quotes?colour=red', admin.token).expect(400);
    });

    it('edits any subset, refuses an empty edit, and deletes; unknown ids are 404', async () => {
      const row = await quote('متن اول');
      const edited = await ctx.patch(`/admin/quotes/${row.id}`, { is_active: false }, admin.token).expect(200);
      expect(edited.body).toMatchObject({ id: row.id, text: 'متن اول', is_active: false });
      const renamed = await ctx.patch(`/admin/quotes/${row.id}`, { text: 'متن دوم', language: 'ps' }, admin.token).expect(200);
      expect(renamed.body).toMatchObject({ text: 'متن دوم', language: 'ps', is_active: false });
      await ctx.patch(`/admin/quotes/${row.id}`, {}, admin.token).expect(400);
      await ctx.patch(`/admin/quotes/${row.id}`, { language: 'fr' }, admin.token).expect(400);
      await ctx.patch(`/admin/quotes/${randomUUID()}`, { is_active: true }, admin.token).expect(404);
      await ctx.patch('/admin/quotes/not-a-uuid', { is_active: true }, admin.token).expect(400);

      await ctx.del(`/admin/quotes/${row.id}`, admin.token).expect(204);
      await ctx.del(`/admin/quotes/${row.id}`, admin.token).expect(404);
      expect(await ctx.prisma.dailyQuote.count({ where: { id: row.id } })).toBe(0);
      const actions = await ctx.prisma.adminAuditLog.findMany({ where: { targetId: row.id }, orderBy: { createdAt: 'asc' } });
      expect(actions.map((entry) => entry.action)).toEqual(['QUOTE_UPDATED', 'QUOTE_UPDATED', 'QUOTE_DELETED']);
    });
  });

  // ───────────────────────── the welcome card's text ─────────────────────────

  describe('GET /quotes/welcome', () => {
    it('needs a signed-in user', async () => {
      await ctx.get('/quotes/welcome').expect(401);
    });

    it('answers 404 NO_ACTIVE_QUOTE when there is nothing to show, so the app uses its built-in text', async () => {
      const user = await ctx.user();
      const res = await ctx.get('/quotes/welcome', user.token).expect(404);
      expect(res.body.code).toBe('NO_ACTIVE_QUOTE');
    });

    it('serves only an active welcome quote in the asked language (Dari by default), never another kind or language', async () => {
      const user = await ctx.user();
      await quote('پیام صبحگاهی', { category: 'MORNING_NOTIFICATION' });
      await quote('غیرفعال', { category: 'WELCOME_ONBOARDING', isActive: false });
      await quote('پښتو ښه راغلاست', { category: 'WELCOME_ONBOARDING', language: 'ps' });
      await ctx.get('/quotes/welcome', user.token).expect(404);
      await ctx.get('/quotes/welcome?language=prs', user.token).expect(404);

      const dari = await quote('خوش آمدید', { category: 'WELCOME_ONBOARDING' });
      const res = await ctx.get('/quotes/welcome', user.token).expect(200);
      expect(res.body as WelcomeQuote).toEqual({ id: dari.id, text: 'خوش آمدید', language: 'prs' });
      expect(res.headers['cache-control']).toBe('no-store');
      const pashto = await ctx.get('/quotes/welcome?language=ps', user.token).expect(200);
      expect(pashto.body).toMatchObject({ text: 'پښتو ښه راغلاست', language: 'ps' });
      await ctx.get('/quotes/welcome?language=en', user.token).expect(400);
    });

    it('rotates among the active welcome quotes', async () => {
      const user = await ctx.user();
      const rows = await Promise.all(['الف خوب', 'ب خوب', 'ج خوب'].map((text) => quote(text, { category: 'WELCOME_ONBOARDING' })));
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) seen.add((await ctx.get('/quotes/welcome', user.token).expect(200)).body.id as string);
      expect([...seen].sort()).toEqual(rows.map((row) => row.id).sort());
    });
  });

  // ───────────────────────── preferences ─────────────────────────

  describe('PATCH /users/me/preferences', () => {
    it('is for signed-in users', async () => {
      await ctx.patch('/users/me/preferences', { enable_daily_motivation: false }).expect(401);
    });

    it('a new account starts opted in and not yet welcomed, at login and at /users/me', async () => {
      const signedUp = await ctx.signUp();
      expect(signedUp.response.user).toMatchObject({ enable_daily_motivation: true, has_seen_welcome: false });
      expect((await ctx.get('/users/me', signedUp.token).expect(200)).body).toMatchObject({ enable_daily_motivation: true, has_seen_welcome: false });
    });

    it('switches the morning push off and on, and the welcome flag only ever goes up', async () => {
      const user = await ctx.user();
      const off = await ctx.patch('/users/me/preferences', { enable_daily_motivation: false }, user.token).expect(200);
      expect(off.body as User).toMatchObject({ id: user.id, enable_daily_motivation: false, has_seen_welcome: false });

      const seen = await ctx.patch('/users/me/preferences', { has_seen_welcome: true }, user.token).expect(200);
      expect(seen.body).toMatchObject({ enable_daily_motivation: false, has_seen_welcome: true });
      // Repeating it (a retry) is fine, and never undoes the other setting.
      await ctx.patch('/users/me/preferences', { has_seen_welcome: true }, user.token).expect(200);

      const both = await ctx.patch('/users/me/preferences', { enable_daily_motivation: true, has_seen_welcome: true }, user.token).expect(200);
      expect(both.body).toMatchObject({ enable_daily_motivation: true, has_seen_welcome: true });
      expect((await ctx.get('/users/me', user.token).expect(200)).body).toMatchObject({ enable_daily_motivation: true, has_seen_welcome: true });
    });

    it('refuses to un-see the welcome, empty edits, wrong types and fields that are not preferences', async () => {
      const user = await ctx.user();
      await ctx.patch('/users/me/preferences', { has_seen_welcome: false }, user.token).expect(400);
      await ctx.patch('/users/me/preferences', {}, user.token).expect(400);
      await ctx.patch('/users/me/preferences', { enable_daily_motivation: 'yes' }, user.token).expect(400);
      await ctx.patch('/users/me/preferences', { enable_daily_motivation: false, role: 'ADMIN' }, user.token).expect(400);
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row).toMatchObject({ role: 'USER', enableDailyMotivation: true, hasSeenWelcome: false });
    });

    it('is refused for a banned account', async () => {
      const user = await ctx.user();
      await ctx.prisma.user.update({ where: { id: user.id }, data: { bannedAt: new Date() } });
      await ctx.patch('/users/me/preferences', { enable_daily_motivation: false }, user.token).expect(403);
    });
  });

  // ───────────────────────── phones ─────────────────────────

  describe('push devices', () => {
    const register = (user: TestUser, body: object) => ctx.put('/notifications/devices', body, user.token);

    it('needs a signed-in user and a sensible body', async () => {
      const user = await ctx.user();
      await ctx.put('/notifications/devices', { token: token(), platform: 'ANDROID' }).expect(401);
      await register(user, { token: 'short', platform: 'ANDROID' }).expect(400);
      await register(user, { token: token(), platform: 'WINDOWS' }).expect(400);
      await register(user, { token: token(), platform: 'IOS', language: 'en' }).expect(400);
      await register(user, { token: 'has spaces in it that no token has', platform: 'IOS' }).expect(400);
      await register(user, { token: token(), platform: 'IOS', user_id: randomUUID() }).expect(400);
      expect(await ctx.prisma.pushDevice.count({ where: { userId: user.id } })).toBe(0);
    });

    it('registers (Dari by default), updates in place when repeated, and forgets on sign-out', async () => {
      const user = await ctx.user();
      const t = token();
      await register(user, { token: t, platform: 'ANDROID' }).expect(204);
      await register(user, { token: t, platform: 'ANDROID', language: 'ps' }).expect(204);
      const rows = await ctx.prisma.pushDevice.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ token: t, platform: 'ANDROID', language: 'ps' });

      await ctx.delWith('/notifications/devices', { token: t }, user.token).expect(204);
      expect(await ctx.prisma.pushDevice.count({ where: { userId: user.id } })).toBe(0);
      await ctx.delWith('/notifications/devices', { token: t }, user.token).expect(204); // already gone: still fine
      await ctx.delWith('/notifications/devices', { token: t }).expect(401);
    });

    it('moves a token to whoever signs in on that phone now, and one user cannot remove another user\'s phone', async () => {
      const first = await ctx.user();
      const second = await ctx.user();
      const t = token();
      await register(first, { token: t, platform: 'IOS' }).expect(204);
      await register(second, { token: t, platform: 'IOS' }).expect(204);
      expect((await ctx.prisma.pushDevice.findUniqueOrThrow({ where: { token: t } })).userId).toBe(second.id);
      expect(await ctx.prisma.pushDevice.count({ where: { token: t } })).toBe(1);

      await ctx.delWith('/notifications/devices', { token: t }, first.token).expect(204);
      expect(await ctx.prisma.pushDevice.count({ where: { token: t } })).toBe(1);
    });

    it(`keeps at most ${PUSH_MAX_DEVICES_PER_USER} phones per user, dropping the one seen longest ago`, async () => {
      const user = await ctx.user();
      const tokens: string[] = [];
      for (let i = 0; i < PUSH_MAX_DEVICES_PER_USER; i++) {
        tokens.push((await device(user.id, { lastSeenAt: new Date(Date.now() - (10 - i) * 60_000) })).token);
      }
      const newest = token();
      await register(user, { token: newest, platform: 'ANDROID' }).expect(204);
      const left = (await ctx.prisma.pushDevice.findMany({ where: { userId: user.id } })).map((row) => row.token);
      expect(left).toHaveLength(PUSH_MAX_DEVICES_PER_USER);
      expect(left).toContain(newest);
      expect(left).not.toContain(tokens[0]);
    });
  });

  // ───────────────────────── the morning run ─────────────────────────

  describe('the morning push run', () => {
    it('does nothing, and reserves nobody, while there is no active morning quote', async () => {
      const user = await recipient();
      await quote('پیام خوش آمد', { category: 'WELCOME_ONBOARDING' });
      await quote('غیرفعال', { isActive: false });
      const run = await push.runMorningPush(new Date(BASE));
      expect(run).toMatchObject({ skipped: 'NO_QUOTES', claimed: 0, sent: 0 });
      expect(gateway.sent).toHaveLength(0);
      expect(await ctx.prisma.morningPushSend.count({ where: { userId: user.id } })).toBe(0);
    });

    it('sends today\'s quote to opted-in, not-banned users with a phone, and to nobody else', async () => {
      const q = await quote('شکرگزاری آغاز یک روز خوب است');
      const wanted = await recipient();
      const optedOut = await recipient();
      await ctx.prisma.user.update({ where: { id: optedOut.id }, data: { enableDailyMotivation: false } });
      const banned = await recipient();
      await ctx.prisma.user.update({ where: { id: banned.id }, data: { bannedAt: new Date() } });
      const noPhone = await ctx.user();

      const run = await push.runMorningPush(new Date(BASE));
      expect(run).toMatchObject({ day: '2031-03-10', claimed: 1, sent: 1, failed: 0, retryable: 0, aborted: false });
      expect(sentTo(wanted.deviceToken)).toEqual([
        { token: wanted.deviceToken, title: 'صبح بخیر', body: 'شکرگزاری آغاز یک روز خوب است', data: { type: 'MORNING_QUOTE' }, ttlSeconds: 10_800 },
      ]);
      expect(sentTo(optedOut.deviceToken)).toHaveLength(0);
      expect(sentTo(banned.deviceToken)).toHaveLength(0);
      expect(await ctx.prisma.morningPushSend.count({ where: { userId: { in: [optedOut.id, banned.id, noPhone.id] } } })).toBe(0);

      const row = await ctx.prisma.morningPushSend.findFirstOrThrow({ where: { userId: wanted.id } });
      expect(row).toMatchObject({ status: 'SENT', quoteId: q.id, error: null });
      expect(row.day.toISOString().slice(0, 10)).toBe('2031-03-10');
    });

    it('sends each user once a day however often it runs, and again the next Kabul day', async () => {
      await quote('یک پیام خوب');
      const user = await recipient();
      await push.runMorningPush(new Date(BASE));
      const again = await push.runMorningPush(new Date(BASE + 10 * 60_000));
      expect(again).toMatchObject({ claimed: 0, sent: 0 });
      expect(sentTo(user.deviceToken)).toHaveLength(1);

      await push.runMorningPush(new Date(BASE + DAY));
      expect(sentTo(user.deviceToken)).toHaveLength(2);
    });

    it('treats Kabul midnight as the day boundary, not UTC midnight', async () => {
      await quote('یک پیام خوب');
      const user = await recipient();
      const lastSecond = Date.parse('2031-03-10T19:29:59Z'); // 23:59:59 in Kabul, still the 10th
      const midnight = Date.parse('2031-03-10T19:30:00Z'); // 00:00:00 in Kabul on the 11th
      expect((await push.runMorningPush(new Date(lastSecond - 60_000))).day).toBe('2031-03-10');
      expect((await push.runMorningPush(new Date(lastSecond))).claimed).toBe(0);
      expect((await push.runMorningPush(new Date(midnight))).day).toBe('2031-03-11');
      expect(sentTo(user.deviceToken)).toHaveLength(2);
    });

    it('never double-sends when several runs start together (several servers, or a slow tick)', async () => {
      await quote('یک پیام خوب');
      const users = await Promise.all([recipient(), recipient(), recipient(), recipient(), recipient()]);
      const runs = await Promise.all([1, 2, 3, 4].map(() => push.runMorningPush(new Date(BASE))));
      expect(runs.reduce((total, run) => total + run.claimed, 0)).toBe(5);
      expect(runs.reduce((total, run) => total + run.sent, 0)).toBe(5);
      for (const user of users) expect(sentTo(user.deviceToken)).toHaveLength(1);
    });

    it(`reaches everyone when there are more users than one batch (${MORNING_PUSH_BATCH})`, async () => {
      await quote('یک پیام خوب');
      const total = MORNING_PUSH_BATCH * 2 + 7;
      const prefix = `+93799${String(process.pid % 100).padStart(2, '0')}`;
      const users = Array.from({ length: total }, (_, i) => ({ id: randomUUID(), phoneNumber: `${prefix}${String(i).padStart(5, '0')}` }));
      await ctx.prisma.user.createMany({ data: users });
      ctx.userIds.push(...users.map((user) => user.id));
      await ctx.prisma.pushDevice.createMany({
        data: users.map((user) => ({ userId: user.id, token: `bulk-${user.id}`, platform: 'ANDROID' as const })),
      });

      const run = await push.runMorningPush(new Date(BASE));
      expect(run).toMatchObject({ claimed: total, sent: total, failed: 0 });
      expect(new Set(gateway.sent.map((message) => message.token)).size).toBe(total);
      expect(await ctx.prisma.morningPushSend.count({ where: { userId: { in: users.map((user) => user.id) }, status: 'SENT' } })).toBe(total);
      // Don't leave a thousand users for the tests that follow.
      await ctx.prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    }, 60_000);

    describe('which quote', () => {
      it('rotates through the active quotes day by day, the same for everyone on the same day', async () => {
        const t0 = Date.now();
        await quote('پیام یک', { createdAt: new Date(t0 - 3000) });
        await quote('پیام دو', { createdAt: new Date(t0 - 2000) });
        await quote('پیام سه', { createdAt: new Date(t0 - 1000) });
        const one = await recipient();
        const two = await recipient();

        const bodies: string[] = [];
        for (let day = 0; day < 6; day++) {
          gateway.reset();
          await push.runMorningPush(new Date(BASE + day * DAY));
          expect(sentTo(one.deviceToken)[0]?.body).toBe(sentTo(two.deviceToken)[0]?.body);
          bodies.push(sentTo(one.deviceToken)[0]!.body);
        }
        // Three quotes take turns: a cycle of three, and the cycle repeats.
        expect(new Set(bodies.slice(0, 3)).size).toBe(3);
        expect(bodies.slice(3)).toEqual(bodies.slice(0, 3));
      });

      it('uses the language of the phone, falls back to Dari, then to any language, and skips inactive quotes', async () => {
        const dari = await recipient('prs');
        const pashto = await recipient('ps');
        await quote('پیام دری');
        await quote('د پښتو پیغام', { language: 'ps' });
        await quote('غیرفعال دری', { isActive: false });
        await push.runMorningPush(new Date(BASE));
        expect(sentTo(dari.deviceToken)[0]).toMatchObject({ title: 'صبح بخیر', body: 'پیام دری' });
        expect(sentTo(pashto.deviceToken)[0]).toMatchObject({ title: 'سهار مو په خیر', body: 'د پښتو پیغام' });

        // Pashto phone, only a Dari quote exists: it still gets one.
        gateway.reset();
        await ctx.prisma.dailyQuote.deleteMany({ where: { language: 'ps' } });
        await push.runMorningPush(new Date(BASE + DAY));
        expect(sentTo(pashto.deviceToken)[0]?.body).toBe('پیام دری');

        // Dari phone, only a Pashto quote exists: it still gets one.
        gateway.reset();
        await ctx.prisma.dailyQuote.deleteMany();
        await quote('یوازې پښتو', { language: 'ps' });
        await push.runMorningPush(new Date(BASE + 2 * DAY));
        expect(sentTo(dari.deviceToken)[0]?.body).toBe('یوازې پښتو');
      });

      it('uses the phone seen most recently when a user has several, but pushes all of them', async () => {
        await quote('پیام دری');
        await quote('د پښتو پیغام', { language: 'ps' });
        const user = await ctx.user();
        const old = await device(user.id, { language: 'prs', lastSeenAt: new Date(Date.now() - 5 * DAY) });
        const recent = await device(user.id, { language: 'ps' });
        const run = await push.runMorningPush(new Date(BASE));
        expect(run).toMatchObject({ claimed: 1, sent: 1 });
        expect(sentTo(old.token)[0]?.body).toBe('د پښتو پیغام');
        expect(sentTo(recent.token)[0]?.body).toBe('د پښتو پیغام');
      });

      it('remembers which quote was sent even after an admin deletes it', async () => {
        const q = await quote('یک پیام خوب');
        const user = await recipient();
        await push.runMorningPush(new Date(BASE));
        await ctx.del(`/admin/quotes/${q.id}`, admin.token).expect(204);
        const row = await ctx.prisma.morningPushSend.findFirstOrThrow({ where: { userId: user.id } });
        expect(row).toMatchObject({ status: 'SENT', quoteId: null });
      });
    });

    describe('when the push provider says no', () => {
      it('forgets a dead token (app uninstalled), records the failure, and does not retry it', async () => {
        await quote('یک پیام خوب');
        const user = await recipient();
        gateway.failWith(user.deviceToken, 'UNREGISTERED');
        const run = await push.runMorningPush(new Date(BASE));
        expect(run).toMatchObject({ claimed: 1, sent: 0, failed: 1, retryable: 0 });
        expect(await ctx.prisma.pushDevice.count({ where: { userId: user.id } })).toBe(0);
        expect(await ctx.prisma.morningPushSend.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({ status: 'FAILED', error: 'UNREGISTERED' });
        expect((await push.runMorningPush(new Date(BASE + 600_000))).claimed).toBe(0);
      });

      it('keeps a token the provider merely refused (INVALID), and counts the user as failed', async () => {
        await quote('یک پیام خوب');
        const user = await recipient();
        gateway.failWith(user.deviceToken, 'INVALID');
        await push.runMorningPush(new Date(BASE));
        expect(await ctx.prisma.pushDevice.count({ where: { userId: user.id } })).toBe(1);
        expect(await ctx.prisma.morningPushSend.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({ status: 'FAILED', error: 'INVALID' });
      });

      it('counts a user as sent when any one of their phones got it, and still forgets the dead one', async () => {
        await quote('یک پیام خوب');
        const user = await ctx.user();
        const dead = await device(user.id, { lastSeenAt: new Date(Date.now() - DAY) });
        const alive = await device(user.id);
        gateway.failWith(dead.token, 'UNREGISTERED');
        const run = await push.runMorningPush(new Date(BASE));
        expect(run).toMatchObject({ sent: 1, failed: 0 });
        expect(sentTo(alive.token)).toHaveLength(1);
        expect((await ctx.prisma.pushDevice.findMany({ where: { userId: user.id } })).map((row) => row.token)).toEqual([alive.token]);
      });

      it('gives the reservation back when the provider is only temporarily down, so the next run delivers', async () => {
        await quote('یک پیام خوب');
        const user = await recipient();
        gateway.failWith(null, 'TRANSIENT');
        const first = await push.runMorningPush(new Date(BASE));
        expect(first).toMatchObject({ claimed: 1, sent: 0, failed: 0, retryable: 1, aborted: false });
        expect(await ctx.prisma.morningPushSend.count({ where: { userId: user.id } })).toBe(0);
        expect(await ctx.prisma.pushDevice.count({ where: { userId: user.id } })).toBe(1);

        gateway.reset();
        const second = await push.runMorningPush(new Date(BASE + 600_000));
        expect(second).toMatchObject({ claimed: 1, sent: 1 });
        expect(sentTo(user.deviceToken)).toHaveLength(1);
      });

      it('stops at once when the provider rejects our credentials, and leaves everyone for the next run', async () => {
        await quote('یک پیام خوب');
        const users = await Promise.all(Array.from({ length: 12 }, () => recipient()));
        gateway.failWith(null, 'AUTH');
        const run = await push.runMorningPush(new Date(BASE));
        expect(run.aborted).toBe(true);
        expect(run.sent).toBe(0);
        expect(run.failed).toBe(0);
        expect(await ctx.prisma.morningPushSend.count({ where: { userId: { in: users.map((u) => u.id) } } })).toBe(0);

        gateway.reset();
        const fixed = await push.runMorningPush(new Date(BASE + 600_000));
        expect(fixed).toMatchObject({ claimed: 12, sent: 12, aborted: false });
      });
    });

    it('does nothing when pushes are switched off', async () => {
      await quote('یک پیام خوب');
      const user = await recipient();
      const off = new MorningPushService(ctx.prisma, { provider: 'off', fcm: null, schedulerEnabled: true }, gateway);
      expect(await off.runMorningPush(new Date(BASE))).toMatchObject({ skipped: 'PUSH_DISABLED', claimed: 0 });
      expect(sentTo(user.deviceToken)).toHaveLength(0);
      await expect(off.sendTest(user.id)).rejects.toMatchObject({ response: { code: 'PUSH_DISABLED' } });
    });

    it('deletes reservations older than 30 days and keeps newer ones', async () => {
      await quote('یک پیام خوب');
      const user = await ctx.user();
      const day = (offset: number) => new Date(Date.UTC(2031, 2, 10) - offset * DAY);
      await ctx.prisma.morningPushSend.createMany({
        data: [31, 30, 29, 5].map((offset) => ({ day: day(offset), userId: user.id, status: 'SENT' as const })),
      });
      await push.runMorningPush(new Date(BASE));
      const kept = await ctx.prisma.morningPushSend.findMany({ where: { userId: user.id }, orderBy: { day: 'asc' } });
      expect(kept.map((row) => row.day.toISOString().slice(0, 10))).toEqual(['2031-02-08', '2031-02-09', '2031-03-05']);
    });
  });

  // ───────────────────────── the timer ─────────────────────────

  describe('the scheduler', () => {
    const on: NotificationSettings = { provider: 'mock', fcm: null, schedulerEnabled: true };

    it('does not run in this environment (SCHEDULER_ENABLED=false), so a test run can never fire a real 08:00', async () => {
      await quote('یک پیام خوب');
      const user = await recipient();
      await ctx.app.get(MorningPushScheduler).tick();
      expect(sentTo(user.deviceToken)).toHaveLength(0);
    });

    it('runs the push when enabled, and a tick that starts while another is still running is skipped', async () => {
      await quote('یک پیام خوب');
      const user = await recipient();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let calls = 0;
      const slow = {
        runMorningPush: async () => {
          calls++;
          await gate;
          return { day: 'x', claimed: 0, sent: 0, failed: 0, retryable: 0, aborted: false };
        },
      } as unknown as MorningPushService;
      const scheduler = new MorningPushScheduler(slow, on);
      const first = scheduler.tick();
      await scheduler.tick(); // overlaps: skipped immediately
      expect(calls).toBe(1);
      release();
      await first;
      await scheduler.tick();
      expect(calls).toBe(2);

      // And for real, with the real service: the current moment's Kabul day gets the push.
      const real = new MorningPushScheduler(push, on);
      await real.tick();
      expect(sentTo(user.deviceToken)).toHaveLength(1);
    });

    it('a failing run is logged, not thrown, and the next tick is still allowed', async () => {
      let calls = 0;
      const broken = {
        runMorningPush: () => {
          calls++;
          return Promise.reject(new Error('database is down'));
        },
      } as unknown as MorningPushService;
      const scheduler = new MorningPushScheduler(broken, on);
      await expect(scheduler.tick()).resolves.toBeUndefined();
      await scheduler.tick();
      expect(calls).toBe(2);
    });

    it('is registered to fire every 10 minutes from 08:00 to 10:50 Kabul time', async () => {
      const { SchedulerRegistry } = await import('@nestjs/schedule');
      const job = ctx.app.get(SchedulerRegistry).getCronJob('morning-push');
      const next = job.nextDates(40).map((date) => (date as unknown as { toUTC: () => { toISO: () => string } }).toUTC().toISO());
      // Kabul = UTC+4:30, so 08:00 Kabul is 03:30 UTC and 10:50 Kabul is 06:20 UTC.
      const times = [...new Set(next.map((iso) => iso.slice(11, 16)))];
      expect(times).toEqual(['03:30', '03:40', '03:50', '04:00', '04:10', '04:20', '04:30', '04:40', '04:50', '05:00', '05:10', '05:20', '05:30', '05:40', '05:50', '06:00', '06:10', '06:20']);
    });
  });

  // ───────────────────────── admin: statistics and test push ─────────────────────────

  describe('admin notifications', () => {
    it('reports sent and failed per Kabul day for the last 14 days, oldest first', async () => {
      const user = await ctx.user();
      const other = await ctx.user();
      const third = await ctx.user();
      const today = kabulDayKey(new Date());
      const day = (ago: number) => new Date(today.getTime() - ago * DAY);
      await ctx.prisma.morningPushSend.createMany({
        data: [
          { day: day(0), userId: user.id, status: 'SENT' },
          { day: day(0), userId: other.id, status: 'FAILED', error: 'INVALID' },
          { day: day(0), userId: third.id, status: 'SENT' },
          { day: day(2), userId: user.id, status: 'SENT' },
          { day: day(13), userId: user.id, status: 'SENT' },
          { day: day(14), userId: user.id, status: 'SENT' }, // outside the window
        ],
      });
      const res = await ctx.get('/admin/notifications/morning', admin.token).expect(200);
      const days = res.body as MorningPushDay[];
      expect(days).toHaveLength(14);
      expect(days[13]).toEqual({ day: today.toISOString().slice(0, 10), claimed: 3, sent: 2, failed: 1 });
      expect(days[11]).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
      expect(days[0]).toMatchObject({ claimed: 1, sent: 1 });
      expect(days[5]).toMatchObject({ claimed: 0, sent: 0, failed: 0 });
      expect(days.map((d) => d.day)).toEqual(days.map((d) => d.day).sort());
    });

    it('sends a test push to the admin\'s own phones only, forgetting dead tokens', async () => {
      const mine = await device(admin.id);
      const dead = await device(admin.id);
      const stranger = await recipient();
      gateway.failWith(dead.token, 'UNREGISTERED');
      await quote('پیام آزمایشی');

      const res = await ctx.post('/admin/notifications/test', {}, admin.token).expect(200);
      expect(res.body as TestPushResult).toEqual({ devices: 2, delivered: 1, failed: 1 });
      expect(sentTo(mine.token)[0]).toMatchObject({ title: 'صبح بخیر', body: 'پیام آزمایشی' });
      expect(sentTo(stranger.deviceToken)).toHaveLength(0);
      expect(await ctx.prisma.pushDevice.count({ where: { token: dead.token } })).toBe(0);
      await ctx.prisma.pushDevice.deleteMany({ where: { userId: admin.id } });
    });

    it('still sends a test push when there is no morning quote yet, and reports zero phones plainly', async () => {
      expect((await ctx.post('/admin/notifications/test', {}, admin.token).expect(200)).body).toEqual({ devices: 0, delivered: 0, failed: 0 });
      const mine = await device(admin.id);
      await ctx.post('/admin/notifications/test', {}, admin.token).expect(200);
      expect(sentTo(mine.token)[0]?.body).toBeTruthy();
      await ctx.prisma.pushDevice.deleteMany({ where: { userId: admin.id } });
    });
  });

  it('a banned user keeps the toggle but stops being pushed, and signing out stops the push', async () => {
    await quote('یک پیام خوب');
    const user = await recipient();
    await ctx.delWith('/notifications/devices', { token: user.deviceToken }, user.token).expect(204);
    await push.runMorningPush(new Date(BASE));
    expect(sentTo(user.deviceToken)).toHaveLength(0);
  });
});
