import { describe, expect, it } from 'vitest';
import { checkDraft } from '@/lib/import/draft-validation';
import { parseText, splitListings } from '@/lib/import/parse-text';

/** A Herat post as it is pasted: a tag line, the facts, a long note paragraph, three numbers, the office, a channel. */
const HERAT = `توجه توجه

یک باب خانه دو منزله در شهر هرات، ناحیه ۴ (گذر آمریه) برای فروش

مساحت: ۳ بسوه (۳۰۰ متر مربع)
اتاق: ۶ اتاق خواب، ۲ حمام، آشپزخانه، دالان
سند: قباله شرعی، اسناد کامل
قیمت: ۸۵ هزار دالر، قابل معامله

نوت: خانه نوساز است، آب و برق و گاز دارد، جای پارکینگ دارد. مشتری مستقیم محترم، دلال نیاید.

برای معلومات بیشتر تماس بگیرید:
0799123456
0700654321
0786111222

آدرس دفتر: هرات، چهارراهی ملی
@herat_property`;

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

describe('a pasted post keeps all of its text', () => {
  it('is one listing, not two: the note paragraph belongs to the property above it', () => {
    expect(splitListings(HERAT)).toHaveLength(1);
    expect(parseText(HERAT)).toHaveLength(1);
  });

  it('puts every line of the paste into the description: tag, notes, all three numbers, the office, the channel', () => {
    const [row] = parseText(HERAT);
    expect(lines(row!.description)).toEqual(lines(HERAT));
  });

  it('still fills the columns from it', () => {
    const [row] = parseText(HERAT);
    expect(row).toMatchObject({ type: 'HOUSE_HAWILI', deal_type: 'SALE', price: '85000', currency: 'USD', province: 'هرات', phone: '+93799123456' });
    expect(row!.title).toBe('یک باب خانه دو منزله در شهر هرات، ناحیه ۴ (گذر آمریه) برای فروش'); // not «توجه توجه»
    expect(checkDraft(row!).errors.description).toBeUndefined();
  });

  it('treats the whole paste as one listing when told so, however it is spaced', () => {
    const odd = `خانه برای فروش در کابل ۲۰۰ متر ۵۰ هزار دالر\n\n\nخانه برای فروش در هرات ۳۰۰ متر ۶۰ هزار دالر`;
    expect(parseText(odd)).toHaveLength(2);
    const [one] = parseText(odd, { single: true });
    expect(parseText(odd, { single: true })).toHaveLength(1);
    expect(one!.description).toContain('هرات');
    expect(one!.description).toContain('کابل');
  });

  it('keeps a greeting and a channel footer too (they join the listing instead of vanishing)', () => {
    const post = `سلام دوستان\n\nخانه ۲۰۰ متری برای فروش در کابل، ۵۰ هزار دالر\n\nکانال ما را دنبال کنید @my_channel_x`;
    const [row] = parseText(post);
    expect(parseText(post)).toHaveLength(1);
    expect(row!.description).toContain('سلام دوستان');
    expect(row!.description).toContain('@my_channel_x');
  });

  it('removes numbers and footers only on request, and then keeps the rest', () => {
    const [row] = parseText(HERAT, { stripPhones: true });
    expect(row!.description).not.toMatch(/0799|0700|0786/);
    expect(row!.description).not.toContain('@herat_property');
    expect(row!.description).toContain('نوت: خانه نوساز است');
    expect(row!.phone).toBe('+93799123456');
  });

  it('says so when the text is longer than a description can be', () => {
    const long = `خانه برای فروش در کابل ۵۰ هزار دالر\n${'توضیح '.repeat(1200)}`;
    const [row] = parseText(long);
    expect(row!.description.length).toBeLessThanOrEqual(5000);
    expect(row!.notes.length).toBeGreaterThan(0);
  });
});

describe('the advertisement number is not part of the description', () => {
  const body = 'خانه دو منزله در کارته سه کابل برای فروش\nمساحت: ۲۰۰ متر\nقیمت: ۵۰ هزار دالر، جور آمد';

  it.each([
    ['📌 کد آگهی: #2005'],
    ['🔥 کد: 245 VIP 🔥'],
    ['شماره آگهی ۱۲'],
    ['نمبر آگهی: A-12'],
    ['آی‌دی: 8841'],
    ['ID: 77'],
  ])('drops the header line «%s» and keeps the rest as pasted', (header) => {
    const [row] = parseText(`${header}\n${body}`);
    expect(lines(row!.description)).toEqual(lines(body));
    expect(row!.title).toBe('خانه دو منزله در کارته سه کابل برای فروش');
  });

  it('drops the code in front of a line that goes on with the property', () => {
    const [row] = parseText('📌 کد آگهی: #2005 | خانه دو منزله در کارته سه کابل برای فروش\nقیمت: ۵۰ هزار دالر');
    expect(row!.description.startsWith('خانه دو منزله')).toBe(true);
    expect(row!.description).not.toContain('2005');
  });

  it('is independent of the tidy switch: with it on, the code is gone too, and nothing else changes', () => {
    const [row] = parseText(`📌 کد آگهی: #2005\n${body}`, { stripPhones: true });
    expect(row!.description).not.toContain('کد آگهی');
    expect(lines(row!.description)).toEqual(lines(body));
  });

  it('leaves lines that only look like a code alone', () => {
    const text = 'کد پستی 1001\nکد: ویژه\nID: 3 rooms\nخانه برای فروش در کابل ۵۰ هزار دالر';
    const [row] = parseText(text);
    expect(lines(row!.description)).toEqual(lines(text));
  });
});

describe('the price terms are read from the text', () => {
  const terms = (text: string) => parseText(`خانه برای فروش در کابل ۲۰۰ متر\nقیمت: ۵۰ هزار دالر ${text}`)[0]!.price_terms;

  it.each([
    ['جور آمد', 'NEGOTIABLE'],
    ['جورآمد', 'NEGOTIABLE'],
    ['قابل معامله', 'NEGOTIABLE'],
    ['قابل مذاکره', 'NEGOTIABLE'],
    ['توافقی', 'NEGOTIABLE'],
    ['چانه دارد', 'NEGOTIABLE'],
    ['د معاملې وړ', 'NEGOTIABLE'],
    ['مقطوع', 'FIXED'],
    ['قیمت قطعی', 'FIXED'],
    ['قیمت ثابت', 'FIXED'],
    ['بدون چانه', 'FIXED'],
    ['قابل معامله نیست', 'FIXED'],
    ['قابل چانه نمی‌باشد', 'FIXED'],
    ['معامله ندارد', 'FIXED'],
    ['چانه ندارد', 'FIXED'],
    ['کم و کسر ندارد', 'FIXED'],
    ['بې چانې', 'FIXED'],
    ['', ''],
  ] as const)('«%s» → %s', (said, expected) => {
    expect(terms(said)).toBe(expected);
  });

  it('does not take a landline for a fixed price', () => {
    expect(parseText('خانه برای فروش در کابل ۵۰ هزار دالر\nتلفن ثابت: ۰۲۰۱۲۳۴۵۶۷')[0]!.price_terms).toBe('');
  });
});
