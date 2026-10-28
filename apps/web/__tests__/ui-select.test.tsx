// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { LanguageProvider } from '@/i18n/provider';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Select } from '@/components/ui/field';

afterEach(() => cleanup());

function Demo({ initial = '', onPick, disabled, invalid }: { initial?: string; onPick?: (v: string) => void; disabled?: boolean; invalid?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <div dir="rtl">
      <Field label="ولایت">
        {(p) => (
          <Select
            {...p}
            value={value}
            disabled={disabled}
            invalid={invalid || p.invalid}
            onChange={(e) => {
              setValue(e.target.value);
              onPick?.(e.target.value);
            }}
          >
            <option value="">انتخاب کنید</option>
            <option value="kabul">کابل</option>
            <option value="herat">هرات</option>
            <option value="balkh" disabled>
              بلخ
            </option>
            <option value="kandahar">کندهار</option>
          </Select>
        )}
      </Field>
    </div>
  );
}

const trigger = () => screen.getByRole('combobox', { name: 'ولایت' });

describe('the select', () => {
  it('is a button named by its label, showing the chosen option', () => {
    render(<Demo initial="herat" />);
    expect(trigger().textContent).toBe('هرات');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('select')).toBeNull(); // no native control anywhere
  });

  it('opens a list of its options, marks the chosen one, and picks with a click', () => {
    const pick = vi.fn();
    render(<Demo initial="herat" onPick={pick} />);
    fireEvent.click(trigger());
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['انتخاب کنید', 'کابل', 'هرات', 'بلخ', 'کندهار']);
    expect(options[2]!.getAttribute('aria-selected')).toBe('true');
    expect(options[3]!.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(options[4]!);
    expect(pick).toHaveBeenCalledWith('kandahar');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger().textContent).toBe('کندهار');
    expect(document.activeElement).toBe(trigger());
  });

  it('does not pick a disabled option', () => {
    const pick = vi.fn();
    render(<Demo onPick={pick} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'بلخ' }));
    expect(pick).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('works from the keyboard: arrows skip a disabled option, Enter picks, Escape closes', () => {
    const pick = vi.fn();
    render(<Demo initial="herat" onPick={pick} />);
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // opens on the chosen one
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(trigger().getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'هرات' }).id);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' }); // «بلخ» is disabled: on to «کندهار»
    expect(trigger().getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'کندهار' }).id);
    fireEvent.keyDown(trigger(), { key: 'Home' });
    expect(trigger().getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'انتخاب کنید' }).id);
    fireEvent.keyDown(trigger(), { key: 'End' });
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(pick).toHaveBeenLastCalledWith('kandahar');

    fireEvent.keyDown(trigger(), { key: ' ' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('jumps to an option by its first letters', () => {
    const pick = vi.fn();
    render(<Demo onPick={pick} />);
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ه' });
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(pick).toHaveBeenCalledWith('herat');
  });

  it('closes when the page is pressed elsewhere, and does nothing when disabled', () => {
    const { rerender } = render(<Demo />);
    fireEvent.click(trigger());
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(<Demo disabled />);
    fireEvent.click(trigger());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so to a screen reader when the field is invalid', () => {
    render(<Demo invalid />);
    expect(trigger().getAttribute('aria-invalid')).toBe('true');
  });

  it('is usable inside a dialog: the list is drawn in the dialog, and Escape closes only the list', () => {
    const onOpenChange = vi.fn();
    render(
      <LanguageProvider initialLanguage="prs">
        <Dialog open onOpenChange={onOpenChange} title="ویرایش">
          <Demo />
        </Dialog>
      </LanguageProvider>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(trigger());
    expect(within(dialog).getByRole('listbox')).toBeTruthy(); // not at the end of the page, where the dialog would ignore it
    fireEvent.click(within(dialog).getByRole('option', { name: 'کابل' }));
    expect(trigger().textContent).toBe('کابل');

    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();

    // With the list shut, the same key does reach the dialog (so the test above proves the list took it).
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('the check box', () => {
  function Box({ initial = false, indeterminate = false, disabled = false }) {
    const [on, setOn] = useState(initial);
    return (
      <Checkbox checked={on} onChange={setOn} label="فقط ناقص" indeterminate={indeterminate} disabled={disabled}>
        فقط ردیف‌های ناقص
      </Checkbox>
    );
  }

  it('toggles by a click on the box or on its label text', () => {
    render(<Box />);
    const box = screen.getByRole('checkbox', { name: 'فقط ناقص' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByText('فقط ردیف‌های ناقص'));
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('shows a mixed state, and not when it is ticked', () => {
    render(<Box indeterminate />);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('mixed');
    cleanup();
    render(<Box initial indeterminate />);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
  });

  it('does not change when disabled', () => {
    render(<Box disabled />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  });
});
