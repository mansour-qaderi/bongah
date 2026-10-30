import { hasDb, TestContext, type TestUser } from './helpers.js';

describe.skipIf(!hasDb)('Admin: feedback inbox and gifts (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;

  beforeAll(async () => {
    ctx = await TestContext.create();
    admin = await ctx.admin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /admin/feedback', () => {
    it('is for admins only', async () => {
      const user = await ctx.user();
      await ctx.get('/admin/feedback').expect(401);
      await ctx.get('/admin/feedback', user.token).expect(403);
    });

    it('lists what people wrote, newest first, with who sent it, and filters by kind and text', async () => {
      const sender = await ctx.user();
      const problem = 'نقشه در بخش ثبت آگهی کند باز می‌شود.';
      const praise = 'برنامه خیلی خوب و کاربردی است.';
      await ctx.post('/feedback', { category: 'PROBLEM', message: problem, app_version: '2.1.4' }, sender.token).expect(201);
      await ctx.post('/feedback', { category: 'PRAISE', message: praise }, sender.token).expect(201);

      const all = await ctx.get(`/admin/feedback?q=${encodeURIComponent(sender.phone)}`, admin.token).expect(200);
      expect(all.body.data.map((f: { message: string }) => f.message)).toEqual([praise, problem]);
      expect(all.body.data[1]).toMatchObject({
        category: 'PROBLEM',
        app_version: '2.1.4',
        user: { id: sender.id, phone_number: sender.phone },
      });

      const onlyProblems = await ctx.get(`/admin/feedback?category=PROBLEM&q=${encodeURIComponent(sender.phone)}`, admin.token).expect(200);
      expect(onlyProblems.body.data).toHaveLength(1);
      const byText = await ctx.get(`/admin/feedback?q=${encodeURIComponent('کاربردی')}`, admin.token).expect(200);
      expect(byText.body.data.some((f: { message: string }) => f.message === praise)).toBe(true);
      await ctx.get('/admin/feedback?category=RUDE', admin.token).expect(400);
    });
  });

  describe('POST /admin/feedback/:id/reply and GET /feedback/mine', () => {
    const send = async (token: string, message = 'نقشه در بخش ثبت آگهی کند باز می‌شود.') =>
      (await ctx.post('/feedback', { category: 'PROBLEM', message }, token).expect(201)).body.id as string;
    const reply = (id: string, body: object, token = admin.token) => ctx.post(`/admin/feedback/${id}/reply`, body, token);

    it('is for admins only', async () => {
      const user = await ctx.user();
      const id = await send(user.token);
      await ctx.post(`/admin/feedback/${id}/reply`, { message: 'سلام' }).expect(401);
      await reply(id, { message: 'سلام، ممنون' }, user.token).expect(403);
    });

    it('keeps the answer, writes an audit line, and shows it to the person under their own messages', async () => {
      const user = await ctx.user();
      const id = await send(user.token);
      const res = await reply(id, { message: '  سلام،   مشکل را بررسی کردیم.  ' }).expect(200);
      expect(res.body.item).toMatchObject({ id, reply: { message: 'سلام، مشکل را بررسی کردیم.' } });
      expect(typeof res.body.notified).toBe('boolean');

      const row = await ctx.prisma.feedback.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ adminReply: 'سلام، مشکل را بررسی کردیم.', repliedById: admin.id });
      expect(row.repliedAt).toBeInstanceOf(Date);
      const audit = await ctx.prisma.adminAuditLog.findFirst({ where: { action: 'FEEDBACK_REPLIED', targetId: id } });
      expect(audit).toMatchObject({ actorId: admin.id, targetType: 'feedback' });

      const mine = await ctx.get('/feedback/mine', user.token).expect(200);
      expect(mine.body[0]).toMatchObject({ id, reply: { message: 'سلام، مشکل را بررسی کردیم.' } });
      // Someone else sees none of it.
      const other = await ctx.user();
      expect((await ctx.get('/feedback/mine', other.token).expect(200)).body).toEqual([]);
      await ctx.get('/feedback/mine').expect(401);
    });

    it('can be written again, and lists show it in the admin inbox', async () => {
      const user = await ctx.user();
      const id = await send(user.token);
      await reply(id, { message: 'پاسخ اول' }).expect(200);
      await reply(id, { message: 'پاسخ دوم، کامل‌تر' }).expect(200);
      const list = await ctx.get(`/admin/feedback?q=${encodeURIComponent(user.phone)}`, admin.token).expect(200);
      expect(list.body.data[0].reply.message).toBe('پاسخ دوم، کامل‌تر');
    });

    it('refuses an empty answer, an unknown message and a bad id', async () => {
      const user = await ctx.user();
      const id = await send(user.token);
      await reply(id, { message: ' ' }).expect(400);
      await reply(id, { message: 'x'.repeat(1001) }).expect(400);
      await reply(id, { message: 'سلام', extra: 1 }).expect(400);
      await reply('00000000-0000-4000-8000-000000000000', { message: 'سلام' }).expect(404);
      await reply('not-a-uuid', { message: 'سلام' }).expect(400);
    });
  });

  describe('POST /admin/users/:id/gift', () => {
    const gift = (id: string, body: object, token = admin.token) => ctx.post(`/admin/users/${id}/gift`, body, token);

    it('is for admins only', async () => {
      const user = await ctx.user();
      await gift(user.id, { listing_credits: 1 }, user.token).expect(403);
    });

    it("adds free listings to a person's welcome credits and featured frames to theirs, and writes an audit line", async () => {
      const user = await ctx.user();
      const before = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const res = await gift(user.id, { listing_credits: 2, featured_credits: 1, note: 'Launch gift' }).expect(200);
      expect(res.body).toMatchObject({
        id: user.id,
        listing_credits: before.welcomeListingCredits + 2,
        featured_credits: before.featuredCredits + 1,
      });
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.welcomeListingCredits).toBe(before.welcomeListingCredits + 2);
      expect(row.featuredCredits).toBe(before.featuredCredits + 1);

      const log = await ctx.get(`/admin/audit-log?target_type=user&target_id=${user.id}`, admin.token).expect(200);
      expect(log.body.data[0]).toMatchObject({
        action: 'USER_GIFTED',
        actor: { id: admin.id },
        metadata: { listing_credits: 2, featured_credits: 1, note: 'Launch gift' },
      });
    });

    it("adds an office's free listings to its bonus listings, not the welcome credits", async () => {
      const office = await ctx.agency(true);
      const before = await ctx.prisma.user.findUniqueOrThrow({ where: { id: office.id } });
      await gift(office.id, { listing_credits: 3 }).expect(200);
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: office.id } });
      expect(row.bonusListingCredits).toBe(before.bonusListingCredits + 3);
      expect(row.welcomeListingCredits).toBe(before.welcomeListingCredits);
    });

    it.each([
      ['nothing at all', {}],
      ['two zeros', { listing_credits: 0, featured_credits: 0 }],
      ['more than one gift may hold', { listing_credits: 51 }],
      ['a negative number', { featured_credits: -1 }],
      ['a field it does not take', { listing_credits: 1, role: 'ADMIN' }],
    ])('refuses %s', async (_label, body) => {
      const user = await ctx.user();
      await gift(user.id, body).expect(400);
    });

    it('answers 404 for an account that does not exist', async () => {
      await gift('00000000-0000-4000-8000-000000000000', { listing_credits: 1 }).expect(404);
    });
  });
});
