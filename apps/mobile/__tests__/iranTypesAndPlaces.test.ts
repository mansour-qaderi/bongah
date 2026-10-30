import { MARKET_CONFIG } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import i18n from 'i18next';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { propertyTypeLabel } from '../src/i18n/propertyType';
import { placeText } from '../src/i18n/market';

beforeAll(async () => {
  await initI18n();
});

describe('the six kinds of property in Iran', () => {
  const t = i18n.t.bind(i18n);

  it('are named the Iranian way, and every one the market offers has a name in both languages', () => {
    const named = MARKET_CONFIG.IR.propertyTypes.map(type => propertyTypeLabel(type, t, 'IR'));
    expect(named).toEqual(['آپارتمان', 'خانه / ویلایی', 'باغ و ویلا', 'زمین', 'خانه کلنگی', 'تجاری و اداری']);
    for (const type of MARKET_CONFIG.IR.propertyTypes) {
      expect((prs.propertyTypeIR as Record<string, string>)[type]).toBeTruthy();
      expect((ps.propertyTypeIR as Record<string, string>)[type]?.trim()).toBeTruthy();
    }
  });

  it('keep Afghanistan’s names when the listing is Afghan', () => {
    expect(propertyTypeLabel('HOUSE_HAWILI', t, 'AF')).toBe(prs.propertyType.HOUSE_HAWILI);
    expect(propertyTypeLabel('HOUSE_HAWILI', t)).toBe(prs.propertyType.HOUSE_HAWILI);
    expect(propertyTypeLabel('HOUSE_HAWILI', t, 'IR')).toBe('خانه / ویلایی');
    expect(propertyTypeLabel('COMMERCIAL', t, 'AF')).toBe(prs.propertyType.COMMERCIAL);
  });
});

describe('the words for a place in Iran', () => {
  const t = i18n.t.bind(i18n);

  it('say «استان / شهر» for Iran and «ولایت» for Afghanistan', () => {
    expect(placeText('province', 'IR', t)).toBe('استان / شهر');
    expect(placeText('province', 'AF', t)).toBe(prs.home.province);
    expect(prs.home.province).toBe('ولایت');
    expect(placeText('districtPlaceholder', 'IR', t)).toBe('مثلاً سعادت‌آباد، خیابان فرهنگ');
    expect(placeText('districtPlaceholder', 'AF', t)).toBe(prs.home.districtPlaceholder);
  });

  it('are in both languages for every key', () => {
    expect(Object.keys(ps.homeIR).sort()).toEqual(Object.keys(prs.homeIR).sort());
    expect(Object.keys(ps.propertyTypeIR).sort()).toEqual(Object.keys(prs.propertyTypeIR).sort());
  });
});
