import { describe, expect, it } from 'vitest';
import {
  detectDeal,
  detectType,
  findArea,
  findBathrooms,
  findBedrooms,
  findDistrict,
  findNeighborhood,
  findPrice,
  findProvince,
  parseListing,
  parseText,
  splitListings,
  stripPhoneNumbers,
} from '@/lib/import/parse-text';
import { flatten } from '@/lib/import/text-utils';

const f = flatten;

describe('price', () => {
  it.each([
    ['قیمت: ۴۵ هزار دالر', 45_000, 'USD'],
    ['قیمت ۱۵ لک افغانی', 1_500_000, 'AFGHANI'],
    ['۲.۵ میلیون افغانی', 2_500_000, 'AFGHANI'],
    ['250,000 USD', 250_000, 'USD'],
    ['$25000', 25_000, 'USD'],
    ['۱۲۰۰۰۰۰ افغانی', 1_200_000, 'AFGHANI'],
    ['دو و نیم میلیون افغانی', 2_500_000, 'AFGHANI'],
    ['پنجاه هزار دالر', 50_000, 'USD'],
    ['۲ میلیون و نیم افغانی', 2_500_000, 'AFGHANI'],
    ['کرایه ماهانه ۱۰۰۰۰ افغانی', 10_000, 'AFGHANI'],
    ['گروی: ۵۰۰ هزار افغانی', 500_000, 'AFGHANI'],
  ])('%s', (text, value, currency) => {
    const p = findPrice(f(text));
    expect(p?.value).toBe(value);
    expect(p?.currency).toBe(currency);
  });

  it('leaves currency open when the text does not say', () => {
    expect(findPrice(f('قیمت ۵۰۰۰۰۰۰'))).toMatchObject({ value: 5_000_000, currency: null });
  });

  it('marks کرور as an assumption', () => {
    expect(findPrice(f('۲ کرور افغانی'))).toMatchObject({ value: 20_000_000, assumedKarur: true });
  });

  it('does not read area, rooms, street width or a phone number as the price', () => {
    expect(findPrice(f('خانه ۳ خوابه ۱۵۰ متر کوچه ۶ متری'))).toBeNull();
    expect(findPrice(f('تماس: 0791234567'))).toBeNull();
    expect(findPrice(f('ناحیه ۱۲ طبقه ۳ واحد ۴'))).toBeNull();
  });

  it('prefers the number tied to «قیمت» when several amounts appear', () => {
    const p = findPrice(f('مساحت ۳۰۰ متر، پیشبینی ۲۰۰ هزار دالر. قیمت: ۱۸۰ هزار دالر'));
    expect(p?.value).toBe(180_000);
    expect(p?.candidates).toBe(2);
  });
});

describe('type and deal', () => {
  it.each([
    ['فروش آپارتمان در کابل', 'APARTMENT'],
    ['یک باب خانه سه خوابه', 'HOUSE_HAWILI'],
    ['حویلی برای کرایه', 'HOUSE_HAWILI'],
    ['زمین مسکونی ۲۰۰ متری', 'LAND'],
    ['پلاٹ فروشی', 'LAND'],
    ['دکان تجارتی', 'SHOP'],
    ['مغازه در سرای شهزاده', 'SHOP'],
    ['ویلای دو طبقه', 'VILLA'],
    ['باغ میوه', 'GARDEN'],
    ['دفتر کار در چهارراهی', 'OFFICE'],
    ['گاراژ بزرگ', 'GARAGE'],
  ])('%s', (text, type) => expect(detectType(f(text))).toBe(type));

  it('does not mistake the agency name or a factory for a type', () => {
    expect(detectType(f('دفتر املاک نور'))).toBeNull();
    expect(detectType(f('کارخانه بزرگ'))).toBeNull();
  });

  it('takes the first line over a later mention', () => {
    expect(detectType(f('آپارتمان نو\nدارای حویلی کوچک'))).toBe('APARTMENT');
  });

  it.each([
    ['فروشی', 'SALE'],
    ['برای کرایه', 'RENT'],
    ['اجاره ای', 'RENT'],
    ['گروی', 'MORTGAGE_GROWI'],
    ['رهنی', 'MORTGAGE_GROWI'],
  ])('deal %s', (text, deal) => expect(detectDeal(f(text))).toBe(deal));
});

describe('area and rooms', () => {
  it('reads meters in the usual spellings', () => {
    expect(findArea(f('مساحت ۲۰۰ متر مربع')).value).toBe(200);
    expect(findArea(f('۱۵۰ متری')).value).toBe(150);
    expect(findArea(f('مساحت: ۳۰۰')).value).toBe(300);
    expect(findArea(f('120m2')).value).toBe(120);
  });
  it('ignores the width of a street', () => {
    expect(findArea(f('کوچه ۶ متری، مساحت ۲۰۰ متر')).value).toBe(200);
    expect(findArea(f('کوچه ۶ متری')).value).toBeNull();
  });
  it('prefers land area over built area', () => {
    expect(findArea(f('زیربنا ۱۲۰ متر، مساحت زمین ۳۰۰ متر')).value).toBe(300);
    expect(findArea(f('زیربنا ۱۲۰ متر، حویلی ۳۰۰ متر')).value).toBe(300);
  });
  it('multiplies dimensions', () => {
    expect(findArea(f('ابعاد ۱۰×۲۰'))).toMatchObject({ value: 200, fromDimensions: true });
  });
  it('flags jerib without guessing a size', () => {
    expect(findArea(f('۲ جریب زمین'))).toMatchObject({ value: null, jerib: true });
  });
  it('counts rooms', () => {
    expect(findBedrooms(f('۳ خوابه'))).toBe(3);
    expect(findBedrooms(f('خانه ۴ اتاقه'))).toBe(4);
    expect(findBedrooms(f('دو اتاق خواب'))).toBe(2);
    expect(findBedrooms(f('تعداد اتاق: ۵'))).toBe(5);
    expect(findBedrooms(f('۱۲۰ متر'))).toBeNull();
    expect(findBathrooms(f('۲ حمام و ۱ تشناب'))).toBe(2);
    expect(findBathrooms(f('حمام: ۱'))).toBe(1);
  });
});

describe('place', () => {
  it('finds provinces, capitals and spellings', () => {
    expect(findProvince(f('در شهر کابل'))).toBe('کابل');
    expect(findProvince(f('مزار شریف، کارته مامورین'))).toBe('بلخ');
    expect(findProvince(f('جلال آباد'))).toBe('ننگرهار');
    expect(findProvince(f('قندوز'))).toBe('کندز');
    expect(findProvince(f('کندهار'))).toBe('قندهار');
    expect(findProvince(f('بدون محل'))).toBeNull();
  });
  it('reads the district number', () => {
    expect(findDistrict(f('ناحیه ۴'))).toBe('ناحیه ۴');
    expect(findDistrict(f('ناحیه سوم'))).toBeNull();
    expect(findDistrict(f('ناحیه پنج'))).toBe('ناحیه ۵');
  });
  it('reads a neighbourhood and stops at filler words', () => {
    expect(findNeighborhood(f('کارته سه فروشی'))).toBe('کارته سه');
    expect(findNeighborhood(f('شهرک ملکی دارای ۳ خوابه'))).toBe('شهرک ملکی');
    expect(findNeighborhood(f('ده هزار دالر'))).toBeNull();
  });
});

describe('phones', () => {
  it('removes phone numbers and their label line', () => {
    const r = stripPhoneNumbers('خانه فروشی\nتماس: ۰۷۹۱۲۳۴۵۶۷\nواتساپ 0093 799 123 456');
    expect(r.removed).toBe(2);
    expect(r.text).toBe('خانه فروشی');
  });
  it('keeps numbers that only look like phones', () => {
    expect(stripPhoneNumbers('قیمت 750000000 افغانی').removed).toBe(0);
  });
});

describe('one listing', () => {
  const ad = `🏠 فروش خانه سه خوابه در کابل
📍 آدرس: ناحیه ۴، کارته سه، نزدیک مسجد
📐 مساحت: ۲۰۰ متر مربع
🛏 ۳ خوابه، ۲ حمام
💰 قیمت: ۸۵ هزار دالر (قابل معامله)
☎️ تماس: 0791234567
https://example.com/a.jpg`;

  it('reads everything it can from a typical Telegram post', () => {
    const r = parseListing(ad);
    expect(r).toMatchObject({
      type: 'HOUSE_HAWILI',
      deal_type: 'SALE',
      price: '85000',
      currency: 'USD',
      price_terms: 'NEGOTIABLE',
      area_sqm: '200',
      bedrooms: '3',
      bathrooms: '2',
      province: 'کابل',
      district: 'ناحیه ۴',
      images: ['https://example.com/a.jpg'],
    });
    expect(r.title).toBe('فروش خانه سه خوابه در کابل');
    expect(r.address).toBe('کابل، ناحیه ۴، کارته سه، نزدیک مسجد');
    expect(r.description).not.toContain('0791234567');
    expect(r.description).not.toContain('example.com');
    expect(r.notes.join(' ')).toContain('شماره تلفن');
  });

  it('can keep the phone when asked', () => {
    expect(parseListing(ad, { stripPhones: false }).description).toContain('0791234567');
  });

  it('uses the pinned defaults for what the text does not say, and says so', () => {
    const r = parseListing('آپارتمان ۲ خوابه ۹۰ متری ۳۵ هزار', {
      defaults: { province: 'هرات', district: 'ناحیه ۲', deal_type: 'RENT', currency: 'USD' },
    });
    expect(r).toMatchObject({ province: 'هرات', district: 'ناحیه ۲', deal_type: 'RENT', currency: 'USD', price: '35000' });
    expect(r.notes.join(' ')).toContain('پیش‌فرض');
    expect(r.address).toBe('هرات، ناحیه ۲');
  });

  it('composes a title when the first line is no title', () => {
    const r = parseListing('فروش\nخانه ۳ خوابه ۱۵۰ متر کابل قیمت ۵۰ هزار دالر');
    expect(r.title).toContain('خانه');
    expect(r.title.length).toBeGreaterThan(8);
  });

  it('leaves out rooms for land and says what is missing', () => {
    const r = parseListing('زمین فروشی ۴۰۰ متر در پروان');
    expect(r.bedrooms).toBe('');
    expect(r.notes.join(' ')).toContain('قیمت پیدا نشد');
  });

  it('keeps Persian digits out of stored numbers', () => {
    expect(parseListing('خانه ۱۵۰ متری ۴۰ هزار دالر کابل').area_sqm).toBe('150');
  });
});

describe('many listings', () => {
  it('splits on separator lines', () => {
    const t = 'خانه فروشی ۱۰۰ متر ۳۰ هزار دالر\n------\nآپارتمان کرایی ۵۰۰۰ افغانی';
    expect(splitListings(t)).toHaveLength(2);
  });

  it('splits on blank lines but keeps a listing’s continuation paragraphs together', () => {
    const t = [
      'فروش خانه در کابل ناحیه ۳',
      '',
      'مشخصات: ۳ خوابه، ۲ حمام، مساحت ۲۰۰ متر',
      '',
      'قیمت: ۴۰ هزار دالر',
      '',
      'تماس: 0791234567',
      '',
      'کرایه آپارتمان در هرات',
      '',
      'قیمت ۸۰۰۰ افغانی',
    ].join('\n');
    const blocks = splitListings(t);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('تماس');
    expect(blocks[1]).toContain('هرات');
  });

  it('splits one-line-per-listing pastes', () => {
    const t = 'خانه ۳ خوابه کابل ۵۰ هزار دالر\nآپارتمان ۲ خوابه هرات ۳۰ هزار دالر\nدکان قندهار ۲۰ هزار دالر';
    const rows = parseText(t);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.type)).toEqual(['HOUSE_HAWILI', 'APARTMENT', 'SHOP']);
    expect(rows.map((r) => r.province)).toEqual(['کابل', 'هرات', 'قندهار']);
  });

  it('returns nothing for an empty paste', () => {
    expect(parseText('  \n ')).toEqual([]);
  });
});

describe('flatten', () => {
  it('unifies digits and letters', () => {
    expect(flatten('۱۲٣ كيك')).toBe('123 کیک');
  });
});
