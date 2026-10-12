import {
  createPropertySchema,
  initiatePaymentSchema,
  listPropertiesQuerySchema,
  normalizePlaceName,
  registerAgencySchema,
  registerUserSchema,
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
    ['', { surprise: 1 }],
  ])('rejects bad %s', (field, patch) => {
    const r = createPropertySchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(fields(r)).toContain(field);
  });

  it('accepts every property type in create, update and list filters', () => {
    for (const type of ['APARTMENT', 'HOUSE_HAWILI', 'LAND', 'OFFICE_SHOP', 'GARDEN_VILLA']) {
      expect(createPropertySchema.safeParse({ ...valid, type }).success).toBe(true);
      expect(updatePropertySchema.safeParse({ type }).success).toBe(true);
      expect(listPropertiesQuerySchema.safeParse({ type }).success).toBe(true);
    }
    expect(createPropertySchema.safeParse({ ...valid, type: 'garden_villa' }).success).toBe(false);
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
  ])('rejects %j', (query) => {
    expect(listPropertiesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('registration and payment schemas', () => {
  it('registerUserSchema takes a name and optional avatar only', () => {
    expect(registerUserSchema.parse({ full_name: ' Ahmad  Zia ' })).toEqual({ full_name: 'Ahmad Zia' });
    expect(registerUserSchema.safeParse({ full_name: 'Ahmad Zia', role: 'ADMIN' }).success).toBe(false);
  });
  it('registerAgencySchema validates the licence URL and coordinates', () => {
    const agency = { agency_name: 'Noor', license_photo: 'https://x.test/l.jpg', address: 'Kabul city', lat: 34.5, lng: 69.1 };
    expect(registerAgencySchema.safeParse(agency).success).toBe(true);
    expect(registerAgencySchema.safeParse({ ...agency, license_photo: 'file:///etc/passwd' }).success).toBe(false);
    expect(registerAgencySchema.safeParse({ ...agency, is_verified: true }).success).toBe(false);
  });
  it('initiatePaymentSchema is a closed union with no client-chosen amount', () => {
    expect(initiatePaymentSchema.safeParse({ purpose: 'SUBSCRIPTION', package_type: 'YEARLY' }).success).toBe(true);
    expect(initiatePaymentSchema.safeParse({ purpose: 'SUBSCRIPTION', package_type: 'YEARLY', amount: 1 }).success).toBe(false);
    expect(initiatePaymentSchema.safeParse({ purpose: 'LADDER', property_id: 'x' }).success).toBe(false);
  });
});
