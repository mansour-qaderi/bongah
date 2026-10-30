import {
  DEAL_TYPES,
  IRAN_BOUNDS,
  MARKET_CONFIG,
  PROPERTY_TYPES,
  type DealType,
  type Market,
} from '@bongah/shared-types';
import { normalizePlaceName, placeName } from '@bongah/validation';
import i18n from 'i18next';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import {
  ALL_PROVINCES,
  IRAN_PROVINCES,
  PROVINCES,
  findProvince,
  matchProvince,
  provinceLabel,
  provincesFor,
  provinceValue,
} from '../src/constants/provinces';
import { priceStops } from '../src/constants/priceStops';
import { compactAmount, formatCurrency } from '../src/i18n/format';
import { dealPriceLabel, dealTypeLabel, marketName } from '../src/i18n/market';
import { currentPropertyType, propertyTypeLabel } from '../src/i18n/propertyType';
import {
  IRAN_CAMERA,
  AFGHANISTAN_CAMERA,
  isInsideMarket,
  isInsideSupportedArea,
  marketCamera,
} from '../src/map/geo';
import {
  addressFromHits,
  nearestProvince,
  provinceFromIsoCode,
} from '../src/map/geocode';
import { PROPERTY_ICONS, PROPERTY_LINE_ICONS } from '../src/map/markers';
import { reconcileChoices, typesForDeal } from '../src/market/options';
import { dealColors } from '../src/theme';

const TEHRAN = { latitude: 35.6892, longitude: 51.389 };
const KABUL = { latitude: 34.5281, longitude: 69.1723 };

beforeAll(async () => {
  await initI18n();
});

describe('Iran provinces', () => {
  it('lists the 31 provinces once, apart from the 34 Afghan ones', () => {
    expect(IRAN_PROVINCES).toHaveLength(31);
    expect(PROVINCES).toHaveLength(34);
    expect(ALL_PROVINCES).toHaveLength(65);
    expect(new Set(ALL_PROVINCES.map(p => p.id)).size).toBe(65);
    expect(new Set(ALL_PROVINCES.map(provinceValue)).size).toBe(65);
    expect(provincesFor('IR')).toBe(IRAN_PROVINCES);
    expect(provincesFor('AF')).toBe(PROVINCES);
  });

  it('stores names the API accepts, and centres each province inside Iran', () => {
    for (const p of IRAN_PROVINCES) {
      expect(provinceValue(p)).toBe(normalizePlaceName(provinceValue(p)));
      expect({ id: p.id, ok: placeName(60).safeParse(provinceValue(p)).success }).toEqual({ id: p.id, ok: true });
      expect(isInsideMarket({ latitude: p.lat, longitude: p.lng }, 'IR')).toBe(true);
      expect(p.name.prs.trim()).not.toBe('');
      expect(p.name.ps.trim()).not.toBe('');
    }
  });

  it('finds a province of either country from what is stored on a listing', () => {
    expect(findProvince('تهران')?.id).toBe('tehran');
    expect(findProvince('مازندران')?.id).toBe('mazandaran');
    expect(findProvince('کابل')?.id).toBe('kabul');
    expect(provinceLabel('خراسان رضوی', 'ps')).toBe('خراسان رضوي');
    expect(provinceLabel('ناشناخته', 'prs')).toBe('ناشناخته');
  });

  it('reads what a geocoder calls a province', () => {
    expect(matchProvince('Tehran Province')?.id).toBe('tehran');
    expect(matchProvince('استان تهران')).toBeNull(); // «استان» is not a word we strip: the caller falls back to the nearest capital
    expect(matchProvince('Isfahan')?.id).toBe('isfahan');
    expect(matchProvince('مشهد')?.id).toBe('khorasan-razavi'); // by the capital
    expect(matchProvince('Kabul Province')?.id).toBe('kabul');
  });

  it('names a province from ISO 3166-2 codes of both countries', () => {
    expect(provinceFromIsoCode('IR-07')?.id).toBe('tehran');
    expect(provinceFromIsoCode('ir-30')?.id).toBe('khorasan-razavi');
    expect(provinceFromIsoCode('AF-KAB')?.id).toBe('kabul');
    expect(provinceFromIsoCode('IR-99')).toBeNull();
  });

  it('picks the nearest capital of the right country', () => {
    expect(nearestProvince(TEHRAN, 'IR').id).toBe('tehran');
    expect(nearestProvince(TEHRAN).id).toBe('tehran');
    expect(nearestProvince(KABUL).id).toBe('kabul');
    // Told the country, it never answers with the other one.
    expect(nearestProvince(KABUL, 'IR').market).toBe('IR');
    expect(nearestProvince(TEHRAN, 'AF').market).toBeUndefined();
  });
});

describe('the map of each country', () => {
  it('knows which country a point is in', () => {
    expect(isInsideMarket(TEHRAN, 'IR')).toBe(true);
    expect(isInsideMarket(TEHRAN, 'AF')).toBe(false);
    expect(isInsideMarket(KABUL, 'AF')).toBe(true);
    expect(isInsideMarket(KABUL, 'IR')).toBe(false);
    expect(isInsideSupportedArea(TEHRAN)).toBe(true);
    expect(isInsideSupportedArea(KABUL)).toBe(true);
    expect(isInsideSupportedArea({ latitude: 48.85, longitude: 2.35 })).toBe(false);
  });

  it('opens each country on its own view', () => {
    expect(marketCamera('AF')).toBe(AFGHANISTAN_CAMERA);
    expect(marketCamera('IR')).toBe(IRAN_CAMERA);
    expect(IRAN_CAMERA.center[0]).toBeGreaterThan(IRAN_BOUNDS.minLng);
    expect(IRAN_CAMERA.center[0]).toBeLessThan(IRAN_BOUNDS.maxLng);
  });

  it('accepts a search hit only inside the country asked about', () => {
    const hit = (lat: number, lon: number) => [{ lat: String(lat), lon: String(lon), boundingbox: ['35.6', '35.8', '51.3', '51.5'] }];
    expect(addressFromHits(hit(35.6892, 51.389), 'IR').status).toBe('found');
    expect(addressFromHits(hit(35.6892, 51.389), 'AF').status).toBe('none');
    expect(addressFromHits(hit(34.5281, 69.1723)).status).toBe('found'); // Afghanistan by default
    expect(addressFromHits(hit(34.5281, 69.1723), 'IR').status).toBe('none');
  });
});

describe('the options of each form', () => {
  it('limits a daily rental to a villa or a garden (in Iran the one kind «باغ و ویلا»)', () => {
    expect(typesForDeal('IR', 'DAILY_RENT')).toEqual(['VILLA_GARDEN']);
    expect(typesForDeal('IR', 'SALE')).toEqual(MARKET_CONFIG.IR.propertyTypes);
    expect(typesForDeal('AF', 'RENT')).toEqual(MARKET_CONFIG.AF.propertyTypes);
  });

  it('changes only what the new country does not have', () => {
    // Afghan defaults move to Iran: the money and the deal become Iran's, a type Iran also has stays.
    expect(reconcileChoices('IR', { deal: 'SALE', type: 'APARTMENT', currency: 'AFGHANI' })).toEqual({ deal: 'SALE', type: 'APARTMENT', currency: 'TOMAN' });
    // Iran prices in toman only: a dollar (or a rial) becomes the toman, a mortgage stays.
    expect(reconcileChoices('IR', { deal: 'MORTGAGE_GROWI', type: 'APARTMENT', currency: 'USD' })).toEqual({ deal: 'MORTGAGE_GROWI', type: 'APARTMENT', currency: 'TOMAN' });
    expect(reconcileChoices('IR', { deal: 'SALE', type: 'APARTMENT', currency: 'RIAL' }).currency).toBe('TOMAN');
    // A plain rent, a shop and an office are Afghanistan's: Iran's rental is a mortgage-and-rent, its shops are «تجاری و اداری».
    expect(reconcileChoices('IR', { deal: 'RENT', type: 'SHOP', currency: 'USD' })).toEqual({ deal: 'SALE', type: 'APARTMENT', currency: 'TOMAN' });
    // A house and a plot are in Iran's list too, and stay.
    expect(reconcileChoices('IR', { deal: 'SALE', type: 'HOUSE_HAWILI', currency: 'TOMAN' }).type).toBe('HOUSE_HAWILI');
    expect(reconcileChoices('IR', { deal: 'SALE', type: 'LAND', currency: 'TOMAN' }).type).toBe('LAND');
    // Back to Afghanistan: a duplex and tomans go; a daily rental stays (both markets offer it) and narrows to a villa.
    expect(reconcileChoices('AF', { deal: 'DAILY_RENT', type: 'DUPLEX', currency: 'TOMAN' })).toEqual({ deal: 'DAILY_RENT', type: 'GARDEN', currency: 'AFGHANI' });
    expect(reconcileChoices('AF', { deal: 'MORTGAGE_RENT', type: 'DUPLEX', currency: 'TOMAN' })).toEqual({ deal: 'SALE', type: 'HOUSE_HAWILI', currency: 'AFGHANI' });
    // A garage does not exist in Iran.
    expect(reconcileChoices('IR', { deal: 'SALE', type: 'GARAGE', currency: 'TOMAN' }).type).toBe('APARTMENT');
  });

  it('turns a daily rental of a flat into a daily rental of a villa-garden', () => {
    expect(reconcileChoices('IR', { deal: 'DAILY_RENT', type: 'APARTMENT', currency: 'TOMAN' })).toEqual({ deal: 'DAILY_RENT', type: 'VILLA_GARDEN', currency: 'TOMAN' });
    expect(reconcileChoices('IR', { deal: 'DAILY_RENT', type: 'VILLA_GARDEN', currency: 'TOMAN' }).type).toBe('VILLA_GARDEN');
    // Afghanistan keeps the garden and the villa apart.
    expect(typesForDeal('AF', 'SALE')).toEqual(expect.arrayContaining(['GARDEN', 'VILLA', 'WAREHOUSE']));
  });
});

describe('the words of each country', () => {
  const t = i18n.t.bind(i18n);

  it('says a deal in the listing\'s own country\'s words', () => {
    expect(dealTypeLabel('MORTGAGE_GROWI', 'AF', t)).toBe('گروی');
    expect(dealTypeLabel('MORTGAGE_GROWI', 'IR', t)).toBe('رهن کامل');
    expect(dealTypeLabel('SALE', 'IR', t)).toBe('فروش');
    expect(dealTypeLabel('MORTGAGE_RENT', 'IR', t)).toBe('اجاره');
    expect(dealTypeLabel('RENT', 'IR', t)).toBe('اجاره');
    expect(dealTypeLabel('DAILY_RENT', 'IR', t)).toBe('اجاره روزانه');
    // A listing from a server that predates markets is Afghan.
    expect(dealTypeLabel('SALE', undefined, t)).toBe(prs.dealType.SALE);
  });

  it('words the price field per deal and country', () => {
    expect(dealPriceLabel('MORTGAGE_GROWI', 'IR', t)).toBe(prs.dealPriceIR.MORTGAGE_GROWI);
    expect(dealPriceLabel('RENT', 'AF', t)).toBe(prs.dealPrice.RENT);
  });

  it('names the countries and the new kinds of property', () => {
    expect(marketName('AF', t)).toBe('افغانستان');
    expect(marketName('IR', t)).toBe('ایران');
    expect(propertyTypeLabel('DUPLEX', t)).toBe('دوبلکس');
    expect(propertyTypeLabel('COMMERCIAL', t)).toBe('تجاری');
    expect(currentPropertyType('DUPLEX')).toBe('DUPLEX');
  });

  it('has every deal, type and currency in both languages, with the same keys', () => {
    for (const lang of [prs, ps]) {
      for (const deal of DEAL_TYPES) {
        expect((lang.dealType as Record<string, string>)[deal]).toBeTruthy();
        expect((lang.dealTypeIR as Record<string, string>)[deal]).toBeTruthy();
        expect((lang.dealPrice as Record<string, string>)[deal]).toBeTruthy();
        expect((lang.dealPriceIR as Record<string, string>)[deal]).toBeTruthy();
      }
      for (const type of PROPERTY_TYPES) {
        expect((lang.propertyType as Record<string, string>)[type]).toBeTruthy();
        expect((lang.add.titleExamples as Record<string, string>)[type]).toBeTruthy();
      }
      expect(lang.currency.TOMAN).toBeTruthy();
      expect(lang.currencySymbol.RIAL).toBeTruthy();
      expect(lang.manualPay.kind.SHEBA).toBeTruthy();
    }
    const keys = (value: unknown, path = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([k, v]) => keys(v, `${path}${k}.`))
        : [path];
    expect(keys(ps).sort()).toEqual(keys(prs).sort());
  });

  it('does not leave an unfilled {{market}} in a message that takes one', () => {
    const text = i18n.t('map.outside', { market: marketName('IR', t) });
    expect(text).toContain('ایران');
    expect(text).not.toContain('{{');
  });
});

describe('prices in tomans and rials', () => {
  it('writes the currency after the number', () => {
    expect(formatCurrency(2_500_000_000, 'TOMAN')).toContain('تومان');
    expect(formatCurrency(25_000_000_000, 'RIAL')).toContain('ریال');
    expect(formatCurrency(1500, 'AFGHANI')).toContain('؋');
  });

  it('shortens billions for the map', () => {
    expect(compactAmount(3_500_000_000)).toEqual({ value: 3.5, unit: 'billion' });
  });

  it('has a price slider for every deal in every currency, ending open', () => {
    for (const currency of ['AFGHANI', 'USD', 'TOMAN', 'RIAL'] as const) {
      for (const deal of [...DEAL_TYPES, undefined] as (DealType | undefined)[]) {
        const stops = priceStops(deal, currency);
        expect(stops[0]).toBe(0);
        expect([...stops].sort((a, b) => a - b)).toEqual([...stops]);
        expect(new Set(stops).size).toBe(stops.length);
      }
    }
    // A rial is a tenth of a toman: the same amount of money, one more zero.
    expect(priceStops('SALE', 'RIAL')).toEqual(priceStops('SALE', 'TOMAN').map(n => n * 10));
  });
});

describe('what a map shows for every kind of listing', () => {
  it('has an icon, an emoji and a colour for every property type and deal', () => {
    for (const type of PROPERTY_TYPES) {
      expect(PROPERTY_LINE_ICONS[type]).toBeTruthy();
      expect(PROPERTY_ICONS[type]).toBeTruthy();
    }
    for (const deal of DEAL_TYPES) expect(dealColors[deal].main).toMatch(/^#/);
    const mains = new Set(DEAL_TYPES.map(d => dealColors[d].main));
    expect(mains.size).toBe(DEAL_TYPES.length);
  });

  it('offers each country the kinds and deals the task names', () => {
    const ir = MARKET_CONFIG.IR as { dealTypes: readonly DealType[]; propertyTypes: readonly string[]; currencies: readonly string[] };
    expect(ir.dealTypes).toEqual(['SALE', 'MORTGAGE_RENT', 'MORTGAGE_GROWI', 'DAILY_RENT']);
    expect(ir.propertyTypes).toEqual(['APARTMENT', 'HOUSE_HAWILI', 'VILLA_GARDEN', 'LAND', 'LAND_OLD', 'COMMERCIAL']);
    expect(ir.currencies).toEqual(['TOMAN']); // toman only: no rial, no dollar
    const af = MARKET_CONFIG.AF as { dealTypes: readonly DealType[]; currencies: readonly string[] };
    expect(af.dealTypes).toEqual(['SALE', 'RENT', 'MORTGAGE_GROWI', 'DAILY_RENT']);
    expect(MARKET_CONFIG.AF.propertyTypes).toEqual(['HOUSE_HAWILI', 'APARTMENT', 'SHOP', 'OFFICE', 'WAREHOUSE', 'LAND', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER']);
    expect(MARKET_CONFIG.AF.deedTypes).toEqual(['SHARI', 'ORFI']);
    expect(MARKET_CONFIG.IR.features).toHaveLength(7);
    expect(af.currencies).toEqual(['AFGHANI', 'USD']);
    const markets: Market[] = ['AF', 'IR'];
    expect(markets.map(m => MARKET_CONFIG[m].payment)).toEqual(['HESABPAY', 'CARD_TO_CARD']);
  });
});
