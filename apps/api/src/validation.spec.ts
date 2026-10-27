import {
  createFeedbackSchema,
  createPropertySchema,
  initiatePaymentSchema,
  listPropertiesQuerySchema,
  normalizePlaceName,
  registerAgencySchema,
  registerUserSchema,
  setAgencyLocationSchema,
  updatePropertySchema,
} from '@bongah/validation';

const valid = {
  title: 'Two bedroom apartment',
  description: 'Bright apartment',
  type: 'APARTMENT',
  deal_type: 'SALE',
  price: 85000.5,
  currency: 'USD',
  area_sqm: 90,
  province: 'Kabul',
  district: 'Shar-e-Naw',
  neighborhood: 'Qala-e-Fathullah',
  address: 'Street 4',
  lat: 34.5,
  lng: 69.1,
};
const fields = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];

describe('normalizePlaceName', () => {
  it('folds Arabic look-alike letters, NFKC forms and whitespace', () => {
    expect(normalizePlaceName('  كابل ')).toBe('کابل');
    expect(normalizePlaceName('بلخ  شمالي')).toBe('بلخ شمالی');
    expect(normalizePlaceName('ﻛﺎﺑﻞ')).toBe('کابل'); // presentation forms
  });
});

describe('updatePropertySchema: mortgage duration and price terms', () => {
  it('takes them alone, and clears them with null', () => {
    expect(updatePropertySchema.safeParse({ mortgage_months: 12 }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ mortgage_months: null, price_terms: null }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ price_terms: 'NEGOTIABLE' }).success).toBe(true);
  });

  it('refuses a duration sent with a deal that has none (a duration alone is for the service to check)', () => {
    const r = updatePropertySchema.safeParse({ deal_type: 'RENT', mortgage_months: 12 });
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('mortgage_months');
    expect(updatePropertySchema.safeParse({ deal_type: 'MORTGAGE_GROWI', mortgage_months: 12 }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ deal_type: 'RENT', mortgage_months: null }).success).toBe(true);
  });
});

describe('createPropertySchema', () => {
  it('accepts a valid property and normalises text', () => {
    const r = createPropertySchema.parse({ ...valid, title: '  Nice   house ', province: 'كابل' });
    expect(r.title).toBe('Nice house');
    expect(r.province).toBe('کابل');
  });

  it.each([
    ['price', { price: 1.005 }],
    ['price', { price: '100' }],
    ['price', { price: Number.POSITIVE_INFINITY }],
    ['price', { price: 1_000_000_000_000 }],
    ['area_sqm', { area_sqm: 0 }],
    ['lat', { lat: 38.7 }],
    ['lng', { lng: 60.3 }],
    ['bedrooms', { bedrooms: -1 }],
    ['images.1', { images: ['https://ok.example/a.jpg', 'data:text/html,hi'] }],
    ['title', { title: 'ab' }],
    ['neighborhood', { neighborhood: 'x' }],
    ['lat', { lat: null }],
    ['', { surprise: 1 }],
  ])('rejects bad %s', (field, patch) => {
    const r = createPropertySchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(fields(r)).toContain(field);
  });

  it('accepts every property type in create, update and list filters', () => {
    for (const type of ['HOUSE_HAWILI', 'APARTMENT', 'SHOP', 'OFFICE', 'LAND', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER']) {
      expect(createPropertySchema.safeParse({ ...valid, type }).success).toBe(true);
      expect(updatePropertySchema.safeParse({ type }).success).toBe(true);
      expect(listPropertiesQuerySchema.safeParse({ type }).success).toBe(true);
    }
    expect(createPropertySchema.safeParse({ ...valid, type: 'garden' }).success).toBe(false);
  });

  it.each(['OFFICE_SHOP', 'GARDEN_VILLA', 'GARAGE_OTHER'])('no longer knows the combined type %s', (type) => {
    expect(createPropertySchema.safeParse({ ...valid, type }).success).toBe(false);
    expect(listPropertiesQuerySchema.safeParse({ type }).success).toBe(false);
    expect(listPropertiesQuerySchema.safeParse({ types: `LAND,${type}` }).success).toBe(false);
  });

  it('takes a mortgage duration only on a mortgage, in whole months from 1 to 600', () => {
    const mortgage = { ...valid, deal_type: 'MORTGAGE_GROWI' };
    expect(createPropertySchema.safeParse({ ...mortgage, mortgage_months: 24 }).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...mortgage, mortgage_months: 600 }).success).toBe(true);
    expect(createPropertySchema.safeParse(mortgage).success).toBe(true); // the duration may be left out
    for (const mortgage_months of [0, 601, 1.5, -3, '12']) {
      const r = createPropertySchema.safeParse({ ...mortgage, mortgage_months });
      expect(r.success).toBe(false);
      expect(fields(r)).toContain('mortgage_months');
    }
    for (const deal_type of ['SALE', 'RENT']) {
      const r = createPropertySchema.safeParse({ ...valid, deal_type, mortgage_months: 12 });
      expect(r.success).toBe(false);
      expect(fields(r)).toContain('mortgage_months');
    }
    // null is "none", also on a sale.
    expect(createPropertySchema.safeParse({ ...valid, mortgage_months: null }).success).toBe(true);
  });

  it('takes the price terms FIXED or NEGOTIABLE, or none', () => {
    for (const price_terms of ['FIXED', 'NEGOTIABLE', null]) {
      expect(createPropertySchema.safeParse({ ...valid, price_terms }).success).toBe(true);
    }
    const r = createPropertySchema.safeParse({ ...valid, price_terms: 'fixed' });
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('price_terms');
  });

  it('treats the map pin as optional but never half a pin', () => {
    const { lat: _lat, lng: _lng, ...noPin } = valid;
    expect(createPropertySchema.safeParse(noPin).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...noPin, lat: 34.5 }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...noPin, lng: 69.1 }).success).toBe(false);
  });

  it('needs the written address while there is no pin, and makes it optional once there is one', () => {
    const { lat: _lat, lng: _lng, district: _d, neighborhood: _n, address: _a, ...bare } = valid;
    // A pin stands in for the address (and fills in the district and neighbourhood).
    expect(createPropertySchema.safeParse({ ...bare, lat: 34.5, lng: 69.1 }).success).toBe(true);
    // Without one, the address is what is missing, for a reason the app can show on that field.
    const noPin = createPropertySchema.safeParse(bare);
    expect(noPin.success).toBe(false);
    expect(fields(noPin)).toEqual(['address']);
    // The address on its own is enough: district and neighbourhood are never required.
    expect(createPropertySchema.safeParse({ ...bare, address: 'Zaranj, district 5, next to ABC hospital' }).success).toBe(true);
    // Giving the structured parts as well is fine.
    const written = { district: 'Shar-e-Naw', neighborhood: 'Qala-e-Fathullah', address: 'Street 4' };
    expect(createPropertySchema.safeParse({ ...bare, ...written }).success).toBe(true);
    // Empty text is the same as missing.
    expect(createPropertySchema.safeParse({ ...bare, ...written, address: '' }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...bare, lat: 34.5, lng: 69.1, address: '' }).success).toBe(true);
    // What is given must still be well formed.
    expect(createPropertySchema.safeParse({ ...bare, lat: 34.5, lng: 69.1, neighborhood: 'x' }).success).toBe(false);
  });

  it('requires a description to publish: missing, empty or blank is refused, line breaks are kept', () => {
    const { description: _desc, ...noDescription } = valid;
    expect(createPropertySchema.safeParse(noDescription).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...valid, description: '' }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...valid, description: '  \n \t ' }).success).toBe(false);
    const kept = createPropertySchema.parse({ ...valid, description: 'خانه نو\n\nنزدیک بازار' });
    expect(kept.description).toBe('خانه نو\n\nنزدیک بازار');
  });

  it('lets an update leave the description out but not blank it', () => {
    expect(updatePropertySchema.safeParse({ price: 5 }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ description: 'متن تازه' }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ description: '' }).success).toBe(false);
    expect(updatePropertySchema.safeParse({ description: '   ' }).success).toBe(false);
  });

  it('allows null/absent rooms and leaves images undefined (the service defaults it)', () => {
    const r = createPropertySchema.parse({ ...valid, bedrooms: null });
    expect(r.bedrooms).toBeNull();
    expect(r.images).toBeUndefined();
  });
});

describe('updatePropertySchema', () => {
  it('yields only the keys that were sent: no default may overwrite stored data', () => {
    expect(updatePropertySchema.parse({ title: 'New title' })).toEqual({ title: 'New title' });
  });
  it('requires at least one field and lat/lng together', () => {
    expect(updatePropertySchema.safeParse({}).success).toBe(false);
    expect(updatePropertySchema.safeParse({ lat: 34.5 }).success).toBe(false);
    expect(updatePropertySchema.safeParse({ lat: 34.5, lng: 69.1 }).success).toBe(true);
  });
  it('allows clearing rooms with null and changing status, but nothing else unknown', () => {
    expect(updatePropertySchema.parse({ bedrooms: null, status: 'SOLD' })).toEqual({ bedrooms: null, status: 'SOLD' });
    expect(updatePropertySchema.safeParse({ is_featured: true }).success).toBe(false);
  });
});

describe('listPropertiesQuerySchema', () => {
  it('applies pagination defaults and converts numbers', () => {
    expect(listPropertiesQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listPropertiesQuerySchema.parse({ has_location: 'true' })).toMatchObject({ has_location: true });
    expect(listPropertiesQuerySchema.parse({ has_location: 'false' })).toMatchObject({ has_location: false });
    expect(listPropertiesQuerySchema.parse({ min_price: '10.5', currency: 'USD', page: '3' })).toMatchObject({ min_price: 10.5, page: 3 });
  });
  it.each([
    [{ min_price: '10' }],
    [{ max_price: '10' }],
    [{ min_price: '20', max_price: '10', currency: 'USD' }],
    [{ limit: '51' }],
    [{ limit: '' }],
    [{ page: '1e2' }],
    [{ min_price: '1.234', currency: 'USD' }],
    [{ province: ['a', 'b'] }],
    [{ extra: '1' }],
    [{ has_location: 'yes' }],
    [{ has_location: '1' }],
  ])('rejects %j', (query) => {
    expect(listPropertiesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('listPropertiesQuerySchema: several types', () => {
  it('reads a comma-separated list, once each and in the order given', () => {
    expect(listPropertiesQuerySchema.parse({ types: 'HOUSE_HAWILI,APARTMENT' })).toMatchObject({
      types: ['HOUSE_HAWILI', 'APARTMENT'],
    });
    expect(listPropertiesQuerySchema.parse({ types: 'LAND,LAND, APARTMENT' })).toMatchObject({
      types: ['LAND', 'APARTMENT'],
    });
    expect(listPropertiesQuerySchema.parse({ types: 'LAND' })).toMatchObject({ types: ['LAND'] });
  });
  it('still accepts the single `type` of older apps', () => {
    expect(listPropertiesQuerySchema.parse({ type: 'LAND' })).toMatchObject({ type: 'LAND' });
  });
  it.each([
    ['an empty list', { types: '' }],
    ['a trailing comma', { types: 'LAND,' }],
    ['an unknown type', { types: 'LAND,CASTLE' }],
    ['both type and types', { type: 'LAND', types: 'LAND' }],
    ['a list given twice', { types: ['LAND', 'APARTMENT'] }],
  ])('rejects %s', (_name, query) => {
    expect(listPropertiesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('listPropertiesQuerySchema: map area', () => {
  const area = { min_lat: '34.25', max_lat: '34.875', min_lng: '68.9375', max_lng: '69.4375' };
  it('reads the four edges as numbers, and an area alone is fine', () => {
    expect(listPropertiesQuerySchema.parse(area)).toMatchObject({
      min_lat: 34.25,
      max_lat: 34.875,
      min_lng: 68.9375,
      max_lng: 69.4375,
    });
    expect(listPropertiesQuerySchema.parse({ ...area, has_location: 'true', type: 'LAND' })).toMatchObject({
      has_location: true,
      type: 'LAND',
    });
    expect(listPropertiesQuerySchema.parse({ ...area, min_lat: '-34.5', max_lat: '-34' })).toMatchObject({ min_lat: -34.5 });
  });
  it.each([
    ['only some of the edges', { min_lat: '34', max_lat: '35' }],
    ['a single edge', { max_lng: '69' }],
    ['south above north', { ...area, min_lat: '35', max_lat: '34' }],
    ['west east of east', { ...area, min_lng: '70', max_lng: '69' }],
    ['a latitude beyond the pole', { ...area, max_lat: '91' }],
    ['a longitude beyond the date line', { ...area, min_lng: '-181' }],
    ['more than eight decimals', { ...area, min_lat: '34.123456789' }],
    ['an edge that is not a number', { ...area, max_lng: 'abc' }],
    ['an area together with has_location=false', { ...area, has_location: 'false' }],
  ])('rejects %s', (_name, query) => {
    expect(listPropertiesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('registration and payment schemas', () => {
  it('registerUserSchema takes a name and optional avatar only', () => {
    expect(registerUserSchema.parse({ full_name: ' Ahmad  Zia ' })).toEqual({ full_name: 'Ahmad Zia' });
    expect(registerUserSchema.safeParse({ full_name: 'Ahmad Zia', role: 'ADMIN' }).success).toBe(false);
  });
  it('registerAgencySchema validates the licence URL and refuses a pin (that needs a subscription)', () => {
    const agency = { agency_name: 'Noor', license_photo: 'https://x.test/l.jpg', address: 'Kabul city' };
    expect(registerAgencySchema.safeParse(agency).success).toBe(true);
    expect(registerAgencySchema.safeParse({ ...agency, lat: 34.5, lng: 69.1 }).success).toBe(false);
    expect(registerAgencySchema.safeParse({ ...agency, license_photo: 'file:///etc/passwd' }).success).toBe(false);
    expect(registerAgencySchema.safeParse({ ...agency, is_verified: true }).success).toBe(false);
  });
  it('registerAgencySchema does not require a licence photo (the web panel sends none)', () => {
    expect(registerAgencySchema.safeParse({ agency_name: 'Noor', address: 'Kabul city' }).success).toBe(true);
  });
  it('initiatePaymentSchema is a closed union with no client-chosen amount', () => {
    expect(initiatePaymentSchema.safeParse({ purpose: 'SUBSCRIPTION', package_type: 'YEARLY' }).success).toBe(true);
    expect(initiatePaymentSchema.safeParse({ purpose: 'SUBSCRIPTION', package_type: 'YEARLY', amount: 1 }).success).toBe(false);
    expect(initiatePaymentSchema.safeParse({ purpose: 'LADDER', property_id: 'x' }).success).toBe(false);
  });
  it('initiatePaymentSchema takes a map location add-on with nothing else', () => {
    expect(initiatePaymentSchema.safeParse({ purpose: 'MAP_LOCATION' }).success).toBe(true);
    expect(initiatePaymentSchema.safeParse({ purpose: 'MAP_LOCATION', amount: 1 }).success).toBe(false);
    expect(initiatePaymentSchema.safeParse({ purpose: 'MAP_LOCATION', property_id: crypto.randomUUID() }).success).toBe(false);
  });
  it('setAgencyLocationSchema needs both coordinates inside Afghanistan', () => {
    expect(setAgencyLocationSchema.safeParse({ lat: 34.5, lng: 69.1 }).success).toBe(true);
    expect(setAgencyLocationSchema.safeParse({ lat: 34.5 }).success).toBe(false);
    expect(setAgencyLocationSchema.safeParse({ lat: 51.5, lng: -0.12 }).success).toBe(false);
    expect(setAgencyLocationSchema.safeParse({ lat: 34.5, lng: 69.1, agency_id: 'x' }).success).toBe(false);
  });
});

describe('the unit of a property', () => {
  it('is optional free text: none, null, blank, or a few words', () => {
    expect(createPropertySchema.safeParse(valid).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...valid, unit: null }).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...valid, unit: '' }).success).toBe(true);
    expect(createPropertySchema.parse({ ...valid, unit: '  واحد   ۳ ' }).unit).toBe('واحد ۳');
    expect(updatePropertySchema.safeParse({ unit: null }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ unit: 'طبقه دوم' }).success).toBe(true);
  });
  it('is at most 40 characters, and is text', () => {
    expect(createPropertySchema.safeParse({ ...valid, unit: 'x'.repeat(40) }).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...valid, unit: 'x'.repeat(41) }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...valid, unit: 3 }).success).toBe(false);
  });
  it('is not a filter, and the old unit_type is gone from every schema', () => {
    expect(listPropertiesQuerySchema.safeParse({ unit: 'a' }).success).toBe(false);
    expect(listPropertiesQuerySchema.safeParse({ type: 'LAND', unit_type: 'DUPLEX' }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...valid, unit_type: 'STUDIO' }).success).toBe(false);
    expect(updatePropertySchema.safeParse({ unit_type: 'STUDIO' }).success).toBe(false);
  });
});

describe('createFeedbackSchema', () => {
  const ok = { category: 'SUGGESTION', message: 'It would help to see the price on the map.' };
  it('accepts a message and keeps its paragraphs, tidying spaces and runs of blank lines', () => {
    const r = createFeedbackSchema.parse({ ...ok, message: '  First   line \n\n\n\n Second line, long enough  ' });
    expect(r.message).toBe('First line\n\nSecond line, long enough');
  });
  it('takes an optional app version', () => {
    expect(createFeedbackSchema.parse({ ...ok, app_version: ' 1.2.3 ' }).app_version).toBe('1.2.3');
  });
  it('rejects too short, too long, an unknown kind and unknown fields', () => {
    expect(createFeedbackSchema.safeParse({ ...ok, message: 'short' }).success).toBe(false);
    expect(createFeedbackSchema.safeParse({ ...ok, message: 'x'.repeat(1001) }).success).toBe(false);
    expect(createFeedbackSchema.safeParse({ ...ok, category: 'RUDE' }).success).toBe(false);
    expect(createFeedbackSchema.safeParse({ ...ok, user_id: 'x' }).success).toBe(false);
  });
});
