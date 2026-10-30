import { beforeEach, describe, expect, it } from 'vitest';
import { IRAN_BOUNDS, MARKET_CONFIG } from '@bongah/shared-types';
import { checkDraft } from '@/lib/import/draft-validation';
import { parseText } from '@/lib/import/parse-text';
import { guessMapping, normalizeCurrency, normalizeDeal, normalizeDeed, normalizeFeatures, normalizeType, rowsFromTable } from '@/lib/import/parse-file';
import { emptyDraft, type DraftRow } from '@/lib/import/types';
import { labelsFor } from '@/lib/labels';
import { activeMarket, draftMismatch, reconcileDraft, setActiveMarket, startCurrency, typesForDeal } from '@/lib/market';
import { IRAN_PROVINCES, marketOfProvince, nearestProvince, PROVINCES, provinceNameLabel, provincesFor } from '@/lib/provinces';
import { pinnedFor, DEFAULT_PINNED } from '@/hooks/use-pinned';
import { prs } from '@/i18n/messages/prs';
import { ps } from '@/i18n/messages/ps';
import { setActiveLanguage } from '@/i18n/active';

// The market store only moves in a browser; these tests are about pure logic, so give it one.
const win = globalThis as unknown as { window?: unknown };
beforeEach(() => {
  win.window ??= { localStorage: { getItem: () => null, setItem: () => undefined } };
  setActiveLanguage('prs');
  setActiveMarket('AF');
});

const row = (over: Partial<DraftRow> = {}): DraftRow => ({
  ...emptyDraft('form'),
  title: 'ویلای دو طبقه در شمال',
  type: 'VILLA_GARDEN',
  deal_type: 'SALE',
  price: '9000000000',
  currency: 'TOMAN',
  area_sqm: '320',
  province: 'مازندران',
  address: 'نوشهر، خیابان ساحلی',
  market: 'IR',
  ...over,
});

describe('Iran provinces', () => {
  it('lists the 31 provinces once each, every capital inside Iran', () => {
    expect(IRAN_PROVINCES).toHaveLength(31);
    expect(new Set(IRAN_PROVINCES.map((p) => p.id)).size).toBe(31);
    expect(new Set(IRAN_PROVINCES.map((p) => p.name)).size).toBe(31);
    for (const p of IRAN_PROVINCES) {
      expect(p.lat, p.name).toBeGreaterThanOrEqual(IRAN_BOUNDS.minLat);
      expect(p.lat, p.name).toBeLessThanOrEqual(IRAN_BOUNDS.maxLat);
      expect(p.lng, p.name).toBeGreaterThanOrEqual(IRAN_BOUNDS.minLng);
      expect(p.lng, p.name).toBeLessThanOrEqual(IRAN_BOUNDS.maxLng);
    }
  });

  it('keeps Afghan and Iranian names apart, so a stored name says which country it is in', () => {
    const afghan = new Set(PROVINCES.map((p) => p.name));
    for (const p of IRAN_PROVINCES) expect(afghan.has(p.name), p.name).toBe(false);
    expect(marketOfProvince('کابل')).toBe('AF');
    expect(marketOfProvince('تهران')).toBe('IR');
    expect(marketOfProvince('جایی نیست')).toBeNull();
    expect(provincesFor('IR')).toBe(IRAN_PROVINCES);
    expect(provincesFor('AF')).toBe(PROVINCES);
  });

  it('names the nearest capital, in either country, or inside the market asked for', () => {
    expect(nearestProvince(35.7, 51.4).id).toBe('tehran');
    expect(nearestProvince(36.3, 59.6).id).toBe('khorasan-razavi');
    expect(nearestProvince(34.53, 69.17).id).toBe('kabul');
    // Herat is closer to Mashhad than to anything else in Iran's list, but inside Afghanistan's it is Herat.
    expect(nearestProvince(34.34, 62.2, 'AF').id).toBe('herat');
    expect(nearestProvince(34.34, 62.2, 'IR').id).not.toBe('herat');
  });

  it('writes the Pashto spelling of an Iranian province for display only', () => {
    expect(provinceNameLabel('گیلان', 'ps')).toBe('ګیلان');
    expect(provinceNameLabel('تهران', 'prs')).toBe('تهران');
  });
});

describe('the words of each market', () => {
  it('says the deals the way each country does', () => {
    expect(labelsFor('prs', 'AF').deal).toMatchObject({ SALE: 'فروشی', RENT: 'کرایی', MORTGAGE_GROWI: 'گروی', DAILY_RENT: 'اجاره روزانه' });
    expect(labelsFor('prs', 'IR').deal).toMatchObject({ SALE: 'فروش', MORTGAGE_RENT: 'اجاره', MORTGAGE_GROWI: 'رهن کامل', DAILY_RENT: 'اجاره روزانه' });
    // An old Iranian listing of a plain rent still has its word.
    expect(labelsFor('prs', 'IR').deal.RENT).toBe('اجاره');
    expect(labelsFor('ps', 'IR').deal.MORTGAGE_GROWI).not.toBe(labelsFor('ps', 'AF').deal.MORTGAGE_GROWI);
  });

  it('names the new property types and currencies in both languages', () => {
    const dari = labelsFor('prs', 'IR');
    expect(dari.type).toMatchObject({ APARTMENT: 'آپارتمان', VILLA_GARDEN: 'باغ و ویلا', LAND_OLD: 'خانه کلنگی', COMMERCIAL: 'تجاری و اداری', HOUSE_HAWILI: 'خانه / ویلایی', LAND: 'زمین', WAREHOUSE: 'گدام' });
    expect(dari.currency).toMatchObject({ TOMAN: 'تومان', RIAL: 'ریال', AFGHANI: 'افغانی' });
    expect(dari.feature).toMatchObject({
      DUPLEX: 'دوبلکس',
      PENTHOUSE: 'پنت‌هاوس',
      SINGLE_DEED: 'سند تک‌برگ',
      MASTER_ROOM: 'مستر روم',
      ELEVATOR: 'آسانسور',
      PARKING: 'پارکینگ',
      STORAGE: 'انباری',
    });
    expect(dari.deed).toEqual({ SHARI: 'قباله شرعی', ORFI: 'عرفی' });
    for (const type of ['WAREHOUSE', 'LAND_OLD', 'VILLA_GARDEN'] as const) expect(labelsFor('ps', 'IR').type[type].trim()).not.toBe('');
  });

  it('has every market message in both languages', () => {
    const keys = Object.keys(prs).filter((k) => /^(market\.|label\.(deal\.IR|feature|deed)\.|title\.IR\.|pm\.(account|number)\.SHEBA|sub\.pay\.|form\.(deposit|monthlyRent|features|deed)|price\.)/.test(k));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect((prs as Record<string, string>)[key]!.trim(), key).not.toBe('');
      expect((ps as Record<string, string>)[key]!.trim(), key).not.toBe('');
    }
  });
});

describe('what a market offers', () => {
  it('lets only a villa or a garden be rented by the day', () => {
    expect(typesForDeal('IR', 'DAILY_RENT')).toEqual(['VILLA_GARDEN']);
    expect(typesForDeal('IR', 'MORTGAGE_RENT')).toEqual(MARKET_CONFIG.IR.propertyTypes);
    expect(typesForDeal('AF', 'RENT')).toEqual(MARKET_CONFIG.AF.propertyTypes);
    expect(typesForDeal('AF', 'SALE')).toEqual(MARKET_CONFIG.AF.propertyTypes);
  });

  it('starts each market in its own currency', () => {
    expect(startCurrency('AF')).toBe('AFGHANI');
    expect(startCurrency('IR')).toBe('TOMAN');
  });

  it('finds what does not fit a market', () => {
    expect(draftMismatch('AF', { currency: 'TOMAN' })).toEqual({ reason: 'CURRENCY_NOT_IN_MARKET', field: 'currency' });
    expect(draftMismatch('AF', { type: 'DUPLEX' })).toEqual({ reason: 'TYPE_NOT_IN_MARKET', field: 'type' });
    expect(draftMismatch('AF', { deal_type: 'DAILY_RENT' })).toBeNull();
    expect(draftMismatch('AF', { deal_type: 'DAILY_RENT', type: 'HOUSE_HAWILI' })).toEqual({ reason: 'DAILY_RENT_TYPE', field: 'type' });
    expect(draftMismatch('IR', { deal_type: 'DAILY_RENT', type: 'APARTMENT' })).toEqual({ reason: 'DAILY_RENT_TYPE', field: 'type' });
    expect(draftMismatch('IR', { deal_type: 'DAILY_RENT', type: 'VILLA_GARDEN', currency: 'TOMAN' })).toBeNull();
    // Iran prices in toman only: neither rial nor dollar.
    expect(draftMismatch('IR', { currency: 'RIAL' })).toEqual({ reason: 'CURRENCY_NOT_IN_MARKET', field: 'currency' });
    expect(draftMismatch('IR', { currency: 'USD' })).toEqual({ reason: 'CURRENCY_NOT_IN_MARKET', field: 'currency' });
    expect(draftMismatch('IR', { deal_type: 'RENT' })).toEqual({ reason: 'DEAL_NOT_IN_MARKET', field: 'deal_type' });
    expect(draftMismatch('AF', { deal_type: 'MORTGAGE_RENT' })).toEqual({ reason: 'DEAL_NOT_IN_MARKET', field: 'deal_type' });
    expect(draftMismatch('IR', { type: 'HOUSE_HAWILI' })).toBeNull(); // «خانه / ویلایی»
    expect(draftMismatch('IR', { type: 'LAND' })).toBeNull();
    expect(draftMismatch('IR', { type: 'SHOP' })).toEqual({ reason: 'TYPE_NOT_IN_MARKET', field: 'type' }); // one «تجاری و اداری» type
    expect(draftMismatch('IR', { type: 'GARAGE' })).toEqual({ reason: 'TYPE_NOT_IN_MARKET', field: 'type' });
    expect(draftMismatch('AF', { type: 'WAREHOUSE', deed_type: 'ORFI' })).toBeNull();
    expect(draftMismatch('AF', { features: ['ELEVATOR'] })).toEqual({ reason: 'FEATURE_NOT_IN_MARKET', field: 'features' });
    expect(draftMismatch('IR', { deed_type: 'SHARI' })).toEqual({ reason: 'DEED_NOT_IN_MARKET', field: 'deed_type' });
    expect(draftMismatch('IR', { features: ['ELEVATOR', 'PARKING'], deed_type: '' })).toBeNull();
  });

  it('clears only what the other country does not have when a draft is switched', () => {
    const afghan = { currency: 'AFGHANI', deal_type: 'MORTGAGE_GROWI', type: 'GARAGE', province: 'کابل', lat: '34.5', lng: '69.2', price: '5' } as const;
    expect(reconcileDraft(afghan, 'IR')).toEqual({ currency: 'TOMAN', type: '', province: '', lat: '', lng: '' });
    const iranian = { currency: 'TOMAN', deal_type: 'DAILY_RENT', type: 'VILLA_GARDEN', province: 'تهران', lat: '35.7', lng: '51.4', price: '5' } as const;
    expect(reconcileDraft(iranian, 'AF')).toEqual({ currency: 'AFGHANI', type: '', province: '', lat: '', lng: '' }); // the daily rental stays: both countries have it
    // Tags are Iran's, the deed Afghanistan's, the monthly rent goes with the deal that has one.
    const tagged = { currency: 'TOMAN', deal_type: 'MORTGAGE_RENT', type: 'APARTMENT', province: '', lat: '', lng: '', price: '5', features: ['ELEVATOR', 'PARKING'] as ('ELEVATOR' | 'PARKING')[], monthly_rent: '8000000' } as const;
    expect(reconcileDraft(tagged, 'AF')).toEqual({ currency: 'AFGHANI', deal_type: '', features: [], monthly_rent: '' });
    expect(reconcileDraft({ ...tagged, features: [], monthly_rent: '', deal_type: 'SALE', deed_type: 'ORFI' }, 'IR')).toEqual({ deed_type: '' });
    expect(reconcileDraft({ ...tagged, deal_type: 'SALE', monthly_rent: '7' }, 'IR')).toEqual({ monthly_rent: '' });
    // Dollars are not an Iranian price (toman only): they become tomans. A sale, the old building, a house and a plot stay.
    expect(reconcileDraft({ ...afghan, currency: 'USD', deal_type: 'SALE', type: 'LAND_OLD', province: '', lat: '', lng: '' }, 'IR')).toEqual({ currency: 'TOMAN' });
    expect(reconcileDraft({ ...afghan, currency: 'TOMAN', deal_type: 'SALE', type: 'HOUSE_HAWILI', province: '', lat: '', lng: '' }, 'IR')).toEqual({});
    // A plain rent and a shop are Afghan words: Iran's form lets go of them.
    expect(reconcileDraft({ ...afghan, currency: 'TOMAN', deal_type: 'RENT', type: 'SHOP', province: '', lat: '', lng: '' }, 'IR')).toEqual({ deal_type: '', type: '' });
  });

  it('leaves a usual currency alone in Afghanistan but starts Iran in tomans unless one was chosen', () => {
    expect(pinnedFor(DEFAULT_PINNED, 'AF').currency).toBe('USD');
    expect(pinnedFor(DEFAULT_PINNED, 'IR').currency).toBe('TOMAN');
    // A dollar chosen for Afghanistan is not carried into Iran, which prices in toman only.
    expect(pinnedFor({ ...DEFAULT_PINNED, currency: 'USD', currencyChosen: true }, 'IR').currency).toBe('TOMAN');
    expect(pinnedFor({ ...DEFAULT_PINNED, currency: 'TOMAN', currencyChosen: true }, 'AF').currency).toBe('AFGHANI');
    expect(pinnedFor({ ...DEFAULT_PINNED, currency: '' }, 'IR').currency).toBe('');
    expect(pinnedFor({ ...DEFAULT_PINNED, province: 'کابل', district: 'ناحیه ۴' }, 'IR')).toMatchObject({ province: '', district: '' });
    expect(pinnedFor({ ...DEFAULT_PINNED, deal_type: 'DAILY_RENT' }, 'AF').deal_type).toBe('DAILY_RENT');
    expect(pinnedFor({ ...DEFAULT_PINNED, deal_type: 'MORTGAGE_RENT' }, 'AF').deal_type).toBe('');
  });
});

describe('checking a draft for its market', () => {
  it('builds the request for an Iranian listing in tomans, with its market', () => {
    const check = checkDraft(row());
    expect(check.errors).toEqual({});
    expect(check.input).toMatchObject({ market: 'IR', currency: 'TOMAN', type: 'VILLA_GARDEN', price: 9_000_000_000, province: 'مازندران' });
  });

  it('accepts a toman price above the old limit of a thousand billion, and refuses a rial or dollar one', () => {
    expect(checkDraft(row({ currency: 'TOMAN', price: '25000000000000' })).input?.price).toBe(25_000_000_000_000);
    expect(checkDraft(row({ currency: 'TOMAN', price: '100000000000000' })).errors.price).toBeTruthy();
    expect(checkDraft(row({ currency: 'RIAL', price: '25000000' })).errors.currency).toBeTruthy();
    expect(checkDraft(row({ currency: 'USD', price: '25000' })).errors.currency).toBeTruthy();
  });

  it('refuses a toman price on an Afghan listing and a daily rental of a flat', () => {
    expect(checkDraft(row({ market: 'AF', province: 'کابل', type: 'APARTMENT' })).errors.currency).toBeTruthy();
    const daily = checkDraft(row({ deal_type: 'DAILY_RENT', type: 'APARTMENT' }));
    expect(daily.ok).toBe(false);
    expect(daily.errors.type).toBeTruthy();
    expect(checkDraft(row({ deal_type: 'DAILY_RENT', type: 'VILLA_GARDEN' })).ok).toBe(true);
  });

  it('asks a mortgage-and-rent for its deposit and its monthly rent, and sends both', () => {
    const base = { type: 'APARTMENT', deal_type: 'MORTGAGE_RENT', price: '200000000', area_sqm: '85' } as const;
    const missing = checkDraft(row(base));
    expect(missing.ok).toBe(false);
    expect(missing.errors.monthly_rent).toBeTruthy();
    expect(checkDraft(row({ ...base, monthly_rent: 'abc' })).errors.monthly_rent).toBeTruthy();
    const ok = checkDraft(row({ ...base, monthly_rent: '8,000,000' }));
    expect(ok.errors).toEqual({});
    expect(ok.input).toMatchObject({ deal_type: 'MORTGAGE_RENT', price: 200_000_000, monthly_rent: 8_000_000 });
    // A rent typed before the deal was changed is not sent with a sale.
    const sale = checkDraft(row({ ...base, deal_type: 'SALE', monthly_rent: '8000000' }));
    expect(sale.ok).toBe(true);
    expect(sale.input && 'monthly_rent' in sale.input).toBe(false);
  });

  it('sends the tags of an Iranian listing and the deed of an Afghan one, and refuses them in the other country', () => {
    expect(checkDraft(row({ type: 'APARTMENT', features: ['ELEVATOR', 'DUPLEX'] })).input).toMatchObject({ features: ['ELEVATOR', 'DUPLEX'] });
    expect(checkDraft(row({ type: 'APARTMENT', features: ['ELEVATOR'], market: 'AF', currency: 'USD', province: 'کابل' })).errors.features).toBeTruthy();
    const afghan = { market: 'AF', currency: 'AFGHANI', province: 'کابل', type: 'WAREHOUSE' } as const;
    expect(checkDraft(row({ ...afghan, deed_type: 'SHARI' })).input).toMatchObject({ type: 'WAREHOUSE', deed_type: 'SHARI' });
    expect(checkDraft(row({ type: 'APARTMENT', deed_type: 'SHARI' })).errors.deed_type).toBeTruthy();
  });

  it("keeps a pin inside the listing's own country", () => {
    expect(checkDraft(row({ lat: '36.57', lng: '53.06' })).input).toMatchObject({ lat: 36.57, lng: 53.06 });
    const kabul = checkDraft(row({ lat: '34.53', lng: '69.17' }));
    expect(kabul.ok).toBe(false);
    expect(kabul.errors.location).toBeTruthy();
    // The same point is fine on an Afghan listing.
    expect(checkDraft(row({ market: 'AF', currency: 'USD', province: 'کابل', type: 'APARTMENT', lat: '34.53', lng: '69.17' })).ok).toBe(true);
  });

  it("takes the account's market when the draft has none (older drafts)", () => {
    const old = { ...row({ currency: 'AFGHANI', province: 'کابل', type: 'APARTMENT' }), market: undefined };
    setActiveMarket('AF');
    expect(checkDraft(old).input?.market).toBe('AF');
    expect(activeMarket()).toBe('AF');
    const iranOld = { ...row(), market: undefined };
    setActiveMarket('IR');
    expect(checkDraft(iranOld).input?.market).toBe('IR');
  });
});

describe('reading Iranian posts', () => {
  const IR = { market: 'IR' as const, province: '', district: '', deal_type: '' as const, currency: '' as const };

  it('reads a daily villa rental in tomans', () => {
    const [r] = parseText('اجاره روزانه ویلا در نوشهر مازندران\nشبی ۳ میلیون تومان\nمساحت ۴۰۰ متر', { defaults: IR });
    // «ویلا» in Iran is «باغ و ویلا».
    expect(r).toMatchObject({ market: 'IR', type: 'VILLA_GARDEN', deal_type: 'DAILY_RENT', currency: 'TOMAN', price: '3000000', province: 'مازندران' });
  });

  it('reads a full mortgage on a duplex as an apartment with the duplex tag, with a deposit price in billions', () => {
    const [r] = parseText('رهن کامل دوبلکس ۱۸۰ متری در تهران\nمبلغ رهن: ۲ میلیارد تومان', { defaults: IR });
    expect(r).toMatchObject({ type: 'APARTMENT', features: ['DUPLEX'], deal_type: 'MORTGAGE_GROWI', currency: 'TOMAN', price: '2000000000', province: 'تهران' });
    expect(r!.notes.length).toBeGreaterThan(0);
  });

  it('reads a mortgage-and-rent: the deposit is the price, the rent every month its own amount', () => {
    const [r] = parseText('رهن و اجاره آپارتمان ۸۵ متری در شیراز\nرهن: ۲۰۰ میلیون تومان\nاجاره ماهانه: ۸ میلیون تومان\nآسانسور، پارکینگ و انباری دارد', { defaults: IR });
    expect(r).toMatchObject({ type: 'APARTMENT', deal_type: 'MORTGAGE_RENT', price: '200000000', monthly_rent: '8000000', currency: 'TOMAN', province: 'فارس', features: ['ELEVATOR', 'PARKING', 'STORAGE'] });
    // The same, said on one line.
    const [one] = parseText('اجاره آپارتمان در تهران ودیعه ۳۰۰ میلیون ماهی ۱۲ میلیون', { defaults: IR });
    expect(one).toMatchObject({ deal_type: 'MORTGAGE_RENT', price: '300000000', monthly_rent: '12000000' });
  });

  it('reads the tags an ad names, and not the ones it says are missing', () => {
    const [r] = parseText('فروش آپارتمان پنت‌هاوس ۱۲۰ متری تهران ۵ میلیارد تومان سند تک‌برگ مستر روم بدون آسانسور', { defaults: IR });
    expect(r!.features).toEqual(['PENTHOUSE', 'SINGLE_DEED', 'MASTER_ROOM']);
  });

  it('reads old building, villa-garden and warehouse words', () => {
    expect(parseText('فروش زمین کلنگی ۲۰۰ متری تهران ۱۰ میلیارد تومان', { defaults: IR })[0]).toMatchObject({ type: 'LAND_OLD' });
    expect(parseText('فروش باغ و ویلا ۱۰۰۰ متری در کرج ۱۰ میلیارد تومان', { defaults: IR })[0]).toMatchObject({ type: 'VILLA_GARDEN' });
    expect(parseText('فروش گدام ۵۰۰ متر در کابل قیمت ۹۰ هزار دالر', { defaults: { ...IR, market: 'AF' } })[0]).toMatchObject({ type: 'WAREHOUSE', market: 'AF' });
  });

  it('reads the Afghan deed', () => {
    expect(parseText('فروش حویلی ۳۰۰ متری در کابل قباله شرعی قیمت ۹۰ هزار دالر', { defaults: { ...IR, market: 'AF' } })[0]).toMatchObject({ deed_type: 'SHARI' });
    expect(parseText('فروش زمین ۴۰۰ متر کابل سند عرفی ۵۰ هزار دالر', { defaults: { ...IR, market: 'AF' } })[0]).toMatchObject({ deed_type: 'ORFI' });
  });

  it('does not give Afghanistan the tags, nor Iran the deed', () => {
    const [af] = parseText('فروش آپارتمان ۹۰ متر کابل آسانسور دارد ۵۰ هزار دالر', { defaults: { ...IR, market: 'AF' } });
    expect(af!.features).toEqual([]);
    const [ir] = parseText('فروش آپارتمان ۹۰ متر تهران قباله شرعی ۵ میلیارد تومان', { defaults: IR });
    expect(ir!.deed_type).toBe('');
  });

  it('reads a commercial unit priced in rials as tomans (a tenth), with a note saying so', () => {
    const [r] = parseText('فروش واحد تجاری ۹۰ متر در اصفهان\nقیمت: ۳۵,۰۰۰,۰۰۰,۰۰۰ ریال', { defaults: IR });
    expect(r).toMatchObject({ type: 'COMMERCIAL', deal_type: 'SALE', currency: 'TOMAN', price: '3500000000', province: 'اصفهان' });
    expect(r!.notes).toContain(prs['import.note.rialToToman']);
  });

  it('reads a shop, an office and a warehouse in Iran as the one «تجاری و اداری» type, a villa as a garden villa, and a house as a house', () => {
    expect(parseText('فروش مغازه ۴۰ متری در تهران ۹ میلیارد تومان', { defaults: IR })[0]).toMatchObject({ type: 'COMMERCIAL' });
    expect(parseText('فروش دفتر کار ۶۰ متری در تهران ۹ میلیارد تومان', { defaults: IR })[0]).toMatchObject({ type: 'COMMERCIAL' });
    expect(parseText('فروش گودام ۳۰۰ متری در کرج ۹ میلیارد تومان', { defaults: IR })[0]).toMatchObject({ type: 'COMMERCIAL' });
    expect(parseText('فروش ویلا ۴۰۰ متری در نوشهر ۹ میلیارد تومان', { defaults: IR })[0]).toMatchObject({ type: 'VILLA_GARDEN' });
    expect(parseText('فروش خانه ویلایی ۲۰۰ متری در شیراز ۹ میلیارد تومان', { defaults: IR })[0]).toMatchObject({ type: 'HOUSE_HAWILI' });
  });

  it('reads «اجاره» alone in Iran as a mortgage-and-rent whose deposit is still to be written, and starts an unpriced currency in the market’s own', () => {
    const [rent] = parseText('اجاره آپارتمان ۷۵ متری در شیراز ماهی ۱۵ میلیون', { defaults: IR });
    expect(rent).toMatchObject({ deal_type: 'MORTGAGE_RENT', type: 'APARTMENT', monthly_rent: '15000000', price: '', currency: 'TOMAN', province: 'فارس' });
    expect(rent!.notes.length).toBeGreaterThanOrEqual(2);
    // In Afghanistan «کرایه» stays a plain rent.
    expect(parseText('کرایه آپارتمان ۷۵ متری در هرات ماهی ۱۵ هزار افغانی', { defaults: { ...IR, market: 'AF' } })[0]).toMatchObject({ deal_type: 'RENT', price: '15000' });
  });

  it('stamps the market on every row of a paste, and Afghan text still reads as before', () => {
    const [af] = parseText('فروش خانه ۲۰۰ متری در کابل قیمت ۸۵ هزار دالر', { defaults: { ...IR, market: 'AF' } });
    expect(af).toMatchObject({ market: 'AF', currency: 'USD', price: '85000', province: 'کابل' });
  });
});

const IRAN_PIN = { province: '', district: '', deal_type: '' as const, currency: '' as const };

describe('reading a spreadsheet', () => {
  it('knows the Iranian words in cells', () => {
    expect(normalizeCurrency('تومان')).toBe('TOMAN');
    expect(normalizeCurrency('ریال')).toBe('RIAL');
    expect(normalizeCurrency('IRR')).toBe('RIAL');
    expect(normalizeDeal('اجاره روزانه')).toBe('DAILY_RENT');
    expect(normalizeDeal('daily rent')).toBe('DAILY_RENT');
    expect(normalizeDeal('رهن کامل')).toBe('MORTGAGE_GROWI');
    expect(normalizeDeal('رهن و اجاره')).toBe('MORTGAGE_RENT');
    expect(normalizeDeal('MORTGAGE_RENT')).toBe('MORTGAGE_RENT');
    expect(normalizeDeal('mortgage and rent')).toBe('MORTGAGE_RENT');
    expect(normalizeType('دوبلکس')).toBe('DUPLEX');
    expect(normalizeType('تجاری')).toBe('COMMERCIAL');
    expect(normalizeType('duplex')).toBe('DUPLEX');
    expect(normalizeType('باغ و ویلا')).toBe('VILLA_GARDEN');
    expect(normalizeType('زمین و کلنگی')).toBe('LAND_OLD');
    expect(normalizeType('گدام')).toBe('WAREHOUSE');
    expect(normalizeFeatures('آسانسور، پارکینگ / ELEVATOR')).toEqual(['ELEVATOR', 'PARKING']);
    expect(normalizeFeatures('single deed; master room')).toEqual(['SINGLE_DEED', 'MASTER_ROOM']);
    expect(normalizeDeed('قباله شرعی')).toBe('SHARI');
    expect(normalizeDeed('orfi')).toBe('ORFI');
    expect(normalizeDeed('عرفی')).toBe('ORFI');
  });

  it('maps the new columns and fits a row to its market', () => {
    expect(guessMapping(['اجاره ماهانه', 'ویژگی ها', 'نوع سند', 'قیمت'])).toEqual(['monthly_rent', 'features', 'deed_type', 'price']);
    const table = {
      headers: ['نوع ملک', 'نوع معامله', 'قیمت', 'اجاره ماهانه', 'ویژگی ها', 'ارز', 'متراژ', 'ولایت'],
      rows: [['دوبلکس', 'رهن و اجاره', '200000000', '8000000', 'آسانسور، پارکینگ', 'تومان', '90', 'تهران']],
    };
    const mapping = guessMapping(table.headers);
    const { rows } = rowsFromTable(table, mapping, { ...IRAN_PIN, market: 'IR' });
    expect(rows[0]).toMatchObject({ market: 'IR', type: 'APARTMENT', deal_type: 'MORTGAGE_RENT', price: '200000000', monthly_rent: '8000000', currency: 'TOMAN', features: ['DUPLEX', 'ELEVATOR', 'PARKING'] });
  });
});
