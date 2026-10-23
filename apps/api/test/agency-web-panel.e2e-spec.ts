import { PropertyStatus } from '../src/generated/prisma/client.js';
import { hasDb, PIN, propertyBody, TestContext, uniqueProvince, type TestUser } from './helpers.js';

type Row = { id: string; title: string; view_count?: number; price: number; status: string; is_featured: boolean };
type Page = { data: Row[]; meta: { page: number; limit: number; total: number; total_pages: number } };

describe.skipIf(!hasDb)('Agency web panel: filtered "my listings" and the office map (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const publish = async (owner: TestUser, overrides: Record<string, unknown> = {}) =>
    (await ctx.post('/properties', propertyBody(overrides), owner.token).expect(201)).body as Row;
  const mine = async (owner: TestUser, query = '') => (await ctx.get(`/properties/mine${query}`, owner.token).expect(200)).body as Page;
  const titles = (page: Page) => page.data.map((row) => row.title).sort();

  describe('GET /properties/mine: nothing changes without filters', () => {
    it('answers the same list, newest ladder first, and adds how often each listing was opened', async () => {
      const agency = await ctx.agency(true);
      const first = await publish(agency, { title: 'First listing' });
      const second = await publish(agency, { title: 'Second listing' });
      await ctx.post(`/properties/${first.id}/view`, {}).expect(204);
      await ctx.post(`/properties/${first.id}/view`, {}).expect(204);

      const page = await mine(agency);
      expect(page.data.map((row) => row.id)).toEqual([second.id, first.id]);
      expect(page.meta).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
      expect(page.data.find((row) => row.id === first.id)?.view_count).toBe(2);
      expect(page.data.find((row) => row.id === second.id)?.view_count).toBe(0);
    });

    it('does not put the view count into the public answers', async () => {
      const agency = await ctx.agency(true);
      const province = uniqueProvince();
      const listing = await publish(agency, { province });
      const listed = (await ctx.get(`/properties?province=${encodeURIComponent(province)}`).expect(200)).body as Page;
      expect(listed.data[0]).not.toHaveProperty('view_count');
      expect((await ctx.get(`/properties/${listing.id}`).expect(200)).body).not.toHaveProperty('view_count');
    });

    it('refuses a parameter it does not know, and a bad value, instead of ignoring them', async () => {
      const user = await ctx.user();
      await ctx.get('/properties/mine?colour=red', user.token).expect(400);
      await ctx.get('/properties/mine?status=DELETED', user.token).expect(400);
      await ctx.get('/properties/mine?sort=random', user.token).expect(400);
      await ctx.get('/properties/mine?featured=maybe', user.token).expect(400);
      await ctx.get(`/properties/mine?q=${'x'.repeat(101)}`, user.token).expect(400);
    });

    it('needs a token', async () => {
      await ctx.get('/properties/mine').expect(401);
    });
  });

  describe('search', () => {
    it('finds a listing by a word in its title, address, district, neighbourhood or province, ignoring case', async () => {
      const agency = await ctx.agency(true);
      await publish(agency, { title: 'Villa near Wazir Akbar Khan', address: 'Street 9', district: 'District Ten' });
      await publish(agency, { title: 'Plain flat', address: 'Behind Zarnegar Park', district: 'District Eleven' });
      await publish(agency, { title: 'Shop', address: 'Main road', district: 'Qala Wazir', neighborhood: 'Mahmood Khan' });

      expect(titles(await mine(agency, '?q=WAZIR'))).toEqual(['Shop', 'Villa near Wazir Akbar Khan']);
      expect(titles(await mine(agency, '?q=zarnegar'))).toEqual(['Plain flat']);
      expect(titles(await mine(agency, '?q=mahmood'))).toEqual(['Shop']);
      expect(titles(await mine(agency, '?q=eleven'))).toEqual(['Plain flat']);
      expect((await mine(agency, '?q=nothing-like-this')).meta.total).toBe(0);
    });

    it('treats the Arabic look-alike letters a Dari keyboard types as the Persian ones', async () => {
      const agency = await ctx.agency(true);
      await publish(agency, { title: 'خانه', district: 'شهر نو', address: 'کوچه ۴' });
      // ي (Arabic yeh) and ك (Arabic kaf) typed instead of ی and ک.
      expect((await mine(agency, `?q=${encodeURIComponent('كوچه')}`)).meta.total).toBe(1);
    });

    it('does not take the search text as a pattern', async () => {
      const agency = await ctx.agency(true);
      await publish(agency, { title: '100% sure' });
      await publish(agency, { title: 'Something else' });
      expect(titles(await mine(agency, `?q=${encodeURIComponent('%')}`))).toEqual(['100% sure']);
      expect((await mine(agency, `?q=${encodeURIComponent('_')}`)).meta.total).toBe(0);
    });

    it('only ever looks at the caller’s own listings', async () => {
      const [a, b] = [await ctx.agency(true), await ctx.agency(true)];
      await publish(a, { title: 'Shared words here' });
      await publish(b, { title: 'Shared words here too' });
      expect(titles(await mine(a, '?q=shared'))).toEqual(['Shared words here']);
    });
  });

  describe('filters and order', () => {
    let agency: TestUser;
    let ids: Record<string, string>;

    beforeAll(async () => {
      agency = await ctx.agency('YEARLY');
      const make = async (title: string, overrides: Record<string, unknown>) => (await publish(agency, { title, ...overrides })).id;
      ids = {
        saleUsd: await make('Sale USD', { deal_type: 'SALE', price: 100000, currency: 'USD', type: 'HOUSE_HAWILI' }),
        rentUsd: await make('Rent USD', { deal_type: 'RENT', price: 500, currency: 'USD', type: 'APARTMENT' }),
        saleAfn: await make('Sale AFN', { deal_type: 'SALE', price: 5000000, currency: 'AFGHANI', type: 'SHOP' }),
        sold: await make('Sold one', { deal_type: 'SALE', price: 70000, currency: 'USD', type: 'LAND' }),
        archived: await make('Archived one', { deal_type: 'SALE', price: 1000, currency: 'USD' }),
      };
      await ctx.prisma.property.update({ where: { id: ids.sold }, data: { status: PropertyStatus.SOLD, viewCount: 40 } });
      await ctx.del(`/properties/${ids.archived}`, agency.token).expect(204);
      await ctx.prisma.property.update({ where: { id: ids.saleUsd }, data: { viewCount: 10 } });
      await ctx.prisma.property.update({
        where: { id: ids.rentUsd },
        data: { isFeatured: true, featuredUntil: new Date(Date.now() + 86_400_000) },
      });
      // A promotion that has ended: the flag is still set, but it must not count as featured.
      await ctx.prisma.property.update({
        where: { id: ids.saleAfn },
        data: { isFeatured: true, featuredUntil: new Date(Date.now() - 86_400_000) },
      });
    });

    it('filters by status (archived ones are only found by asking for them)', async () => {
      expect(titles(await mine(agency, '?status=ACTIVE'))).toEqual(['Rent USD', 'Sale AFN', 'Sale USD']);
      expect(titles(await mine(agency, '?status=SOLD'))).toEqual(['Sold one']);
      expect(titles(await mine(agency, '?status=ARCHIVED'))).toEqual(['Archived one']);
      expect((await mine(agency)).meta.total).toBe(5);
    });

    it('filters by kind and by deal', async () => {
      expect(titles(await mine(agency, '?type=SHOP'))).toEqual(['Sale AFN']);
      expect(titles(await mine(agency, '?deal_type=RENT'))).toEqual(['Rent USD']);
      expect(titles(await mine(agency, '?deal_type=SALE&status=ACTIVE'))).toEqual(['Sale AFN', 'Sale USD']);
    });

    it('filters by a price range in one currency, and refuses a range without one', async () => {
      expect(titles(await mine(agency, '?currency=USD&min_price=400&max_price=100000&status=ACTIVE'))).toEqual(['Rent USD', 'Sale USD']);
      expect(titles(await mine(agency, '?currency=AFGHANI&min_price=1'))).toEqual(['Sale AFN']);
      await ctx.get('/properties/mine?min_price=10', agency.token).expect(400);
      await ctx.get('/properties/mine?currency=USD&min_price=10&max_price=5', agency.token).expect(400);
    });

    it('filters by a running featured promotion (an ended one is not featured)', async () => {
      expect(titles(await mine(agency, '?featured=true'))).toEqual(['Rent USD']);
      expect(titles(await mine(agency, '?featured=false&status=ACTIVE'))).toEqual(['Sale AFN', 'Sale USD']);
    });

    it('sorts by views, price and date, each with a stable total order', async () => {
      // Listings with the same number of views (none) come newest first.
      expect((await mine(agency, '?sort=views&status=ACTIVE')).data.map((row) => row.title)).toEqual(['Sale USD', 'Sale AFN', 'Rent USD']);
      expect((await mine(agency, '?sort=price_asc&currency=USD&status=ACTIVE')).data.map((row) => row.title)).toEqual(['Rent USD', 'Sale USD']);
      expect((await mine(agency, '?sort=price_desc&currency=USD&status=ACTIVE')).data.map((row) => row.title)).toEqual(['Sale USD', 'Rent USD']);
      expect((await mine(agency, '?sort=oldest')).data[0].title).toBe('Sale USD');
      expect((await mine(agency, '?sort=newest')).data[0].title).toBe('Archived one');
      // Sorting by price across two currencies would be meaningless, so it needs one.
      await ctx.get('/properties/mine?sort=price_asc', agency.token).expect(400);
    });

    it('pages through a filtered list with the right totals', async () => {
      const first = await mine(agency, '?status=ACTIVE&sort=oldest&limit=2&page=1');
      const second = await mine(agency, '?status=ACTIVE&sort=oldest&limit=2&page=2');
      expect(first.meta).toEqual({ page: 1, limit: 2, total: 3, total_pages: 2 });
      expect([...first.data, ...second.data].map((row) => row.title)).toEqual(['Sale USD', 'Rent USD', 'Sale AFN']);
      expect(second.data).toHaveLength(1);
    });
  });

  describe('GET /agencies/me/properties/map', () => {
    it('needs a token, and an agency profile', async () => {
      await ctx.get('/agencies/me/properties/map').expect(401);
      const user = await ctx.user();
      const res = await ctx.get('/agencies/me/properties/map', user.token).expect(404);
      expect(res.body.code).toBe('AGENCY_PROFILE_REQUIRED');
    });

    it('lists the agency’s listings with or without a pin, leaves archived and other agencies’ ones out', async () => {
      const [agency, other] = [await ctx.agency(true), await ctx.agency(true)];
      const pinned = await publish(agency, { title: 'Pinned', ...PIN });
      const loose = await publish(agency, { title: 'Not placed yet' });
      const archived = await publish(agency, { title: 'Gone' });
      await ctx.del(`/properties/${archived.id}`, agency.token).expect(204);
      await publish(other, { title: 'Somebody else’s', ...PIN });
      await ctx.prisma.property.update({ where: { id: loose.id }, data: { status: PropertyStatus.SOLD } });

      const body = (await ctx.get('/agencies/me/properties/map', agency.token).expect(200)).body as {
        data: { id: string; title: string; lat: number | null; lng: number | null; status: string; price: number }[];
        truncated: boolean;
        limit: number;
      };
      expect(body.truncated).toBe(false);
      expect(body.limit).toBe(2000);
      expect(body.data.map((row) => row.title).sort()).toEqual(['Not placed yet', 'Pinned']);
      expect(body.data.find((row) => row.id === pinned.id)).toMatchObject({ lat: PIN.lat, lng: PIN.lng, status: 'ACTIVE', price: 85000 });
      expect(body.data.find((row) => row.id === loose.id)).toMatchObject({ lat: null, lng: null, status: 'SOLD' });
      // Small on purpose: the map does not need descriptions or pictures.
      expect(body.data[0]).not.toHaveProperty('description');
      expect(body.data[0]).not.toHaveProperty('images');
    });

    it('counts a featured promotion only while it runs', async () => {
      const agency = await ctx.agency(true);
      const running = await publish(agency, { title: 'Running' });
      const ended = await publish(agency, { title: 'Ended' });
      await ctx.prisma.property.update({ where: { id: running.id }, data: { isFeatured: true, featuredUntil: new Date(Date.now() + 86_400_000) } });
      await ctx.prisma.property.update({ where: { id: ended.id }, data: { isFeatured: true, featuredUntil: new Date(Date.now() - 1000) } });
      const body = (await ctx.get('/agencies/me/properties/map', agency.token).expect(200)).body as { data: { id: string; is_featured: boolean }[] };
      expect(body.data.find((row) => row.id === running.id)?.is_featured).toBe(true);
      expect(body.data.find((row) => row.id === ended.id)?.is_featured).toBe(false);
    });

    it('sends the newest listings and says so when there are more than one answer carries', async () => {
      const agency = await ctx.agency(true);
      const template = propertyBody();
      const data = Array.from({ length: 2005 }, (_, i) => ({
        userId: agency.id,
        agencyId: agency.agencyId,
        title: `Bulk ${i}`,
        description: template.description,
        type: 'APARTMENT' as const,
        dealType: 'SALE' as const,
        price: 1000 + i,
        currency: 'USD' as const,
        areaSqm: 50,
        province: 'Kabul',
        district: 'Shar-e-Naw',
        address: 'x',
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000),
      }));
      await ctx.prisma.property.createMany({ data });
      const body = (await ctx.get('/agencies/me/properties/map', agency.token).expect(200)).body as { data: { title: string }[]; truncated: boolean };
      expect(body.truncated).toBe(true);
      expect(body.data).toHaveLength(2000);
      expect(body.data[0].title).toBe('Bulk 2004');
      expect(body.data.map((row) => row.title)).not.toContain('Bulk 0');
    });
  });

  describe('what the web panel does with the existing API', () => {
    it('moves a pin with a normal PATCH and marks a listing sold the same way, both for the owner only', async () => {
      const [agency, stranger] = [await ctx.agency(true), await ctx.agency(true)];
      const listing = await publish(agency, { ...PIN });
      await ctx.patch(`/properties/${listing.id}`, { lat: 34.6, lng: 69.2 }, agency.token).expect(200);
      await ctx.patch(`/properties/${listing.id}`, { status: 'SOLD' }, agency.token).expect(200);
      await ctx.patch(`/properties/${listing.id}`, { status: 'ACTIVE' }, stranger.token).expect(403);
      const row = await ctx.prisma.property.findUniqueOrThrow({ where: { id: listing.id } });
      expect([row.lat, row.lng, row.status]).toEqual([34.6, 69.2, 'SOLD']);
    });
  });
});
