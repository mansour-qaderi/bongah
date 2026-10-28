'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CONTROL } from './control';

// The select is drawn by the app (select.tsx), not by the browser; it is still imported from here, with the other fields.
export { Select, type SelectChangeEvent, type SelectProps } from './select';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, 'h-10', invalid ? 'border-danger' : 'border-line-strong', className)}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, 'min-h-24 py-2 leading-7', invalid ? 'border-danger' : 'border-line-strong', className)}
        {...rest}
      />
    );
  },
);

/** A labelled field. The control gets the id through the render function, so the label is really tied to it. */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (props: { id: string; invalid: boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-semibold text-ink-2">
        {label}
        {required ? <span className="ms-1 text-danger">*</span> : null}
      </label>
      {children({ id, invalid: Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A check box drawn by the app: a rounded square that fills green with a tick (or a dash when only some of a group are
 * ticked). It is a button with role=checkbox, so the keyboard (Space) and screen readers treat it as one; `label` is its
 * name, and `children`, when given, is a visible label beside the box that toggles it too.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
  className,
  disabled,
  children,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  indeterminate?: boolean;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
  id?: string;
}) {
  const mixed = Boolean(indeterminate) && !checked;
  return (
    <button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group inline-flex items-center gap-2 rounded-md text-start text-sm text-ink-2 outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-colors duration-150',
          checked || mixed
            ? 'border-primary bg-primary text-white'
            : 'border-line-strong bg-surface text-transparent group-hover:border-primary group-disabled:group-hover:border-line-strong',
        )}
      >
        {mixed ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {children ? <span className="min-w-0">{children}</span> : null}
    </button>
  );
}

/** An on/off switch (role=switch). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
        checked ? 'border-primary bg-primary' : 'border-line-strong bg-line',
      )}
    >
      <span
        aria-hidden
        className="inline-block h-[18px] w-[18px] rounded-full bg-white transition-[margin] duration-150"
        style={{ marginInlineStart: checked ? 23 : 3 }}
      />
    </button>
  );
}
