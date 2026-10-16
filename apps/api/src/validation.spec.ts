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
    for (const type of ['HOUSE_HAWILI', 'APARTMENT', 'OFFICE_SHOP', 'LAND', 'GARDEN_VILLA', 'GARAGE_OTHER']) {
      expect(createPropertySchema.safeParse({ ...valid, type }).success).toBe(true);
      expect(updatePropertySchema.safeParse({ type }).success).toBe(true);
      expect(listPropertiesQuerySchema.safeParse({ type }).success).toBe(true);
    }
    expect(createPropertySchema.safeParse({ ...valid, type: 'garden_villa' }).success).toBe(false);
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

  it('treats the description as optional', () => {
    const { description: _desc, ...noDescription } = valid;
    expect(createPropertySchema.safeParse(noDescription).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...valid, description: '' }).success).toBe(true);
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
  it('createPropertySchema takes none, null, or a unit of the chosen type', () => {
    expect(createPropertySchema.safeParse(valid).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...valid, unit_type: null }).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...valid, unit_type: 'STUDIO' }).success).toBe(true);
    expect(createPropertySchema.safeParse({ ...valid, type: 'HOUSE_HAWILI', unit_type: 'DUPLEX' }).success).toBe(true);
  });
  it('createPropertySchema refuses a unit of another type, and an unknown unit', () => {
    const wrong = createPropertySchema.safeParse({ ...valid, unit_type: 'DUPLEX' });
    expect(wrong.success).toBe(false);
    expect(fields(wrong)).toContain('unit_type');
    expect(createPropertySchema.safeParse({ ...valid, unit_type: 'PALACE' }).success).toBe(false);
  });
  it('updatePropertySchema checks the pair only when both are sent', () => {
    expect(updatePropertySchema.safeParse({ unit_type: 'DUPLEX' }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ unit_type: null }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ type: 'APARTMENT', unit_type: 'FLAT' }).success).toBe(true);
    expect(updatePropertySchema.safeParse({ type: 'APARTMENT', unit_type: 'DUPLEX' }).success).toBe(false);
  });
  it('listPropertiesQuerySchema takes a unit only with a type that has it', () => {
    expect(listPropertiesQuerySchema.safeParse({ type: 'HOUSE_HAWILI', unit_type: 'DUPLEX' }).success).toBe(true);
    expect(listPropertiesQuerySchema.safeParse({ type: 'APARTMENT', unit_type: 'DUPLEX' }).success).toBe(false);
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
