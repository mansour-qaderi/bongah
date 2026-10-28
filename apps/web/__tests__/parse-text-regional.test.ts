import { describe, expect, it } from 'vitest';
import { checkDraft } from '@/lib/import/draft-validation';
import { detectDeal, findFloors, findPhones, findPrice, findStreet, parseListing, parseText, stripPhoneNumbers } from '@/lib/import/parse-text';
import { flatten } from '@/lib/import/text-utils';

const f = flatten;

// The same listing as Telegram and WhatsApp agents write it: pieces on lines, on one line, with emoji, with a Persian-digit phone.
const POSTS = {
  lines: 'گیروی\nخانه نوساز دوطبقه\n۱۰ لک افغانی\nهرات سرک آسیا کلوخی، بهارستان ۱۲\nتماس: +93798286200',
  oneLine: 'خانه نوساز دوطبقه گیروی ۱۰ لک افغانی در هرات، سرک آسیا کلوخی، بهارستان ۱۲ شماره تماس 0798286200',
  emoji: '🏠 گیروی خانه نوساز دو طبقه\n💰 قیمت: ۱۰ لک افغانی\n📍 هرات، سرک آسیا کلوخی، بهارستان ۱۲\n📞 +93 798 286 200',
  persianPhone: 'گیروی خانه نوساز دوطبقه در هرات\n۱۰ لک افغانی\nسرک آسیا کلوخی، بهارستان ۱۲\n۰۷۹۸۲۸۶۲۰۰',
};

describe('a Herat mortgage listing as agents post it', () => {
  it.each(Object.entries(POSTS))('%s', (_name, post) => {
    const [row] = parseText(post);
    expect(row).toMatchObject({
      type: 'HOUSE_HAWILI',
      deal_type: 'MORTGAGE_GROWI',
      price: '1000000',
      currency: 'AFGHANI',
      floors: '2',
      province: 'هرات',
      address: 'هرات، سرک آسیا کلوخی، بهارستان ۱۲',
      phone: '+93798286200',
    });
  });

  it.each(Object.entries(POSTS))('%s: with the tidy switch on, no number is left in the text, and nothing is flagged', (_name, post) => {
    const [row] = parseText(post, { stripPhones: true });
    expect(row!.description).not.toMatch(/798|\+93|۰۷۹۸/);
    expect(row!.notes).toEqual([]);
  });

  it.each(Object.entries(POSTS))('%s: by default the description is the whole post, number included', (_name, post) => {
    const [row] = parseText(post);
    expect(row!.description).toMatch(/798|۰۷۹۸/);
    expect(row!.phone).toBe('+93798286200');
  });

  it('is complete but for the area, which the post did not give (and is the only thing the API would refuse)', () => {
    const [row] = parseText(POSTS.lines);
    expect(Object.keys(checkDraft(row!).errors)).toEqual(['area_sqm']);
    expect(checkDraft({ ...row!, area_sqm: '200' }).ok).toBe(true);
  });

  it('puts the storeys in the title it makes', () => {
    expect(parseText(POSTS.lines)[0]!.title).toBe('خانه ۲ طبقه گروی در هرات');
  });
});

describe('deal: mortgage (گیروی / گروی)', () => {
  it.each(['گیروی', 'گروی', 'گیرویی', 'گرویی', 'خانه گیروی است', 'ګروی', 'رهنی'])('%s', (text) => {
    expect(detectDeal(f(text))).toBe('MORTGAGE_GROWI');
  });

  it('is not mistaken for the other deals', () => {
    expect(detectDeal(f('کرایی'))).toBe('RENT');
    expect(detectDeal(f('برای فروش'))).toBe('SALE');
  });
});

describe('amounts in Afghan words', () => {
  it.each([
    ['۱۰ لک افغانی', 1_000_000],
    ['قیمت: ۱۰ لک افغانی', 1_000_000],
    ['۵۰ لک افغانی', 5_000_000],
    ['صد لک افغانی', 10_000_000],
    ['۱۰۰ لک افغانی', 10_000_000],
    ['۱ کرور افغانی', 10_000_000],
    ['یک و نیم لک افغانی', 150_000],
    ['۲۵۰۰۰۰ افغانی', 250_000],
    ['۵۰۰ هزار افغانی', 500_000],
    ['۲ میلیون و ۵۰۰ هزار افغانی', 2_500_000],
  ])('%s', (text, value) => {
    const p = findPrice(f(text));
    expect(p?.value).toBe(value);
    expect(p?.currency).toBe('AFGHANI');
  });

  it('keeps «لک» an Afghani amount whatever currency is pinned', () => {
    const row = parseListing('گیروی خانه ۱۰ لک در هرات', { defaults: { province: '', district: '', deal_type: '', currency: 'USD' } });
    expect(row.price).toBe('1000000');
    expect(row.currency).toBe('AFGHANI');
    expect(row.notes.join(' ')).not.toContain('ارز');
  });

  it('still takes the pinned currency for an amount that is not in an Afghani unit', () => {
    const row = parseListing('فروش خانه قیمت: ۵۰ هزار', { defaults: { province: '', district: '', deal_type: '', currency: 'USD' } });
    expect(row.currency).toBe('USD');
  });

  it('does not read the storeys, the lane or the plot number as a price', () => {
    const p = findPrice(f('خانه دوطبقه، کوچه ۶ متری، پلاک ۱۲ بهارستان ۱۲\n۱۰ لک افغانی'));
    expect(p?.value).toBe(1_000_000);
  });
});

describe('storeys', () => {
  it.each([
    ['خانه نوساز دوطبقه', 2],
    ['خانه دو طبقه', 2],
    ['خانه ۲ طبقه', 2],
    ['خانه ۳ طبقه ای', 3],
    ['ویلای سه‌طبقه', 3],
    ['خانه تک طبقه', 1],
    ['خانه یک طبقه', 1],
    ['خانه دو منزله', 2],
    ['کور دوه پوړیز', 2],
    ['حویلی ۲ پوړه', 2],
  ])('%s', (text, floors) => {
    expect(findFloors(f(text), 'HOUSE_HAWILI')).toBe(floors);
  });

  it.each([
    ['خانه یک منزل مسکونی'], // «منزل» alone is the word for a house
    ['آپارتمان در طبقه سوم'], // the place in a building, not its height
    ['خانه طبقه اول و دوم'],
    ['خانه سه خوابه'],
    ['خانه ۵۰ طبقه'],
  ])('is not in «%s»', (text) => {
    expect(findFloors(f(text), 'HOUSE_HAWILI')).toBeNull();
  });

  it('is not given to an apartment or a plot', () => {
    expect(findFloors(f('آپارتمان ۵ طبقه'), 'APARTMENT')).toBeNull();
    expect(findFloors(f('زمین دو طبقه'), 'LAND')).toBeNull();
  });
});

describe('street and address', () => {
  it.each([
    ['هرات سرک آسیا کلوخی، بهارستان ۱۲', 'سرک آسیا کلوخی، بهارستان ۱۲'],
    ['در هرات، سرک آسیا کلوخی، بهارستان ۱۲ شماره تماس 0798286200', 'سرک آسیا کلوخی، بهارستان ۱۲'],
    ['سرک آسیا کلوخی، بهارستان ۱۲، خانه دو طبقه، قیمت ۱۰ لک', 'سرک آسیا کلوخی، بهارستان ۱۲'],
    ['خانه در خیابان مدرس کوچه دوم قیمت ۵۰ هزار دالر', 'خیابان مدرس کوچه دوم'],
    ['کوچه ۶ متری، سرک اصلی', 'سرک اصلی'],
  ])('%s', (text, street) => {
    expect(findStreet(f(text))).toBe(street);
  });

  it('is not a lane that is only described by its width', () => {
    expect(findStreet(f('خانه ۲۰۰ متری، کوچه ۶ متری'))).toBeNull();
  });

  it('leaves a written «آدرس:» line alone', () => {
    const row = parseListing('گیروی خانه ۱۰ لک افغانی\nآدرس: هرات، جاده کابل، چهارراهی ملک');
    expect(row.address).toBe('هرات، جاده کابل، چهارراهی ملک');
  });

  it('falls back to what it knows when the text gives no street', () => {
    const row = parseListing('گیروی خانه ۱۰ لک افغانی در هرات');
    expect(row.address).toBe('هرات');
  });
});

describe('phone numbers', () => {
  it.each([
    '+93798286200',
    '0798286200',
    '۰۷۹۸۲۸۶۲۰۰',
    '+93 798 286 200',
    '+93-798-286-200',
    '0093798286200',
    '93798286200',
    '(+93) 798 286 200',
    '0798 286 200',
    'تماس: 798286200',
    'واتساپ ۷۹۸۲۸۶۲۰۰',
  ])('%s', (text) => {
    expect(findPhones(text)).toEqual(['+93798286200']);
  });

  it('finds every number, once each, in the order written', () => {
    expect(findPhones('تماس: 0798286200 - 0700123456 / +93798286200')).toEqual(['+93798286200', '+93700123456']);
  });

  it('does not take other numbers for phones', () => {
    expect(findPhones('۱۰ لک افغانی، ۲۰۰ متر، بهارستان ۱۲، قیمت ۷۹۸۲۸۶۲۰۰')).toEqual([]);
    expect(findPhones('0198286200')).toEqual([]);
  });

  it('takes the label out with the number, and a line left with nothing', () => {
    const { text, removed } = stripPhoneNumbers('خانه گیروی\nشماره تماس 0798286200\n\n📞 +93 798 286 200\nبهارستان ۱۲ واتساپ: 0700123456 فوری');
    expect(removed).toBe(3);
    expect(text).toBe('خانه گیروی\n\nبهارستان ۱۲ فوری');
  });

  it('does not touch a text without a number', () => {
    const text = 'خانه گیروی\n\nبهارستان';
    expect(stripPhoneNumbers(text)).toEqual({ text, removed: 0 });
  });

  it('is found even when the numbers are left in the description', () => {
    const row = parseListing(POSTS.oneLine, { stripPhones: false });
    expect(row.phone).toBe('+93798286200');
    expect(row.description).toContain('0798286200');
  });
});

describe('what is still said', () => {
  it('says when the deal had to be assumed', () => {
    const row = parseListing('خانه دو طبقه ۱۰ لک افغانی هرات');
    expect(row.deal_type).toBe('SALE');
    expect(row.notes.length).toBeGreaterThan(0);
  });

  it('says when the price has no currency at all', () => {
    const row = parseListing('گیروی خانه قیمت: 500000 در هرات');
    expect(row.notes.join(' ')).toContain('ارز');
  });
});
