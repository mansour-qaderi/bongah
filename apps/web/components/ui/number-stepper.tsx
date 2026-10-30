'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toAsciiDigits } from '@/lib/format';
import { toPersianDigits } from '@/lib/persian-input';
import { Input } from './field';

/**
 * What a whole-number box makes of what was typed or pasted: Persian and Arabic digits become the digits they stand for,
 * anything else (letters, signs, spaces, a decimal point) is dropped, and the number is held between 0 and `max`.
 * Nothing typed is ever left as text: «یسب» is an empty box, not a value.
 */
export function wholeNumber(text: string, max: number): number | null {
  const digits = toAsciiDigits(text).replace(/[^0-9]/g, '');
  if (digits === '') return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? Math.min(n, max) : max;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> & {
  /** The number in the box; null is an empty box. */
  value: number | null;
  onValueChange: (value: number | null) => void;
  max: number;
  invalid?: boolean;
  /** What a screen reader calls the − and + buttons (they step by 1). */
  decreaseLabel: string;
  increaseLabel: string;
};

/**
 * A box that holds a whole number from 0 to `max` and nothing else, with a − and a + beside it. Typing, pasting and the
 * buttons all go through the same rule (`wholeNumber`), so the value can only ever be a number inside the range.
 */
export const NumberStepper = forwardRef<HTMLInputElement, Props>(function NumberStepper(
  { value, onValueChange, max, invalid, decreaseLabel, increaseLabel, className, disabled, ...rest },
  ref,
) {
  const step = (by: number) => onValueChange(Math.min(max, Math.max(0, (value ?? 0) + by)));
  const button =
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink-2 transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center gap-2" dir="rtl">
      <button type="button" className={button} aria-label={decreaseLabel} disabled={disabled || (value ?? 0) <= 0} onClick={() => step(-1)}>
        <Minus aria-hidden className="h-4 w-4" />
      </button>
      <Input
        {...rest}
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9۰-۹٠-٩]*"
        invalid={invalid}
        disabled={disabled}
        value={value === null ? '' : toPersianDigits(String(value))}
        placeholder={rest.placeholder ?? toPersianDigits('0')}
        onChange={(event) => onValueChange(wholeNumber(event.target.value, max))}
        // A letter never reaches the box: the browser is told to ignore it before it is typed.
        onBeforeInput={(event) => {
          const data = (event.nativeEvent as InputEvent).data;
          if (data && /[^0-9۰-۹٠-٩]/.test(data)) event.preventDefault();
        }}
        className={cn('tabular min-w-0 flex-1 text-center', className)}
      />
      <button type="button" className={button} aria-label={increaseLabel} disabled={disabled || (value ?? 0) >= max} onClick={() => step(1)}>
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
});
