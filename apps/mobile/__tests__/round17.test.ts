import {
  addressFrom,
  plainName,
  startsWithProvince,
  swapProvince,
} from '../src/utils/addressLine';
import { hasRoomsFor, NO_ROOMS } from '../src/constants/propertyRooms';
import { shortTitle } from '../src/map/markers';

describe('the address as one line', () => {
  it('says province, district, neighbourhood and street, wide to narrow', () => {
    expect(
      addressFrom({
        province: 'نیمروز',
        district: 'ولسوالی زرنج',
        neighborhood: 'ناحیه ۴',
        street: 'پهلوی چمن الکلاسیکو',
      }),
    ).toBe('نیمروز، زرنج، ناحیه ۴، پهلوی چمن الکلاسیکو');
  });

  it('leaves out what is missing and says nothing twice', () => {
    expect(
      addressFrom({ province: 'نیمروز', district: 'نیمروز', neighborhood: '', street: '' }),
    ).toBe('نیمروز');
    expect(
      addressFrom({ province: '', district: '', neighborhood: ' ', street: '' }),
    ).toBe('');
  });

  it('drops the words a map adds to a place name', () => {
    expect(plainName('ولسوالی زرنج')).toBe('زرنج');
    expect(plainName('ولایت هرات')).toBe('هرات');
    expect(plainName('زرنج')).toBe('زرنج');
  });

  it('knows an address that starts with the province, as a whole word', () => {
    expect(startsWithProvince('نیمروز، زرنج', 'نیمروز')).toBe(true);
    expect(startsWithProvince('نیمروز', 'نیمروز')).toBe(true);
    expect(startsWithProvince('نیمروزی، زرنج', 'نیمروز')).toBe(false);
    expect(startsWithProvince('زرنج', '')).toBe(false);
  });

  it('swaps a changed province in an address that was filled in, and leaves a hand-written one alone', () => {
    expect(swapProvince('نیمروز، زرنج، ناحیه ۴', 'نیمروز', 'هلمند')).toBe(
      'هلمند، زرنج، ناحیه ۴',
    );
    expect(swapProvince('نیمروز', 'نیمروز', 'هلمند')).toBe('هلمند');
    expect(swapProvince('کنار پل سرخ', 'نیمروز', 'هلمند')).toBe('کنار پل سرخ');
  });
});

describe('a marker label', () => {
  it('keeps a short title as it is', () => {
    expect(shortTitle('خانه دو طبقه')).toBe('خانه دو طبقه');
  });

  it('cuts a long title at a whole word and adds "…"', () => {
    const cut = shortTitle('خانه دو طبقه نوساز در شهر نو کابل', 18);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(19);
    expect('خانه دو طبقه نوساز در شهر نو کابل').toContain(cut.slice(0, -1));
    expect(cut).not.toMatch(/\s…$/);
  });

  it('cuts a single very long word where it is, and counts blanks once', () => {
    expect(shortTitle('ا'.repeat(40), 10)).toBe(`${'ا'.repeat(10)}…`);
    expect(shortTitle('الف    ب\n\nج', 18)).toBe('الف ب ج');
  });
});

describe('which listings have rooms', () => {
  it('has no bedrooms or bathrooms for a shop, an office, land, a garage, a garden or other', () => {
    for (const type of ['SHOP', 'OFFICE', 'LAND', 'GARAGE', 'GARDEN', 'OTHER'] as const) {
      expect(hasRoomsFor(type)).toBe(false);
    }
    expect(NO_ROOMS).toHaveLength(6);
  });

  it('has them for a house, an apartment and a villa', () => {
    for (const type of ['HOUSE_HAWILI', 'APARTMENT', 'VILLA'] as const) {
      expect(hasRoomsFor(type)).toBe(true);
    }
  });
});
