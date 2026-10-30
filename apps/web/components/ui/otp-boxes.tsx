'use client';

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/persian-input';

type Props = {
  /** The digits entered so far, in Persian digits (۰-۹); turn them into 0-9 with `toAsciiDigits` before sending. */
  value: string;
  onValueChange: (value: string) => void;
  /** How many boxes there are (the length of the code). */
  length: number;
  /** What a screen reader calls the group ("کد تأیید"). */
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Focus the first box as soon as the boxes appear. On by default: the code is the only thing to do there. */
  autoFocus?: boolean;
  /** The id of the first box, so a <label htmlFor> can point at it. */
  id?: string;
  'aria-describedby'?: string;
  className?: string;
};

/** Only Persian digits are kept from whatever arrives (Latin and Arabic-Indic digits become Persian, the rest goes). */
const onlyDigits = (raw: string): string => toPersianDigits(raw).replace(/[^۰-۹]/g, '');

/**
 * A verification code drawn as one box per digit.
 *
 * Typing a digit fills the box and moves on to the next one; Backspace clears the box and steps back; the arrow keys
 * move between boxes; and a whole code pasted (or filled in by the phone's SMS / WhatsApp suggestion, which hands every
 * digit to one box) is spread over the boxes from the one it landed in. The value is a plain string of digits without
 * gaps, so "the box being typed in" is simply `value.length`.
 *
 * The row is always left to right (the digits of a code are not mirrored in a right-to-left page), and the digits are
 * drawn in Persian.
 */
export function OtpBoxes({
  value,
  onValueChange,
  length,
  label,
  invalid = false,
  disabled = false,
  autoFocus = true,
  id,
  'aria-describedby': describedBy,
  className,
}: Props) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const focusBox = (index: number) => {
    const box = boxes.current[Math.max(0, Math.min(length - 1, index))];
    box?.focus();
    box?.select();
  };

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  /** Put `digits` into the code from box `at` on, and move to the box after the last one filled. */
  const write = (at: number, digits: string) => {
    const start = Math.min(at, value.length);
    const next = (value.slice(0, start) + digits + value.slice(start + digits.length)).slice(0, length);
    onValueChange(next);
    focusBox(Math.min(start + digits.length, length - 1));
  };

  const onChange = (index: number, raw: string) => {
    const digits = onlyDigits(raw);
    if (digits === '') {
      // The box was emptied (a selection deleted, a letter typed over it): its digit goes, the ones after it close up.
      if (index < value.length) onValueChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    // A digit typed into a filled box (which did not get selected) leaves two: keep the new one. A longer run (the
    // phone's code suggestion) is spread over this box and the next ones.
    const kept = index < value.length && digits.length === 2 ? digits.replace(value[index] ?? '', '') || digits : digits;
    write(index, kept);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !event.currentTarget.value && index > 0) {
      event.preventDefault();
      onValueChange(value.slice(0, index - 1) + value.slice(index));
      focusBox(index - 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const digits = onlyDigits(event.clipboardData.getData('text'));
    if (!digits) return;
    event.preventDefault();
    // A whole code replaces what is there; a few digits go in from the box that was pasted into.
    write(digits.length >= length ? 0 : index, digits);
  };

  return (
    <div role="group" aria-label={label} dir="ltr" className={cn('flex justify-center gap-2', className)}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            boxes.current[index] = node;
          }}
          id={index === 0 ? id : undefined}
          data-testid={`otp-box-${index}`}
          type="tel"
          inputMode="numeric"
          lang="fa"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          aria-label={`${label} ${toPersianDigits(String(index + 1))}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value[index] ?? ''}
          onChange={(event) => onChange(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={(event) => onPaste(index, event)}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(
            'fa-digits h-12 w-full min-w-0 max-w-12 rounded-lg border bg-surface text-center text-xl font-bold text-ink outline-none transition-colors',
            'focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60',
            invalid ? 'border-danger' : value[index] ? 'border-primary/60' : 'border-line-strong',
          )}
        />
      ))}
    </div>
  );
}
