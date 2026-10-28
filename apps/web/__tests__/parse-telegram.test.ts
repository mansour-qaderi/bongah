// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { checkDraft } from '@/lib/import/draft-validation';
import { findPrice, parseListing, parseText, splitListings } from '@/lib/import/parse-text';
import { flatten } from '@/lib/import/text-utils';
import { NO_PIN } from '@/lib/import/types';

const price = (text: string) => findPrice(flatten(text));

/** A post as a Telegram channel sends it: a tag line, the description, one paragraph per fact, a price block, contact, footer. */
const POST_A = `🔥 کد: 245 VIP 🔥

🏠 فروش خانه دوطبقه در کارته سه کابل
📐 مساحت: ۱۵۰ متر
🛏 تعداد اتاق: ۶
🚿 حمام: ۲

💰 قیمت فروش: ۱۷ لک افغانی

📞 تماس: ۰۷۹۹۱۲۳۴۵۶

🏢 املاک نمونه — خرید و فروش، کرایه و گروی
📣 کانال ما: @namuna_amlak`;

const POST_B = `فروشی یک باب آپارتمان در شهرنو
مساحت: ۸۵ متر، ۳ اتاق
قیمت: ۴۵۰۰۰ دالر`;

describe('prices as Dari agents write them', () => {
  it('reads lak, with and without the currency', () => {
    expect(price('۱۰ لک افغانی')).toMatchObject({ value: 1_000_000, currency: 'AFGHANI' });
    expect(price('قیمت: ۱۷ لک')).toMatchObject({ value: 1_700_000, currency: null });
    expect(price('قیمت فروش: ۱۷ لک')).toMatchObject({ value: 1_700_000 });
    expect(price('قیمت نهایی ماهانه = ۲۵ هزار افغانی')).toMatchObject({ value: 25_000, currency: 'AFGHANI' });
  });

  it('reads a price with a half and a price in two parts', () => {
    expect(price('قیمت ۲ لک و نیم')?.value).toBe(250_000);
    expect(price('قیمت ۱۲ لک و ۵۰ هزار افغانی')?.value).toBe(1_250_000);
    expect(price('قیمت ده لک افغانی')?.value).toBe(1_000_000);
  });

  it('accepts a plain big number, but not the price of a metre', () => {
    expect(price('1,700,000')?.value).toBe(1_700_000);
    expect(price('۱۷۰۰۰۰۰ افغانی')?.value).toBe(1_700_000);
    expect(price('قیمت هر متر ۲۰ هزار افغانی')).toBeNull();
    expect(price('۲۰ هزار افغانی فی متر')).toBeNull();
  });

  it('prefers the price of the property over the price of a metre', () => {
    expect(price('قیمت هر متر ۲۰ هزار افغانی\nقیمت کل: ۳۰ لک افغانی')?.value).toBe(3_000_000);
  });

  it('does not take a code, a street or a room count for a price', () => {
    expect(price('کد: 245')).toBeNull();
    expect(price('کوچه ۱۲ متری، ۴ اتاق')).toBeNull();
  });
});

describe('one post in pieces stays one listing', () => {
  it('keeps the tag line, the fact paragraphs, the price and the contact together, and keeps the footer in the description', () => {
    expect(splitListings(POST_A)).toHaveLength(1);
    const [row] = parseText(POST_A);
    expect(row).toMatchObject({
      type: 'HOUSE_HAWILI',
      deal_type: 'SALE',
      price: '1700000',
      currency: 'AFGHANI',
      area_sqm: '150',
      bedrooms: '6',
      bathrooms: '2',
      province: 'کابل',
    });
    // Everything pasted stays in the description: the number and the channel line too.
    expect(row!.description).toContain('۰۷۹۹۱۲۳۴۵۶');
    expect(row!.description).toContain('@namuna_amlak');
    expect(row!.description).not.toContain('کد: 245'); // the post's own number is not part of the description
    expect(row!.description).toContain('فروش خانه دوطبقه');
    expect(row!.title).toContain('خانه دوطبقه');
    expect(checkDraft(row!).ok).toBe(true);
  });

  it('drops the number and the channel footer only when the tidy switch is on', () => {
    const [row] = parseText(POST_A, { stripPhones: true });
    expect(row!.description).not.toContain('۰۷۹۹۱۲۳۴۵۶');
    expect(row!.description).not.toContain('@namuna_amlak');
    expect(row!.description).not.toContain('کد: 245'); // the post's own number is not part of the description
    expect(row!.description).toContain('فروش خانه دوطبقه');
  });

  it('reads the type from «خانه دوطبقه» and keeps the floors out of the price', () => {
    const r = parseListing('خانه دوطبقه برای فروش در کابل، ۲۰۰ متر، قیمت ۱۰ لک افغانی');
    expect(r).toMatchObject({ type: 'HOUSE_HAWILI', deal_type: 'SALE', price: '1000000', area_sqm: '200' });
  });

  it('treats a «قیمت فروش» or «نوعیت» paragraph as part of the listing, not as a new one', () => {
    const text = `فروش حویلی در کارته نو

مساحت ۳۰۰ متر

نوعیت ملک: خانه

قیمت فروش: ۲۵ لک`;
    expect(splitListings(text)).toHaveLength(1);
    expect(parseText(text)[0]).toMatchObject({ price: '2500000', area_sqm: '300' });
  });

  it('keeps a banner line with the listing under it', () => {
    const text = `${POST_B}\n\n🔥🔥 فرصت طلایی 🔥🔥\nخانه ۲۰۰ متری در پروان، قیمت ۸ لک افغانی`;
    expect(splitListings(text)).toHaveLength(2);
  });

  it('splits two complete posts and keeps the tag line with the right one', () => {
    const text = `${POST_A}\n\n${POST_B}`;
    const rows = parseText(text);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ type: 'APARTMENT', deal_type: 'SALE', price: '45000', currency: 'USD', area_sqm: '85', bedrooms: '3' });
  });

  it('puts the tag line of the second post with the second post', () => {
    const text = `${POST_A}\n\nکد: 246\n\n${POST_B}`;
    const blocks = splitListings(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toContain('کد: 246');
    expect(blocks[0]).not.toContain('کد: 246');
  });

  it('works the same when the posts are cut by separator lines with a decorative one inside', () => {
    const text = `فروش خانه در کابل
━━━━━━━━
مساحت: ۱۰۰ متر
قیمت: ۱۰ لک
➖➖➖➖➖➖
کرایه آپارتمان در هرات
قیمت: ۱۵ هزار افغانی
مساحت ۹۰ متر`;
    expect(splitListings(text)).toHaveLength(2);
  });

  it('drops a greeting and a pure advertisement', () => {
    const text = `سلام دوستان عزیز

${POST_B}

📣 به کانال ما بپیوندید @namuna_amlak
املاک نمونه، خرید و فروش`;
    expect(splitListings(text)).toHaveLength(1);
  });

  it('still splits one listing per line', () => {
    const text = 'خانه ۲۰۰ متری در کابل فروشی ۱۰ لک افغانی\nآپارتمان ۹۰ متری در هرات کرایه ۱۵ هزار افغانی';
    expect(splitListings(text)).toHaveLength(2);
  });
});

describe('what the person sees', () => {
  it('does not put «not found» notes on a row; the grid lists what is missing', () => {
    const r = parseListing('خانه برای فروش در کابل', { defaults: NO_PIN });
    expect(r.notes.join(' ')).not.toContain('پیدا نشد');
    expect(checkDraft(r).ok).toBe(false);
  });

  it('titles a listing with its description line, not with a label line', () => {
    const r = parseListing('قیمت: ۱۰ لک\nفروش خانه سه خوابه در کارته چهار کابل');
    expect(r.title).toContain('خانه سه خوابه');
  });

  it('reads the Dari spelling «گیروی» as a mortgage and «کمره» as rooms', () => {
    const r = parseListing('گیروی خانه سه کمره در کابل، قیمت ۵ لک افغانی');
    expect(r).toMatchObject({ deal_type: 'MORTGAGE_GROWI', bedrooms: '3', price: '500000' });
  });
});
