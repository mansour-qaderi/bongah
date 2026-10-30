'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MapPin } from 'lucide-react';
import type { Language, PlaceDetails, PlaceSuggestion, PlaceSuggestions } from '@bongah/shared-types';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Input } from './field';

/** What choosing a row hands the form: the address line to write, and where the place is. */
export interface ChosenAddress {
  text: string;
  lat: number;
  lng: number;
}

type Props = {
  id?: string;
  invalid?: boolean;
  'aria-describedby'?: string;
  value: string;
  onValueChange: (text: string) => void;
  /** A suggestion was chosen (and found): write `text` and put the pin at its place. */
  onChoose: (chosen: ChosenAddress) => void;
  placeholder?: string;
  language: Language;
  /** Ranks nearer places first: the pin when there is one, else the middle of the country. */
  near?: { lat: number; lng: number } | null;
  /** What a screen reader calls the list of suggestions. */
  listLabel: string;
  className?: string;
};

/** The wait after the last key before a search is made: one request per pause, not per key. */
export const AUTOCOMPLETE_WAIT_MS = 350;
const MIN_CHARS = 2;

/** The one line a row stands for in the field: the name, then where it is. */
export const suggestionText = (s: Pick<PlaceSuggestion, 'title' | 'subtitle'>): string =>
  [s.title, s.subtitle].map((part) => part.trim()).filter(Boolean).join('، ');

function newSession(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * The address field with suggestions: while the person types, places that match (a neighbourhood, a street, a landmark)
 * are listed under the field, and choosing one writes it as the address and puts the pin there. The server does the
 * searching (GET geo/autocomplete, the same service the phone app uses), once the typing rests. If it cannot answer
 * (no key, offline, signed out) the field simply stays a plain text field. Arrow keys and Enter pick a row; Escape closes.
 */
export function AddressAutocomplete({
  id,
  invalid,
  'aria-describedby': describedBy,
  value,
  onValueChange,
  onChoose,
  placeholder,
  language,
  near,
  listLabel,
  className,
}: Props) {
  const listId = useId();
  const [rows, setRows] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /** Set by typing, cleared by choosing: a value the form wrote itself (a pick) must not start a search. */
  const typed = useRef(false);
  const session = useRef(newSession());
  const abort = useRef<AbortController | null>(null);
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    if (!typed.current) return;
    const q = value.replace(/\s+/g, ' ').trim();
    abort.current?.abort();
    if (q.length < MIN_CHARS) {
      setRows([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(async () => {
      try {
        const here = nearRef.current;
        const answer = await api.get<PlaceSuggestions>('geo/autocomplete', {
          signal: controller.signal,
          query: { q, lang: language, session: session.current, lat: here?.lat.toFixed(5), lng: here?.lng.toFixed(5) },
        });
        if (controller.signal.aborted) return;
        setRows(answer.data.slice(0, 6));
        setActive(-1);
        setOpen(answer.data.length > 0);
      } catch (error) {
        if (controller.signal.aborted) return;
        // Not signed in, no provider, offline: no suggestions, the field still works as typed.
        if (!(error instanceof ApiError) && !(error instanceof TypeError)) throw error;
        setRows([]);
        setOpen(false);
      }
    }, AUTOCOMPLETE_WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, language]);

  async function choose(row: PlaceSuggestion) {
    typed.current = false;
    setOpen(false);
    setRows([]);
    const text = suggestionText(row);
    let lat = row.lat;
    let lng = row.lng;
    if (lat === null || lng === null) {
      try {
        const details = await api.get<PlaceDetails>(`geo/places/${row.provider}/${encodeURIComponent(row.id)}`, {
          query: { session: session.current, lang: language },
        });
        lat = details.lat;
        lng = details.lng;
      } catch {
        // The place could not be found again: the words are still a good address.
        onValueChange(text);
        return;
      }
    }
    // One search session is billed as one: the next search starts a new one.
    session.current = newSession();
    onChoose({ text, lat, lng });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || rows.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      void choose(rows[active]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div
      className={cn('relative', className)}
      onBlur={(event) => {
        // Leaving the field and its list closes the list (a click on a row keeps the focus inside, see onMouseDown).
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Input
        id={id}
        invalid={invalid}
        aria-describedby={describedBy}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          typed.current = true;
          onValueChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => rows.length > 0 && setOpen(true)}
      />
      {open && rows.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          data-testid="address-suggestions"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {rows.map((row, index) => (
            <li
              key={`${row.provider}:${row.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              data-testid={`address-suggestion-${index}`}
              // mouse-down, not click: it runs before the field loses focus, which would close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                void choose(row);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn('flex cursor-pointer items-start gap-2 px-3 py-2 text-start', index === active ? 'bg-primary-tint' : 'hover:bg-soft')}
            >
              <MapPin aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{row.title}</span>
                {row.subtitle ? <span className="block truncate text-xs text-muted">{row.subtitle}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
