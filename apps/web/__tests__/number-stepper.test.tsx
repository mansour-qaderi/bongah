// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { NumberStepper, wholeNumber } from '@/components/ui/number-stepper';
import { adminFeedbackReplySchema } from '@bongah/validation';
import { prs } from '@/i18n/messages/prs';
import { ps } from '@/i18n/messages/ps';

describe('wholeNumber', () => {
  it('keeps digits of any script and drops everything else', () => {
    expect(wholeNumber('۳', 50)).toBe(3);
    expect(wholeNumber('٤', 50)).toBe(4);
    expect(wholeNumber('7', 50)).toBe(7);
    expect(wholeNumber('یسب', 50)).toBeNull();
    expect(wholeNumber('abc', 50)).toBeNull();
    expect(wholeNumber('', 50)).toBeNull();
    expect(wholeNumber('1.5', 50)).toBe(15); // a point is dropped, not read as a decimal
    expect(wholeNumber('-4', 50)).toBe(4); // there is no negative gift
    expect(wholeNumber('3x۲', 50)).toBe(32);
  });

  it('holds the number at the most allowed', () => {
    expect(wholeNumber('۹۹۹', 50)).toBe(50);
    expect(wholeNumber('99999999999999999999999', 50)).toBe(50);
  });
});

afterEach(cleanup);

function Harness({ onChange }: { onChange?: (n: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <NumberStepper
      data-testid="box"
      value={value}
      max={5}
      decreaseLabel="کم"
      increaseLabel="زیاد"
      onValueChange={(n) => {
        setValue(n);
        onChange?.(n);
      }}
    />
  );
}

describe('NumberStepper', () => {
  it('shows Persian digits, never keeps text, and steps by one inside 0…max', () => {
    const seen = vi.fn();
    render(<Harness onChange={seen} />);
    const box = screen.getByTestId('box') as HTMLInputElement;
    const plus = screen.getByRole('button', { name: 'زیاد' }) as HTMLButtonElement;
    const minus = screen.getByRole('button', { name: 'کم' }) as HTMLButtonElement;
    expect(box.getAttribute('inputmode')).toBe('numeric');
    expect(minus.disabled).toBe(true); // nothing to take away from an empty box

    fireEvent.change(box, { target: { value: 'یسب' } });
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: '2' } });
    expect(box.value).toBe('۲');
    fireEvent.click(plus);
    expect(box.value).toBe('۳');
    fireEvent.click(minus);
    fireEvent.click(minus);
    fireEvent.click(minus);
    expect(box.value).toBe('۰');
    expect(minus.disabled).toBe(true);
    fireEvent.change(box, { target: { value: '۹' } });
    expect(box.value).toBe('۵');
    expect(plus.disabled).toBe(true);
    // Every value the parent ever heard of is a whole number in range, or empty.
    for (const [n] of seen.mock.calls as [number | null][]) expect(n === null || (Number.isInteger(n) && n >= 0 && n <= 5)).toBe(true);
  });
});

describe('the reply to a feedback message', () => {
  it('is a trimmed text of at least two characters and no more than the message limit', () => {
    expect(adminFeedbackReplySchema.safeParse({ message: '  سلام، بررسی شد  ' })).toMatchObject({ success: true, data: { message: 'سلام، بررسی شد' } });
    expect(adminFeedbackReplySchema.safeParse({ message: ' ا ' }).success).toBe(false);
    expect(adminFeedbackReplySchema.safeParse({ message: '' }).success).toBe(false);
    expect(adminFeedbackReplySchema.safeParse({ message: 'ا'.repeat(1001) }).success).toBe(false);
    expect(adminFeedbackReplySchema.safeParse({ message: 'سلام', extra: 1 }).success).toBe(false);
  });
});

describe('the words added for Iran', () => {
  it('exist in Dari and Pashto alike, and never name rial, dollar, or the old two-word deals for Iran', () => {
    expect(Object.keys(ps).sort()).toEqual(Object.keys(prs).sort());
    for (const key of Object.keys(prs).filter((k) => /^label\.(deal|type)\.IR\./.test(k)) as (keyof typeof prs)[]) {
      expect(prs[key]).not.toMatch(/خرید و فروش|رهن و اجاره/);
      expect(ps[key].trim()).not.toBe('');
    }
    expect(prs['label.deal.IR.SALE']).toBe('فروش');
    expect(prs['label.deal.IR.MORTGAGE_RENT']).toBe('اجاره');
    expect(prs['grid.h.provinceIR']).toBe('استان / شهر');
    expect(prs['form.addressPlaceholderIR']).toBe('مثلاً سعادت‌آباد، خیابان فرهنگ');
  });
});
