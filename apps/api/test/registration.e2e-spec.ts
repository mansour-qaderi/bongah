import { Role } from '../src/generated/prisma/client.js';
import { hasDb, TestContext } from './helpers.js';

const agencyBody = (overrides: Record<string, unknown> = {}) => ({
  agency_name: 'Noor Real Estate',
  license_photo: 'https://example.com/license.jpg',
  address: 'Shar-e-Naw, Kabul',
  description: 'Sales and rentals since 2012',
  ...overrides,
});

describe.skipIf(!hasDb)('Registration (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /users/me', () => {
    it('needs a token', async () => {
      await ctx.get('/users/me').expect(401);
    });

    it('returns the current record, including a role that changed after the token was issued', async () => {
      const user = await ctx.user();
      expect((await ctx.get('/users/me', user.token).expect(200)).body).toEqual({
        id: user.id,
        phone_number: user.phone,
        full_name: null,
        role: 'USER',
        avatar: null,
        enable_daily_motivation: true,
        has_seen_welcome: false,
        welcome_listing_credits: 0,
        bonus_listing_credits: 0,
        featured_credits: 0,
        first_subscription_bonus_available: true,
      });
      await ctx.post('/agencies/register', agencyBody(), user.token).expect(201);
      expect((await ctx.get('/users/me', user.token).expect(200)).body.role).toBe('AGENCY');
    });
  });

  describe('POST /users/register', () => {
    it('needs a token', async () => {
      await ctx.post('/users/register', { full_name: 'Ahmad Zia' }).expect(401);
    });

    it('sets the name, tidying whitespace, without touching phone or role', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/users/register', { full_name: '  Ahmad   Zia ' }, user.token).expect(200);
      expect(res.body).toEqual({
        id: user.id,
        phone_number: user.phone,
        full_name: 'Ahmad Zia',
        role: 'USER',
        avatar: null,
        enable_daily_motivation: true,
        has_seen_welcome: false,
        welcome_listing_credits: 0,
        bonus_listing_credits: 0,
        featured_credits: 0,
        first_subscription_bonus_available: true,
      });
    });

    it('keeps the avatar when omitted and clears it with null', async () => {
      const user = await ctx.user();
      await ctx.post('/users/register', { full_name: 'Ahmad Zia', avatar: 'https://example.com/me.png' }, user.token).expect(200);
      expect((await ctx.post('/users/register', { full_name: 'Ahmad Z' }, user.token).expect(200)).body.avatar).toBe('https://example.com/me.png');
      expect((await ctx.post('/users/register', { full_name: 'Ahmad Z', avatar: null }, user.token).expect(200)).body.avatar).toBeNull();
    });

    it('cannot be used to escalate: role and phone_number are rejected', async () => {
      const user = await ctx.user();
      await ctx.post('/users/register', { full_name: 'Ahmad Zia', role: 'ADMIN' }, user.token).expect(400);
      await ctx.post('/users/register', { full_name: 'Ahmad Zia', phone_number: '+93700000000' }, user.token).expect(400);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
    });

    it('validates the name and avatar', async () => {
      const user = await ctx.user();
      await ctx.post('/users/register', { full_name: 'A' }, user.token).expect(400);
      await ctx.post('/users/register', {}, user.token).expect(400);
      await ctx.post('/users/register', { full_name: 'Ahmad Zia', avatar: 'javascript:alert(1)' }, user.token).expect(400);
    });
  });

  describe('POST /agencies/register', () => {
    it('needs a token', async () => {
      await ctx.post('/agencies/register', agencyBody()).expect(401);
    });

    it('creates an unverified agency and switches the account to AGENCY', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/agencies/register', agencyBody(), user.token).expect(201);
      expect(res.body).toMatchObject({
        user_id: user.id,
        agency_name: 'Noor Real Estate',
        is_verified: false,
        lat: null, // the office pin comes later, with a subscription
        lng: null,
      });
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe(Role.AGENCY);
    });

    it('registers a given account at most once, even under concurrent requests', async () => {
      const user = await ctx.user();
      const results = await Promise.all(
        Array.from({ length: 4 }, () => ctx.post('/agencies/register', agencyBody(), user.token)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
      expect(await ctx.prisma.agency.count({ where: { userId: user.id } })).toBe(1);
    });

    it('does not let an admin be turned into an agency', async () => {
      const admin = await ctx.user(Role.ADMIN);
      await ctx.post('/agencies/register', agencyBody(), admin.token).expect(403);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe(Role.ADMIN);
    });

    it('registers without a licence photo (the web panel asks for none)', async () => {
      const user = await ctx.user();
      const { license_photo: _omitted, ...withoutPhoto } = agencyBody();
      const res = await ctx.post('/agencies/register', withoutPhoto, user.token).expect(201);
      expect(res.body.license_photo).toBe('');
      expect((await ctx.get('/users/me', user.token).expect(200)).body.role).toBe('AGENCY');
    });

    it('leaves the account unchanged when the request is invalid', async () => {
      const user = await ctx.user();
      for (const bad of [
        agencyBody({ license_photo: 'javascript:alert(1)' }),
        agencyBody({ lat: 34.5, lng: 69.1 }), // a pin cannot be set at registration
        agencyBody({ agency_name: 'X' }),
        agencyBody({ is_verified: true }),
        agencyBody({ user_id: user.id }),
      ]) {
        await ctx.post('/agencies/register', bad, user.token).expect(400);
      }
      expect(await ctx.prisma.agency.count({ where: { userId: user.id } })).toBe(0);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER');
    });
  });
});
