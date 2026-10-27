// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const post = vi.fn();
const refresh = vi.fn();
const toastSuccess = vi.fn();
const mutateAll = vi.fn(async () => undefined);

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('swr', () => ({ mutate: (...a: unknown[]) => mutateAll(...(a as [])) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, post: (...a: unknown[]) => post(...a) } };
});

import { ApiError } from '@/lib/api';
import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { RegisterOffice, validateSetup } from '@/components/agency/register-office';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import type { Language } from '@/i18n/config';

function setup(language: Language = 'prs') {
  return render(
    <LanguageProvider initialLanguage={language}>
      <LanguageSwitcher />
      <RegisterOffice />
    </LanguageProvider>,
  );
}
const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });

beforeEach(() => {
  post.mockReset();
  refresh.mockReset();
  toastSuccess.mockReset();
  mutateAll.mockClear();
});
afterEach(() => cleanup());

describe('validateSetup', () => {
  it('needs a name (2+) and an address (3+), nothing else', () => {
    expect(Object.keys(validateSetup({ name: '', address: '', description: '' })).sort()).toEqual(['address', 'agency_name']);
    expect(validateSetup({ name: 'ab', address: 'کابل', description: '' })).toEqual({});
    expect(validateSetup({ name: ' a ', address: 'کابل', description: '' }).agency_name).toBeTruthy();
    expect(validateSetup({ name: 'علی', address: 'ab', description: '' }).address).toBeTruthy();
    expect(validateSetup({ name: 'علی', address: 'کابل', description: 'x'.repeat(2001) }).description).toBeTruthy();
  });
});

describe('the «ادامه» button', () => {
  it('says what is missing instead of doing nothing, and sends nothing', () => {
    setup();
    fireEvent.click(screen.getByTestId('setup-submit'));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(translate('prs', 'setup.name.error'))).toBeTruthy();
    expect(screen.getByText(translate('prs', 'setup.address.error'))).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('setup-name'));
  });

  it('sends the profile and moves on when the two required fields are filled', async () => {
    post.mockResolvedValue({ id: 'a1' });
    setup();
    type('setup-name', '  دفتر   امین ');
    type('setup-address', 'کابل، ناحیه ۴');
    fireEvent.click(screen.getByTestId('setup-submit'));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('agencies/register', { agency_name: 'دفتر امین', address: 'کابل، ناحیه ۴', description: null });
    await waitFor(() => expect(mutateAll).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith(translate('prs', 'setup.done'));
  });

  it('works with the Enter key too (it is a real form submit)', async () => {
    post.mockResolvedValue({ id: 'a1' });
    setup();
    type('setup-name', 'دفتر امین');
    type('setup-address', 'کابل');
    fireEvent.submit(screen.getByTestId('setup-form'));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it('shows the reason when the account may not create a profile (admin)', async () => {
    post.mockRejectedValue(new ApiError(403, { message: 'Admin accounts cannot register an agency.' }));
    setup();
    type('setup-name', 'دفتر امین');
    type('setup-address', 'کابل');
    fireEvent.click(screen.getByTestId('setup-submit'));
    const box = await screen.findByTestId('setup-error');
    expect(box.textContent).toBe(translate('prs', 'setup.admin.forbidden'));
    expect((screen.getByTestId('setup-submit') as HTMLButtonElement).disabled).toBe(false); // can be pressed again
  });

  it('puts the server\'s field complaints on the fields', async () => {
    post.mockRejectedValue(new ApiError(400, { message: 'Validation failed', errors: [{ field: 'address', message: 'too short' }] }));
    setup();
    type('setup-name', 'دفتر امین');
    type('setup-address', 'کابل');
    fireEvent.click(screen.getByTestId('setup-submit'));
    expect(await screen.findByText(translate('prs', 'setup.address.error'))).toBeTruthy();
  });

  it('names a field it does not have instead of blaming name and address (out-of-date API wanting a licence photo)', async () => {
    post.mockRejectedValue(
      new ApiError(400, { message: 'Validation failed', errors: [{ field: 'license_photo', message: 'Invalid input: expected string, received undefined' }] }),
    );
    setup();
    type('setup-name', 'ادمین رهنمای املاک');
    type('setup-address', 'هرات، ناحیه هشتم');
    fireEvent.click(screen.getByTestId('setup-submit'));
    const box = await screen.findByTestId('setup-error');
    expect(box.textContent).toBe(translate('prs', 'setup.refused', { fields: 'license_photo' }));
    expect(box.textContent).toContain('license_photo');
  });

  it('just loads the profile when it already exists (409)', async () => {
    post.mockRejectedValue(new ApiError(409, { message: 'exists' }));
    setup();
    type('setup-name', 'دفتر امین');
    type('setup-address', 'کابل');
    fireEvent.click(screen.getByTestId('setup-submit'));
    await waitFor(() => expect(mutateAll).toHaveBeenCalled());
    expect(screen.queryByTestId('setup-error')).toBeNull();
  });
});

describe('the language switcher', () => {
  it('redraws the form in Pashto and back (the app is not locked to one language)', () => {
    setup('prs');
    expect(screen.getByText(translate('prs', 'setup.title'))).toBeTruthy();
    fireEvent.click(screen.getByTestId('language-ps'));
    expect(screen.getByText(translate('ps', 'setup.title'))).toBeTruthy();
    expect(screen.queryByText(translate('prs', 'setup.title'))).toBeNull();
    expect(document.cookie).toContain('bongah_lang=ps');
    expect(document.documentElement.lang).toBe('ps-AF');
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId('language-ps').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('language-prs'));
    expect(screen.getByText(translate('prs', 'setup.title'))).toBeTruthy();
    expect(document.cookie).toContain('bongah_lang=prs');
  });

  it('validation messages follow the language chosen', () => {
    setup('ps');
    fireEvent.click(screen.getByTestId('setup-submit'));
    expect(screen.getByText(translate('ps', 'setup.name.error'))).toBeTruthy();
  });
});
