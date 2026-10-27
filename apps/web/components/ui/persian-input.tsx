'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { applyMask, maskPersianDigits, maskPersianPhone, toPersianDigits } from '@/lib/persian-input';
import { cn } from '@/lib/cn';
import { Input } from './field';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'maxLength'> & {
  /** `phone`: Persian digits with an optional leading "+". `digits`: Persian digits only, at most `maxLength` of them. */
  kind: 'phone' | 'digits';
  value: string;
  onValueChange: (value: string) => void;
  /** For `digits`: how many digits at most. */
  maxLength?: number;
  invalid?: boolean;
};

/**
 * A number field that only ever holds Persian digits. The mask runs on every change (typing, pasting, autofill), so
 * a number typed on an English keyboard turns into ۰-۹ in front of the person's eyes and letters never appear. The
 * digits are drawn in the page's Persian font (Vazirmatn has the ۰-۹ glyphs; `lang="fa"` keeps a fallback font from
 * drawing them in a Latin style). The value is still just a string: turn it into 0-9 with `toAsciiDigits` before it
 * goes to the API.
 *
 * Digits always run left to right, even in a right-to-left page, so the field is `dir="ltr"`; it is aligned to the
 * right edge (`text-end`) like the rest of the form.
 */
export const PersianDigitInput = forwardRef<HTMLInputElement, Props>(function PersianDigitInput(
  { kind, value, onValueChange, maxLength = 6, className, placeholder, ...rest },
  ref,
) {
  const mask = kind === 'phone' ? maskPersianPhone : (raw: string) => maskPersianDigits(raw, maxLength);
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode={kind === 'phone' ? 'tel' : 'numeric'}
      dir="ltr"
      lang="fa"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      value={toPersianDigits(value)}
      onChange={(event) => applyMask(event, mask, onValueChange)}
      className={cn('fa-digits text-end', className)}
      placeholder={placeholder ? toPersianDigits(placeholder) : undefined}
      {...rest}
    />
  );
});
