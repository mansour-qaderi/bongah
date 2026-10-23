'use client';

import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/field';

/**
 * Text that turns into an input when you click the pencil (or double-click the text). Enter saves, Escape cancels.
 * `validate` returns an error message to keep the editor open, or null to accept. `onSave` may throw to keep it open.
 */
export function InlineEdit({
  value,
  display,
  label,
  validate,
  onSave,
  inputClassName,
  ltr,
  inputMode,
  className,
}: {
  value: string;
  display: ReactNode;
  label: string;
  validate: (draft: string) => string | null;
  onSave: (draft: string) => Promise<void>;
  inputClassName?: string;
  ltr?: boolean;
  inputMode?: 'text' | 'decimal' | 'numeric';
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  function start() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function commit() {
    if (draft.trim() === value.trim()) {
      setEditing(false);
      return;
    }
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      /* the caller has already told the person why; the editor stays open with their text */
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className={cn('group/edit flex min-w-0 items-center gap-1.5', className)} onDoubleClick={start}>
        <div className="min-w-0">{display}</div>
        <button
          type="button"
          onClick={start}
          aria-label={`ویرایش ${label}`}
          className="shrink-0 rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-soft hover:text-primary focus-visible:opacity-100 group-hover/edit:opacity-100"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1">
        <Input
          ref={ref}
          value={draft}
          invalid={Boolean(error)}
          inputMode={inputMode}
          disabled={saving}
          aria-label={label}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          className={cn('h-8 rounded-lg px-2 text-[13px]', ltr && 'ltr text-start', inputClassName)}
        />
        <button type="button" onClick={() => void commit()} disabled={saving} aria-label="ذخیره" className="rounded-md p-1.5 text-primary hover:bg-primary-tint">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} aria-label="انصراف" className="rounded-md p-1.5 text-muted hover:bg-soft">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
