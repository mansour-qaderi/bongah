import { MAX_FEEDBACK_PER_DAY } from '../src/feedback/feedback.service.js';
import { hasDb, TestContext } from './helpers.js';

describe.skipIf(!hasDb)('Feedback (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const message = 'نقشه در بخش ثبت آگهی کند باز می‌شود.';
  const send = (token: string | undefined, body: object) => ctx.post('/feedback', body, token);

  it('needs a signed-in account', async () => {
    await send(undefined, { category: 'SUGGESTION', message }).expect(401);
    expect(await ctx.prisma.feedback.count({ where: { message } })).toBe(0);
  });

  it('keeps the message, its kind and the app version for the team', async () => {
    const user = await ctx.user();
    const res = await send(user.token, { category: 'PROBLEM', message, app_version: '1.2.3' }).expect(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(Date.parse(res.body.created_at)).not.toBeNaN();

    const row = await ctx.prisma.feedback.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ userId: user.id, category: 'PROBLEM', message, appVersion: '1.2.3' });
  });

  it('works without an app version, and tidies the message', async () => {
    const user = await ctx.user();
    const res = await send(user.token, { category: 'PRAISE', message: '   برنامه   خیلی\n\n\n\nخوب است   ' }).expect(201);
    const row = await ctx.prisma.feedback.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.appVersion).toBeNull();
    expect(row.message).toBe('برنامه خیلی\n\nخوب است');
  });

  it.each([
    ['a message that is too short', { category: 'OTHER', message: 'سلام' }],
    ['a message that is too long', { category: 'OTHER', message: 'x'.repeat(1001) }],
    ['an unknown kind', { category: 'RUDE', message: 'برنامه خیلی خوب است' }],
    ['no kind', { message: 'برنامه خیلی خوب است' }],
    ['a field it does not take', { category: 'OTHER', message: 'برنامه خیلی خوب است', user_id: 'x' }],
    ['an over-long version', { category: 'OTHER', message: 'برنامه خیلی خوب است', app_version: 'v'.repeat(40) }],
  ])('rejects %s', async (_label, body) => {
    const user = await ctx.user();
    await send(user.token, body).expect(400);
    expect(await ctx.prisma.feedback.count({ where: { userId: user.id } })).toBe(0);
  });

  it('stops one person flooding the inbox', async () => {
    const user = await ctx.user();
    await ctx.prisma.feedback.createMany({
      data: Array.from({ length: MAX_FEEDBACK_PER_DAY }, () => ({ userId: user.id, category: 'OTHER' as const, message })),
    });
    const res = await send(user.token, { category: 'OTHER', message }).expect(429);
    expect(res.body.code).toBe('TOO_MUCH_FEEDBACK');
    // Somebody else is not held back by it.
    const other = await ctx.user();
    await send(other.token, { category: 'OTHER', message }).expect(201);
  });

  it('counts only the last day', async () => {
    const user = await ctx.user();
    await ctx.prisma.feedback.createMany({
      data: Array.from({ length: MAX_FEEDBACK_PER_DAY }, () => ({
        userId: user.id,
        category: 'OTHER' as const,
        message,
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      })),
    });
    await send(user.token, { category: 'OTHER', message }).expect(201);
  });
});
