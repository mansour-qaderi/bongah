import { BadRequestException } from '@nestjs/common';
import { MARKET_CONFIG, marketFromCurrency, marketMismatch, marketOfCurrency, marketOfPoint } from '@bongah/shared-types';
import { assertFitsMarket } from './property.market.js';

describe('the country of a position', () => {
  it.each([
    ['Kabul', 34.53, 69.17, 'AF'],
    ['Herat', 34.34, 62.2, 'AF'],
    ['Kandahar', 31.62, 65.71, 'AF'],
    ['Zaranj, just inside Afghanistan', 30.96, 61.86, 'AF'],
    ['Tehran', 35.69, 51.39, 'IR'],
    ['Mashhad', 36.3, 59.6, 'IR'],
    ['Zahedan', 29.5, 60.86, 'IR'],
    ['Zabol, the Iranian side', 31.03, 61.49, 'IR'],
    ['Taybad, the Iranian side', 34.74, 60.78, 'IR'],
    ['Islam Qala, the Afghan side', 34.66, 61.0, 'AF'],
    ['Shiraz', 29.59, 52.58, 'IR'],
  ])('puts %s in %s', (_name, lat, lng, market) => {
    expect(marketOfPoint(lat, lng)).toBe(market);
  });

  it('says nothing for a place in neither (Istanbul, Delhi) or for a broken position', () => {
    expect(marketOfPoint(41.0, 28.97)).toBeNull();
    expect(marketOfPoint(28.6, 77.2)).toBeNull();
    expect(marketOfPoint(Number.NaN, 50)).toBeNull();
  });
});

describe('market rules', () => {
  it('gives each market its own currencies, deals and kinds of property', () => {
    expect(MARKET_CONFIG.AF.currencies).toEqual(['AFGHANI', 'USD']);
    expect(MARKET_CONFIG.IR.currencies).toEqual(['TOMAN']);
    expect(MARKET_CONFIG.AF.dealTypes).toEqual(['SALE', 'RENT', 'MORTGAGE_GROWI', 'DAILY_RENT']);
    expect(MARKET_CONFIG.IR.dealTypes).toEqual(['SALE', 'MORTGAGE_RENT', 'MORTGAGE_GROWI', 'DAILY_RENT']);
    expect(MARKET_CONFIG.IR.propertyTypes).toEqual(['APARTMENT', 'HOUSE_HAWILI', 'VILLA_GARDEN', 'LAND', 'LAND_OLD', 'COMMERCIAL']);
    expect(MARKET_CONFIG.AF.propertyTypes).toEqual(
      ['HOUSE_HAWILI', 'APARTMENT', 'SHOP', 'OFFICE', 'WAREHOUSE', 'LAND', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER'],
    );
    expect(MARKET_CONFIG.IR.features).toEqual(
      ['DUPLEX', 'PENTHOUSE', 'SINGLE_DEED', 'MASTER_ROOM', 'ELEVATOR', 'PARKING', 'STORAGE'],
    );
    expect(MARKET_CONFIG.AF.features).toEqual([]);
    expect(MARKET_CONFIG.AF.deedTypes).toEqual(['SHARI', 'ORFI']);
    expect(MARKET_CONFIG.IR.deedTypes).toEqual([]);
  });

  it('starts a person in the market of their currency, else Afghanistan', () => {
    expect(marketOfCurrency('TOMAN')).toBe('IR');
    expect(marketOfCurrency('RIAL')).toBe('IR');
    expect(marketOfCurrency('AFGHANI')).toBe('AF');
    expect(marketOfCurrency('USD')).toBeNull();
    expect(marketFromCurrency('RIAL')).toBe('IR');
    expect(marketFromCurrency('USD')).toBe('AF');
    expect(marketFromCurrency(null)).toBe('AF');
  });

  it.each([
    ['AF', { currency: 'TOMAN' }, 'CURRENCY_NOT_IN_MARKET'],
    ['IR', { currency: 'AFGHANI' }, 'CURRENCY_NOT_IN_MARKET'],
    ['AF', { deal_type: 'DAILY_RENT', type: 'APARTMENT' }, 'DAILY_RENT_TYPE'],
    ['AF', { deal_type: 'MORTGAGE_RENT' }, 'DEAL_NOT_IN_MARKET'],
    ['IR', { deal_type: 'RENT' }, 'DEAL_NOT_IN_MARKET'],
    ['AF', { type: 'DUPLEX' }, 'TYPE_NOT_IN_MARKET'],
    ['AF', { type: 'COMMERCIAL' }, 'TYPE_NOT_IN_MARKET'],
    ['AF', { type: 'VILLA_GARDEN' }, 'TYPE_NOT_IN_MARKET'],
    ['AF', { type: 'LAND_OLD' }, 'TYPE_NOT_IN_MARKET'],
    ['IR', { type: 'GARAGE' }, 'TYPE_NOT_IN_MARKET'],
    ['IR', { type: 'WAREHOUSE' }, 'TYPE_NOT_IN_MARKET'],
    ['IR', { type: 'DUPLEX' }, 'TYPE_NOT_IN_MARKET'], // a tag now, not a type
    ['IR', { type: 'SHOP' }, 'TYPE_NOT_IN_MARKET'], // «تجاری و اداری» is one type
    ['IR', { type: 'OFFICE' }, 'TYPE_NOT_IN_MARKET'],
    ['IR', { currency: 'RIAL' }, 'CURRENCY_NOT_IN_MARKET'], // Iran prices in toman only
    ['IR', { currency: 'USD' }, 'CURRENCY_NOT_IN_MARKET'],
    ['IR', { deal_type: 'DAILY_RENT', type: 'HOUSE_HAWILI' }, 'DAILY_RENT_TYPE'],
    ['AF', { features: ['ELEVATOR'] }, 'FEATURE_NOT_IN_MARKET'],
    ['IR', { deed_type: 'SHARI' }, 'DEED_NOT_IN_MARKET'],
    ['IR', { deal_type: 'DAILY_RENT', type: 'APARTMENT' }, 'DAILY_RENT_TYPE'],
    ['IR', { lat: 34.5, lng: 69.1 }, 'PIN_OUTSIDE_MARKET'], // Kabul
    ['AF', { lat: 35.7, lng: 51.4 }, 'PIN_OUTSIDE_MARKET'], // Tehran
  ] as const)('%s: %j -> %s', (market, fields, expected) => {
    expect(marketMismatch(market, fields)).toBe(expected);
  });

  it.each([
    ['AF', { currency: 'AFGHANI', deal_type: 'MORTGAGE_GROWI', type: 'HOUSE_HAWILI', lat: 34.5, lng: 69.1 }],
    ['AF', { currency: 'USD' }],
    ['IR', { currency: 'TOMAN', deal_type: 'DAILY_RENT', type: 'VILLA_GARDEN', lat: 36.55, lng: 53.06 }],
    ['IR', { currency: 'TOMAN', deal_type: 'DAILY_RENT', type: 'VILLA_GARDEN' }],
    ['IR', { currency: 'TOMAN', deal_type: 'MORTGAGE_GROWI', type: 'APARTMENT', features: ['DUPLEX', 'PENTHOUSE'] }],
    ['IR', { type: 'HOUSE_HAWILI', deal_type: 'SALE' }],
    ['IR', { type: 'LAND', deal_type: 'SALE' }],
    ['IR', { deal_type: 'MORTGAGE_RENT', type: 'COMMERCIAL' }],
    ['IR', { type: 'LAND_OLD', features: ['SINGLE_DEED'] }],
    ['IR', { features: ['ELEVATOR', 'PARKING', 'STORAGE', 'MASTER_ROOM'] }],
    ['AF', { type: 'WAREHOUSE', deed_type: 'ORFI' }],
    ['AF', { features: [], deed_type: null }],
    ['IR', {}],
  ] as const)('%s accepts %j', (market, fields) => {
    expect(marketMismatch(market, fields)).toBeNull();
  });

  it('reports the field to mark, with a stable code', () => {
    try {
      assertFitsMarket('AF', { currency: 'TOMAN' });
      throw new Error('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'MARKET_MISMATCH',
        market: 'AF',
        errors: [{ field: 'currency' }],
      });
    }
    expect(() => assertFitsMarket('IR', { currency: 'TOMAN', deal_type: 'DAILY_RENT', type: 'VILLA_GARDEN' })).not.toThrow();
    try {
      assertFitsMarket('AF', { features: ['PARKING'] });
      throw new Error('should have refused');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({ errors: [{ field: 'features' }] });
    }
  });
});
