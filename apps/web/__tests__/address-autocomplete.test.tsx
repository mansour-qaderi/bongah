// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const get = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a) } };
});

import { AddressAutocomplete, AUTOCOMPLETE_WAIT_MS, suggestionText } from '@/components/ui/address-autocomplete';

const row = (id: string, title: string, subtitle: string, at: { lat: number; lng: number } | null = { lat: 35.78, lng: 51.37 }) => ({
  provider: 'mapbox',
  id,
  title,
  subtitle,
  lat: at?.lat ?? null,
  lng: at?.lng ?? null,
});

const chosen = vi.fn();
function Harness() {
  const [value, setValue] = useState('');
  return (
    <AddressAutocomplete
      value={value}
      onValueChange={setValue}
      onChoose={(c) => {
        setValue(c.text);
        chosen(c);
      }}
      language="prs"
      listLabel="پیشنهادهای نشانی"
      placeholder="مثلا سعادت‌آباد، خیابان فرهنگ"
    />
  );
}
const input = () => screen.getByRole('combobox') as HTMLInputElement;
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_WAIT_MS + 10);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  chosen.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the address field with suggestions', () => {
  it('joins a row into one line of address', () => {
    expect(suggestionText({ title: 'سعادت‌آباد', subtitle: 'تهران' })).toBe('سعادت‌آباد، تهران');
    expect(suggestionText({ title: 'سعادت‌آباد', subtitle: '' })).toBe('سعادت‌آباد');
  });

  it('shows the natural-style example as its placeholder', () => {
    render(<Harness />);
    expect(input().placeholder).toBe('مثلا سعادت‌آباد، خیابان فرهنگ');
  });

  it('searches once the typing rests, not on every key', async () => {
    get.mockResolvedValue({ data: [row('1', 'سعادت‌آباد', 'تهران')] });
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'سع' } });
    fireEvent.change(input(), { target: { value: 'سعاد' } });
    fireEvent.change(input(), { target: { value: 'سعادت' } });
    expect(get).not.toHaveBeenCalled();
    await settle();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![0]).toBe('geo/autocomplete');
    expect(get.mock.calls[0]![1].query).toMatchObject({ q: 'سعادت', lang: 'prs' });
  });

  it('does not search for one letter', async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'س' } });
    await settle();
    expect(get).not.toHaveBeenCalled();
  });

  it('lists the places found and writes the chosen one as the address, with its place', async () => {
    get.mockResolvedValue({ data: [row('1', 'سعادت‌آباد', 'تهران'), row('2', 'خیابان فرهنگ', 'تهران')] });
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'سعادت' } });
    await settle();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      fireEvent.mouseDown(screen.getByTestId('address-suggestion-0'));
    });
    expect(chosen).toHaveBeenCalledWith({ text: 'سعادت‌آباد، تهران', lat: 35.78, lng: 51.37 });
    expect(input().value).toBe('سعادت‌آباد، تهران');
    expect(screen.queryByRole('listbox')).toBeNull();
    // Writing the picked line must not start another search.
    await settle();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('asks for the place when the row came without one', async () => {
    get.mockImplementation(async (path: string) =>
      path === 'geo/autocomplete' ? { data: [row('p1', 'میدان آزادی', 'تهران', null)] } : { lat: 35.699, lng: 51.337 },
    );
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'میدان' } });
    await settle();
    await act(async () => {
      fireEvent.mouseDown(screen.getByTestId('address-suggestion-0'));
    });
    expect(get).toHaveBeenCalledWith('geo/places/mapbox/p1', expect.anything());
    expect(chosen).toHaveBeenCalledWith({ text: 'میدان آزادی، تهران', lat: 35.699, lng: 51.337 });
  });

  it('picks with the arrow keys and Enter, and closes with Escape', async () => {
    get.mockResolvedValue({ data: [row('1', 'الف', 'ب'), row('2', 'ج', 'د')] });
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'اب' } });
    await settle();
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' });
    });
    expect(chosen).toHaveBeenCalledWith(expect.objectContaining({ text: 'ج، د' }));

    fireEvent.change(input(), { target: { value: 'اب ' } });
    await settle();
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stays a plain text field when the search cannot answer', async () => {
    get.mockRejectedValue(new TypeError('offline'));
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'سعادت' } });
    await settle();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().value).toBe('سعادت');
  });
});
