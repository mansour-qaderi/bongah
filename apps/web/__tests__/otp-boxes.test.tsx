// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OtpBoxes } from '@/components/ui/otp-boxes';

afterEach(() => cleanup());

let latest = '';
function Harness({ initial = '', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return (
    <OtpBoxes
      value={value}
      length={6}
      label="کد تأیید"
      onValueChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}
const box = (i: number) => screen.getByTestId(`otp-box-${i}`) as HTMLInputElement;
const values = () => Array.from({ length: 6 }, (_, i) => box(i).value);

describe('the verification code boxes', () => {
  it('draws six separate boxes, the first one ready for the code the phone suggests', () => {
    render(<Harness />);
    expect(Array.from({ length: 6 }, (_, i) => screen.getByTestId(`otp-box-${i}`))).toHaveLength(6);
    expect(box(0).getAttribute('autocomplete')).toBe('one-time-code');
    expect(document.activeElement).toBe(box(0));
  });

  it('puts each typed digit in its own box and moves on, writing Persian digits', () => {
    render(<Harness />);
    fireEvent.change(box(0), { target: { value: '1' } });
    expect(document.activeElement).toBe(box(1));
    fireEvent.change(box(1), { target: { value: '۲' } });
    fireEvent.change(box(2), { target: { value: '٣' } });
    expect(values()).toEqual(['۱', '۲', '۳', '', '', '']);
    expect(latest).toBe('۱۲۳');
  });

  it('ignores letters', () => {
    render(<Harness />);
    fireEvent.change(box(0), { target: { value: 'a' } });
    expect(values().every((v) => v === '')).toBe(true);
  });

  it('Backspace in an empty box clears the one before it and steps back', () => {
    render(<Harness initial="۱۲" />);
    box(2).focus();
    fireEvent.keyDown(box(2), { key: 'Backspace' });
    expect(latest).toBe('۱');
    expect(document.activeElement).toBe(box(1));
  });

  it('spreads a pasted code over all six boxes', () => {
    const done = vi.fn();
    render(<Harness onChange={done} />);
    fireEvent.paste(box(3), { clipboardData: { getData: () => '123456' } });
    expect(values()).toEqual(['۱', '۲', '۳', '۴', '۵', '۶']);
    expect(done).toHaveBeenLastCalledWith('۱۲۳۴۵۶');
  });

  it('spreads a whole code that a phone suggestion puts into the first box', () => {
    render(<Harness />);
    fireEvent.change(box(0), { target: { value: '654321' } });
    expect(latest).toBe('۶۵۴۳۲۱');
  });

  it('moves between boxes with the arrow keys', () => {
    render(<Harness initial="۱۲۳" />);
    box(2).focus();
    fireEvent.keyDown(box(2), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(box(3));
    fireEvent.keyDown(box(3), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(box(2));
  });
});
