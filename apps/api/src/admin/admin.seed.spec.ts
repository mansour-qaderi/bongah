import { DEFAULT_ADMIN_PHONE, isValidSeedPhone, seedAdminPhone } from './admin.seed.js';

describe('admin seed', () => {
  it('seeds the developer number unless told otherwise', () => {
    expect(DEFAULT_ADMIN_PHONE).toBe('0790049201');
    expect(isValidSeedPhone(DEFAULT_ADMIN_PHONE)).toBe(true);
    expect(seedAdminPhone({})).toBe('0790049201');
    expect(seedAdminPhone({ SEED_ADMIN_PHONE: '  ' })).toBe('0790049201');
    expect(seedAdminPhone({ SEED_ADMIN_PHONE: ' 0700123456 ' })).toBe('0700123456');
  });
});
