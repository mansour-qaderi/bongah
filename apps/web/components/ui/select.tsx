'use client';

import {
  Children,
  forwardRef,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CONTROL } from './control';

/** What `onChange` receives: the part of a native change event every caller used (`e.target.value`), nothing more. */
export interface SelectChangeEvent {
  target: { value: string; name: string };
  currentTarget: { value: string; name: string };
}

export interface SelectProps {
  value: string;
  onChange?: (event: SelectChangeEvent) => void;
  /** `<option value="…" disabled>Label</option>` children, exactly as for a native select. */
  children?: ReactNode;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  /** Shown when no option matches the value. */
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'data-testid'?: string;
}

interface Item {
  value: string;
  label: string;
  disabled: boolean;
}

/** The `<option>` elements among `children`, also through fragments, arrays and `<optgroup>`s. */
function itemsFrom(children: ReactNode): Item[] {
  const items: Item[] = [];
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const el = child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
      if (el.type === Fragment || el.type === 'optgroup') {
        walk(el.props.children);
        return;
      }
      if (el.type !== 'option') return;
      const text = Children.toArray(el.props.children).join('');
      items.push({ value: String(el.props.value ?? text), label: text, disabled: Boolean(el.props.disabled) });
    });
  };
  walk(children);
  return items;
}

const POPUP_MAX = 288;
const GAP = 4;

interface Place {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * A drop-in for the native `<select>`, drawn in the app's own style: a button that shows the chosen label and a
 * listbox that opens under (or, with no room, over) it. It reads the same `<option>` children, calls `onChange` with
 * an event carrying `target.value`, follows the page direction (RTL: text on the right, the chevron on the left), and
 * works from the keyboard: ↑ ↓ Home End PageUp PageDown, Enter or Space to pick, Esc to close, letters to jump.
 *
 * The list is drawn at the end of the page, or of the dialog the button is in (a modal dialog ignores clicks outside
 * itself, and its panel is transformed, so a list outside it would be neither clickable nor placed right).
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { value, onChange, children, id, name, disabled, required, invalid, placeholder, className, ...aria },
  ref,
) {
  const generated = useId();
  const triggerId = id ?? `${generated}-select`;
  const listId = `${generated}-list`;
  const items = useMemo(() => itemsFrom(children), [children]);
  const selected = items.findIndex((i) => i.value === value);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Place | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const popup = useRef<HTMLDivElement | null>(null);
  const typed = useRef({ text: '', at: 0 });

  const setTrigger = useCallback(
    (node: HTMLButtonElement | null) => {
      trigger.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const enabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < items.length; i += step) if (!items[i]!.disabled) return i;
    return -1;
  };

  const openList = () => {
    if (disabled) return;
    setActive(selected >= 0 && !items[selected]!.disabled ? selected : enabled(0, 1));
    setOpen(true);
  };
  const closeList = () => {
    setOpen(false);
    setPlace(null);
  };
  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    closeList();
    trigger.current?.focus();
    if (item.value !== value) {
      const target = { value: item.value, name: name ?? '' };
      onChange?.({ target, currentTarget: target });
    }
  };

  /** Puts the list under the button (over it when the page ends too soon), as wide as the button. */
  const reposition = useCallback(() => {
    const button = trigger.current;
    const list = popup.current;
    if (!button || !list) return;
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const wanted = Math.min(list.scrollHeight, POPUP_MAX);
    const up = spaceBelow < wanted && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, Math.min(POPUP_MAX, up ? spaceAbove : spaceBelow));
    const height = Math.min(list.scrollHeight, maxHeight);
    const viewportTop = up ? rect.top - height - GAP : rect.bottom + GAP;
    const host = button.closest<HTMLElement>('[role="dialog"]');
    if (host) {
      const box = host.getBoundingClientRect();
      setPlace({
        left: rect.left - box.left - host.clientLeft + host.scrollLeft,
        top: viewportTop - box.top - host.clientTop + host.scrollTop,
        width: rect.width,
        maxHeight,
      });
    } else {
      setPlace({ left: rect.left + window.scrollX, top: viewportTop + window.scrollY, width: rect.width, maxHeight });
    }
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition, items.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const at = e.target as Node;
      if (trigger.current?.contains(at) || popup.current?.contains(at)) return;
      closeList();
    };
    // Esc closes the list, not the dialog around it. (A dialog listens on the document while the event is still on its way
    // down; the window is earlier on that way.)
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      closeList();
      trigger.current?.focus();
    };
    const follow = () => reposition();
    window.addEventListener('keydown', onEscape, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      window.removeEventListener('keydown', onEscape, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open, reposition]);

  // The active option stays in view while the arrows move through a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listId]);

  // A list that is open when the button goes away or is disabled has nothing to point at.
  useEffect(() => {
    if (disabled && open) closeList();
  }, [disabled, open]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const move = (to: number) => {
      if (to < 0) return;
      e.preventDefault();
      if (!open) {
        setActive(to);
        setOpen(true);
      } else setActive(to);
    };
    switch (e.key) {
      case 'ArrowDown': {
        if (!open) return move(selected >= 0 ? selected : enabled(0, 1));
        const next = enabled(active + 1, 1);
        return move(next >= 0 ? next : active);
      }
      case 'ArrowUp':
        if (!open) return move(selected >= 0 ? selected : enabled(items.length - 1, -1));
        return move(enabled(active - 1, -1) >= 0 ? enabled(active - 1, -1) : active);
      case 'Home':
        return move(enabled(0, 1));
      case 'End':
        return move(enabled(items.length - 1, -1));
      case 'PageDown':
        return move(enabled(Math.min(items.length - 1, (active < 0 ? 0 : active) + 8), -1));
      case 'PageUp':
        return move(enabled(Math.max(0, (active < 0 ? 0 : active) - 8), 1));
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openList();
        else choose(active);
        return;
      case 'Tab':
        if (open) closeList();
        return;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const now = Date.now();
        const state = typed.current;
        state.text = now - state.at > 700 ? e.key : state.text + e.key;
        state.at = now;
        const needle = state.text.toLowerCase();
        const from = state.text.length === 1 ? (active < 0 ? 0 : active + 1) : Math.max(active, 0);
        const hit = [...items.keys()]
          .map((k) => (k + from) % items.length)
          .find((k) => !items[k]!.disabled && items[k]!.label.toLowerCase().startsWith(needle));
        if (hit !== undefined) move(hit);
      }
    }
  }

  const label = selected >= 0 ? items[selected]!.label : '';
  const host = open && typeof document !== 'undefined' ? (trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? document.body) : null;

  return (
    <div className="relative">
      <button
        ref={setTrigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        data-value={value}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          CONTROL,
          'flex h-10 items-center gap-2 pe-2.5 text-start',
          invalid ? 'border-danger' : 'border-line-strong',
          open && 'border-primary ring-2 ring-primary/20',
          className,
        )}
        {...aria}
      >
        <span className={cn('min-w-0 flex-1 truncate', selected < 0 && 'text-placeholder')}>{label || placeholder || '—'}</span>
        <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {host
        ? createPortal(
            <div
              ref={popup}
              id={listId}
              role="listbox"
              aria-label={aria['aria-label']}
              aria-labelledby={aria['aria-labelledby']}
              data-testid="select-list"
              // Typing and arrows go to the button (it keeps the focus); a press on the list must not take it away.
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                left: place?.left ?? 0,
                top: place?.top ?? 0,
                width: place?.width,
                maxHeight: place?.maxHeight ?? POPUP_MAX,
                visibility: place ? 'visible' : 'hidden',
              }}
              className="z-[70] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 text-sm shadow-lg animate-[reveal_120ms_ease-out]"
            >
              {items.length === 0 ? <div className="px-3 py-2 text-muted">—</div> : null}
              {items.map((item, index) => {
                const isSelected = index === selected;
                return (
                  <div
                    key={`${item.value}-${index}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={item.disabled || undefined}
                    data-active={index === active || undefined}
                    onMouseEnter={() => !item.disabled && setActive(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-ink',
                      index === active && 'bg-soft',
                      isSelected && 'font-semibold text-primary',
                      item.disabled && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span className="min-w-0 flex-1">{item.label || '—'}</span>
                    {isSelected ? <Check aria-hidden className="h-4 w-4 shrink-0" /> : null}
                  </div>
                );
              })}
            </div>,
            host,
          )
        : null}
    </div>
  );
});
