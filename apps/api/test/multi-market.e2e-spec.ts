import type { Paginated, PaymentInitiated, PaymentStatus, Pricing, Property, User } from '@bongah/shared-types';
import { hasDb, PIN, propertyBody, TestContext, uniqueProvince } from './helpers.js';

// Iran's payment accounts and prices (Afghanistan stays on the mock gateway, as in every other spec).
process.env.MANUAL_PAY_IR_CARD_NUMBER = '6037 9912 3456 7893';
process.env.MANUAL_PAY_IR_CARD_HOLDER = 'Bongah Co';
process.env.MANUAL_PAY_IR_CARD_BANK = 'Melli';
process.env.MANUAL_PAY_IR_SHEBA = 'IR27 0170 0000 0010 0324 2000 01';
process.env.MANUAL_PAY_IR_NOTE = 'Send the exact amount';
process.env.IR_PRICE_SUBSCRIPTION_LIST_MONTHLY = '2000000';
process.env.IR_PRICE_LADDER = '50000';
process.env.IR_PRICE_FEATURED_AD = '100000';
process.env.IR_PRICE_MAP_LOCATION = '30000';
process.env.IR_PRICE_CONTACT_CREDITS = '40000';

const TEHRAN = { lat: 35.6892, lng: 51.389 };

/** A valid Iranian listing: a villa or garden (باغ و ویلا) let by the day, priced in toman. */
const iranBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> =>
  propertyBody({
    market: 'IR',
    type: 'VILLA_GARDEN',
    deal_type: 'DAILY_RENT',
    currency: 'TOMAN',
    price: 3_500_000,
    province: 'مازندران',
    district: 'نوشهر',
    ...overrides,
  });

describe.skipIf(!hasDb)('Multi-market (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await TestContext.create();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('the account setting', () => {
    it('starts in Afghanistan and moves to Iran and back', async () => {
      const user = await ctx.user();
      expect(((await ctx.get('/users/me', user.token).expect(200)).body as User).market).toBe('AF');
      const moved = (await ctx.patch('/users/me/preferences', { market: 'IR' }, user.token).expect(200)).body as User;
      expect(moved.market).toBe('IR');
      expect(((await ctx.get('/users/me', user.token).expect(200)).body as User).market).toBe('IR');
      expect(((await ctx.patch('/users/me/preferences', { market: 'AF' }, user.token).expect(200)).body as User).market).toBe('AF');
    });

    it('refuses an unknown market', async () => {
      const user = await ctx.user();
      await ctx.patch('/users/me/preferences', { market: 'TR' }, user.token).expect(400);
    });
  });

  describe('publishing a listing', () => {
    it('takes an Iranian daily villa rental in toman, with a pin in Tehran, and says which market it is in', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', iranBody({ ...TEHRAN }), user.token).expect(201);
      expect(res.body).toMatchObject({ market: 'IR', type: 'VILLA_GARDEN', deal_type: 'DAILY_RENT', currency: 'TOMAN', price: 3_500_000 });
    });

    it('stores a toman price above the old 10^12 limit', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', iranBody({ deal_type: 'SALE', currency: 'TOMAN', price: 2_500_000_000_000 }), user.token).expect(201);
      expect(res.body.price).toBe(2_500_000_000_000);
      const stored = (await ctx.get(`/properties/${res.body.id}`).expect(200)).body as Property;
      expect(stored).toMatchObject({ market: 'IR', currency: 'TOMAN', price: 2_500_000_000_000 });
    });

    it("defaults to the account's market when the form does not name one", async () => {
      const user = await ctx.user();
      await ctx.patch('/users/me/preferences', { market: 'IR' }, user.token).expect(200);
      const { market: _market, ...noMarket } = iranBody();
      const res = await ctx.post('/properties', noMarket, user.token).expect(201);
      expect(res.body.market).toBe('IR');
      // And an Afghan listing is still Afghan for an Afghan account.
      const afghan = await ctx.user();
      expect((await ctx.post('/properties', propertyBody(), afghan.token).expect(201)).body.market).toBe('AF');
    });

    it('lets an Afghan account publish in Iran by choosing the market on the form', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', iranBody(), user.token).expect(201);
      expect(res.body.market).toBe('IR');
    });

    it.each([
      ['a toman price on an Afghan listing', propertyBody({ currency: 'TOMAN' }), 'currency'],
      ['an afghani price on an Iranian listing', iranBody({ currency: 'AFGHANI' }), 'currency'],
      ['a daily rental of an apartment in Afghanistan', propertyBody({ type: 'APARTMENT', deal_type: 'DAILY_RENT' }), 'deal_type'],
      ['a duplex type in Afghanistan', propertyBody({ type: 'DUPLEX' }), 'type'],
      ['a garage in Iran', iranBody({ type: 'GARAGE', deal_type: 'SALE' }), 'type'],
      ['a rial price in Iran (toman only)', iranBody({ type: 'APARTMENT', deal_type: 'SALE', currency: 'RIAL' }), 'currency'],
      ['a dollar price in Iran (toman only)', iranBody({ type: 'APARTMENT', deal_type: 'SALE', currency: 'USD' }), 'currency'],
      ['a shop in Iran (it is «تجاری و اداری»)', iranBody({ type: 'SHOP', deal_type: 'SALE' }), 'type'],
      ['a duplex type in Iran (it is a tag now)', iranBody({ type: 'DUPLEX', deal_type: 'SALE' }), 'type'],
      ['a godam in Iran', iranBody({ type: 'WAREHOUSE', deal_type: 'SALE' }), 'type'],
      ['an Iranian land-and-old-building in Afghanistan', propertyBody({ type: 'LAND_OLD' }), 'type'],
      ['plain rent in Iran', iranBody({ type: 'APARTMENT', deal_type: 'RENT' }), 'deal_type'],
      ['a mortgage-and-rent in Afghanistan', propertyBody({ deal_type: 'MORTGAGE_RENT', monthly_rent: 300 }), 'deal_type'],
      ['an Iranian tag in Afghanistan', propertyBody({ features: ['ELEVATOR'] }), 'features'],
      ['an Afghan deed in Iran', iranBody({ type: 'VILLA_GARDEN', deal_type: 'SALE', deed_type: 'SHARI' }), 'deed_type'],
      ['a Kabul pin on an Iranian listing', iranBody({ ...PIN }), 'lat'],
      ['a Tehran pin on an Afghan listing', propertyBody({ ...TEHRAN }), 'lat'],
    ])('refuses %s', async (_name, body, field) => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', body, user.token).expect(400);
      expect(res.body).toMatchObject({ code: 'MARKET_MISMATCH', errors: [{ field }] });
    });

    it('refuses a daily rental of an apartment (a villa or a garden only)', async () => {
      const user = await ctx.user();
      await ctx.post('/properties', iranBody({ type: 'APARTMENT' }), user.token).expect(400);
    });

    it("takes Iran's six kinds of property, for sale, as a full mortgage and as a daily villa", async () => {
      const user = await ctx.user();
      const made = (await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'MORTGAGE_GROWI', mortgage_months: 12, price: 900_000_000 }), user.token).expect(201)).body as Property;
      expect(made).toMatchObject({ type: 'APARTMENT', deal_type: 'MORTGAGE_GROWI', monthly_rent: null, features: [], deed_type: null });
      await ctx.post('/properties', iranBody({ type: 'COMMERCIAL', deal_type: 'SALE' }), user.token).expect(403); // the free listing for the month is used
      for (const [type, deal_type] of [
        ['COMMERCIAL', 'SALE'],
        ['HOUSE_HAWILI', 'SALE'],
        ['LAND', 'SALE'],
        ['LAND_OLD', 'SALE'],
        ['VILLA_GARDEN', 'DAILY_RENT'],
        ['VILLA_GARDEN', 'SALE'],
      ] as const) {
        const other = await ctx.user();
        const res = await ctx.post('/properties', iranBody({ type, deal_type }), other.token).expect(201);
        expect(res.body).toMatchObject({ market: 'IR', type, deal_type });
      }
    });

    it('stores a mortgage-and-rent as a deposit and a monthly rent', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'MORTGAGE_RENT', price: 200_000_000, monthly_rent: 8_000_000 }), user.token).expect(201);
      expect(res.body).toMatchObject({ deal_type: 'MORTGAGE_RENT', price: 200_000_000, monthly_rent: 8_000_000, currency: 'TOMAN' });
      const stored = (await ctx.get(`/properties/${res.body.id}`).expect(200)).body as Property;
      expect(stored).toMatchObject({ price: 200_000_000, monthly_rent: 8_000_000 });
    });

    it('needs the monthly rent for a mortgage-and-rent, and refuses it on any other deal', async () => {
      const user = await ctx.user();
      const without = await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'MORTGAGE_RENT' }), user.token).expect(400);
      expect(JSON.stringify(without.body)).toContain('monthly_rent');
      const other = await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'SALE', monthly_rent: 5 }), user.token).expect(400);
      expect(JSON.stringify(other.body)).toContain('monthly_rent');
    });

    it('stores the tags once each, and sends them back', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'SALE', features: ['ELEVATOR', 'PARKING', 'ELEVATOR', 'DUPLEX'] }), user.token).expect(201);
      expect((res.body as Property).features).toEqual(['ELEVATOR', 'PARKING', 'DUPLEX']);
      await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'SALE', features: ['SWIMMING_POOL'] }), (await ctx.user()).token).expect(400);
    });

    it('stores an Afghan deed and a godam', async () => {
      const user = await ctx.user();
      const res = await ctx.post('/properties', propertyBody({ type: 'WAREHOUSE', deed_type: 'SHARI', province: uniqueProvince() }), user.token).expect(201);
      expect(res.body).toMatchObject({ market: 'AF', type: 'WAREHOUSE', deed_type: 'SHARI', features: [] });
    });

    it('edits a listing through the mortgage-and-rent rules', async () => {
      const user = await ctx.user();
      const sale = (await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'SALE' }), user.token).expect(201)).body as Property;
      // The deal changes to a mortgage-and-rent: it needs a rent, from this edit or already stored.
      await ctx.patch(`/properties/${sale.id}`, { deal_type: 'MORTGAGE_RENT' }, user.token).expect(400);
      const moved = (await ctx.patch(`/properties/${sale.id}`, { deal_type: 'MORTGAGE_RENT', monthly_rent: 6_000_000, price: 150_000_000 }, user.token).expect(200)).body as Property;
      expect(moved).toMatchObject({ deal_type: 'MORTGAGE_RENT', monthly_rent: 6_000_000 });
      // Left alone, the stored rent stays; null cannot clear it while the deal needs it.
      expect(((await ctx.patch(`/properties/${sale.id}`, { title: 'Renamed apartment' }, user.token).expect(200)).body as Property).monthly_rent).toBe(6_000_000);
      await ctx.patch(`/properties/${sale.id}`, { monthly_rent: null }, user.token).expect(400);
      // Back to a sale: the rent goes. Naming one for a sale is refused.
      await ctx.patch(`/properties/${sale.id}`, { deal_type: 'SALE', monthly_rent: 1 }, user.token).expect(400);
      expect(((await ctx.patch(`/properties/${sale.id}`, { deal_type: 'SALE' }, user.token).expect(200)).body as Property).monthly_rent).toBeNull();
      // The tags are replaced as a set.
      expect(((await ctx.patch(`/properties/${sale.id}`, { features: ['PENTHOUSE', 'STORAGE'] }, user.token).expect(200)).body as Property).features).toEqual(['PENTHOUSE', 'STORAGE']);
      expect(((await ctx.patch(`/properties/${sale.id}`, { features: [] }, user.token).expect(200)).body as Property).features).toEqual([]);
    });

    it("keeps an Afghan listing free of Iran's tags on edit, and an Iranian one free of deeds", async () => {
      const user = await ctx.user();
      const afghan = (await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), user.token).expect(201)).body as Property;
      await ctx.patch(`/properties/${afghan.id}`, { features: ['ELEVATOR'] }, user.token).expect(400);
      expect(((await ctx.patch(`/properties/${afghan.id}`, { deed_type: 'ORFI' }, user.token).expect(200)).body as Property).deed_type).toBe('ORFI');
      expect(((await ctx.patch(`/properties/${afghan.id}`, { deed_type: null }, user.token).expect(200)).body as Property).deed_type).toBeNull();
      const owner = await ctx.user();
      const iran = (await ctx.post('/properties', iranBody({ type: 'APARTMENT', deal_type: 'SALE' }), owner.token).expect(201)).body as Property;
      await ctx.patch(`/properties/${iran.id}`, { deed_type: 'SHARI' }, owner.token).expect(400);
    });

    it('checks an edit against the listing\'s own market, and does not move it to another', async () => {
      const user = await ctx.user();
      const created = (await ctx.post('/properties', iranBody(), user.token).expect(201)).body as Property;
      await ctx.patch(`/properties/${created.id}`, { currency: 'AFGHANI' }, user.token).expect(400);
      await ctx.patch(`/properties/${created.id}`, { type: 'APARTMENT' }, user.token).expect(400); // still a daily rental
      await ctx.patch(`/properties/${created.id}`, { deal_type: 'RENT', type: 'APARTMENT' }, user.token).expect(400); // plain rent is Afghan
      await ctx.patch(`/properties/${created.id}`, { deal_type: 'SALE', type: 'APARTMENT' }, user.token).expect(200);
      await ctx.patch(`/properties/${created.id}`, { market: 'AF' }, user.token).expect(400);
      const row = await ctx.prisma.property.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.market).toBe('IR');
    });

    it('lets an old listing be edited for something else', async () => {
      const user = await ctx.user();
      const created = (await ctx.post('/properties', propertyBody({ province: uniqueProvince() }), user.token).expect(201)).body as Property;
      await ctx.patch(`/properties/${created.id}`, { title: 'A better title' }, user.token).expect(200);
    });
  });

  describe('the feed is one market at a time', () => {
    it('shows Afghan listings by default and Iranian ones only when asked', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      const seed = (market: 'AF' | 'IR') =>
        ctx.prisma.property.create({
          data: {
            userId: owner.id,
            market,
            title: `Seeded ${market}`,
            description: 'x',
            type: 'APARTMENT',
            dealType: 'SALE',
            price: 1000,
            currency: market === 'IR' ? 'TOMAN' : 'USD',
            areaSqm: 50,
            province,
            district: 'd',
            address: 'a',
          },
        });
      await seed('AF');
      await seed('IR');
      const titles = async (query: string) =>
        ((await ctx.get(`/properties?province=${encodeURIComponent(province)}${query}`).expect(200)).body as Paginated<Property>).data.map((p) => p.title);
      expect(await titles('')).toEqual(['Seeded AF']);
      expect(await titles('&market=AF')).toEqual(['Seeded AF']);
      expect(await titles('&market=IR')).toEqual(['Seeded IR']);
      await ctx.get('/properties?market=XX').expect(400);
    });

    it('filters by tags (all of them) and by deed', async () => {
      const owner = await ctx.user();
      const province = uniqueProvince();
      const seed = (title: string, market: 'AF' | 'IR', extra: Record<string, unknown>) =>
        ctx.prisma.property.create({
          data: {
            userId: owner.id,
            market,
            title,
            description: 'x',
            type: 'APARTMENT',
            dealType: 'SALE',
            price: 1000,
            currency: market === 'IR' ? 'TOMAN' : 'USD',
            areaSqm: 50,
            province,
            district: 'd',
            address: 'a',
            ...extra,
          },
        });
      await seed('lift', 'IR', { features: ['ELEVATOR'] });
      await seed('lift+park', 'IR', { features: ['ELEVATOR', 'PARKING'] });
      await seed('none', 'IR', {});
      await seed('shari', 'AF', { deedType: 'SHARI' });
      await seed('orfi', 'AF', { deedType: 'ORFI' });
      const titles = async (query: string) =>
        ((await ctx.get(`/properties?province=${encodeURIComponent(province)}${query}`).expect(200)).body as Paginated<Property>).data
          .map((p) => p.title)
          .sort();
      expect(await titles('&market=IR&features=ELEVATOR')).toEqual(['lift', 'lift+park']);
      expect(await titles('&market=IR&features=ELEVATOR,PARKING')).toEqual(['lift+park']);
      expect(await titles('&market=IR&features=PARKING,ELEVATOR')).toEqual(['lift+park']);
      expect(await titles('&market=AF&deed_type=ORFI')).toEqual(['orfi']);
      // The owner's own list takes the same two filters.
      const mine = async (query: string) =>
        ((await ctx.get(`/properties/mine?${query}`, owner.token).expect(200)).body as Paginated<Property>).data
          .filter((p) => p.province === province)
          .map((p) => p.title)
          .sort();
      expect(await mine('features=ELEVATOR,PARKING')).toEqual(['lift+park']);
      expect(await mine('deed_type=SHARI')).toEqual(['shari']);
      await ctx.get('/properties/mine?features=POOL', owner.token).expect(400);
      await ctx.get('/properties?features=POOL').expect(400);
      await ctx.get('/properties?deed_type=NOPE').expect(400);
    });
  });

  describe('paying in Iran', () => {
    it("quotes the price list in toman from Iran's own settings; Afghanistan's is unchanged", async () => {
      const iran = (await ctx.get('/hesabpay/pricing?market=IR').expect(200)).body as Pricing;
      expect(iran).toMatchObject({ market: 'IR', currency: 'TOMAN', ladder: 50000, featured_ad: 100000, subscription: { MONTHLY: 1_800_000 } });
      const afghan = (await ctx.get('/hesabpay/pricing').expect(200)).body as Pricing;
      expect(afghan).toMatchObject({ market: 'AF', currency: 'AFGHANI', ladder: 50 });
    });

    it('sends an Iranian customer to a card and a Sheba, as a manual payment in toman, even though the mock gateway would settle it', async () => {
      const user = await ctx.user();
      await ctx.patch('/users/me/preferences', { market: 'IR' }, user.token).expect(200);
      const started = (await ctx.post('/hesabpay/payments', { purpose: 'CONTACT_CREDITS' }, user.token).expect(201)).body as PaymentInitiated;
      expect(started).toMatchObject({
        status: 'PENDING',
        method: 'MANUAL',
        payment_url: null,
        amount: 40000,
        currency: 'TOMAN',
        manual: {
          note: 'Send the exact amount',
          accounts: [
            { kind: 'CARD', number: '6037 9912 3456 7893', holder: 'Bongah Co', bank: 'Melli' },
            { kind: 'SHEBA', number: 'IR270170000000100324200001', holder: 'Bongah Co', bank: 'Melli' },
          ],
        },
      });
      const row = await ctx.prisma.transaction.findUniqueOrThrow({ where: { id: started.id } });
      expect(row).toMatchObject({ market: 'IR', currency: 'TOMAN', method: 'MANUAL', status: 'PENDING' });
      expect(row.hesabpayTxId).toMatch(/^manual_/);
      // Coming back to it shows the same accounts, and the same currency.
      const again = (await ctx.get(`/hesabpay/payments/${started.id}`, user.token).expect(200)).body as PaymentStatus;
      expect(again).toMatchObject({ status: 'PENDING', currency: 'TOMAN', manual: { accounts: [{ kind: 'CARD' }, { kind: 'SHEBA' }] } });
    });

    it('keeps the Afghan customer on the gateway in afghani', async () => {
      const user = await ctx.user();
      const started = (await ctx.post('/hesabpay/payments', { purpose: 'CONTACT_CREDITS' }, user.token).expect(201)).body as PaymentInitiated;
      expect(started).toMatchObject({ method: 'GATEWAY', currency: 'AFGHANI', amount: 40 });
      expect(started.payment_url).toMatch(/^https:/);
    });

    it('prices a subscription for an Iranian agency in toman', async () => {
      const agency = await ctx.agency(false);
      await ctx.patch('/users/me/preferences', { market: 'IR' }, agency.token).expect(200);
      const started = (await ctx.post('/hesabpay/payments', { purpose: 'SUBSCRIPTION', package_type: 'YEARLY' }, agency.token).expect(201)).body as PaymentInitiated;
      expect(started).toMatchObject({ amount: 12_000_000, currency: 'TOMAN', method: 'MANUAL' });
    });
  });
});
