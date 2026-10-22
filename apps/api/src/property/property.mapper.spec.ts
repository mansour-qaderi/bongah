import { describe, expect, it } from 'vitest';
import { toPropertyDto, type PropertyRowWithAgency } from './property.mapper';

const NOW = new Date('2026-10-21T12:00:00Z');

/** Only the fields the owner's name depends on; the mapper reads the rest as missing. */
const row = (overrides: Record<string, unknown> = {}): PropertyRowWithAgency =>
  ({
    id: 'p1',
    userId: 'u1',
    agencyId: null,
    agency: null,
    user: { fullName: 'احمد ظاهر' },
    price: { toNumber: () => 1000 },
    isFeatured: false,
    featuredUntil: null,
    boundary: null,
    images: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }) as unknown as PropertyRowWithAgency;

describe('toPropertyDto: owner_name', () => {
  it("is a private owner's own name", () => {
    expect(toPropertyDto(row(), NOW).owner_name).toBe('احمد ظاهر');
  });

  it('is trimmed, and null when the owner wrote nothing', () => {
    expect(toPropertyDto(row({ user: { fullName: '  احمد  ' } }), NOW).owner_name).toBe('احمد');
    expect(toPropertyDto(row({ user: { fullName: '   ' } }), NOW).owner_name).toBeNull();
    expect(toPropertyDto(row({ user: { fullName: null } }), NOW).owner_name).toBeNull();
  });

  it('is null when the owner was not loaded (the listing is then shown as "owner")', () => {
    expect(toPropertyDto(row({ user: undefined }), NOW).owner_name).toBeNull();
    expect(toPropertyDto(row({ user: null }), NOW).owner_name).toBeNull();
  });

  it("is null for an agency's listing: it is shown under the agency, not under a staff member", () => {
    const dto = toPropertyDto(
      row({ agencyId: 'ag1', agency: { agencyName: 'دفتر املاک نور' } }),
      NOW,
    );
    expect(dto.owner_name).toBeNull();
    expect(dto.agency_name).toBe('دفتر املاک نور');
  });

  it('never carries the owner phone number', () => {
    const dto = toPropertyDto(
      row({ user: { fullName: 'احمد', phoneNumber: '+93701234567' } }),
      NOW,
    );
    expect(JSON.stringify(dto)).not.toContain('+93701234567');
  });
});
