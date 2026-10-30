// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { prs } from '@/i18n/messages/prs';
import { labelsFor } from '@/lib/labels';
import { setActiveMarket } from '@/lib/market';
import { CountryLanguageSwitcher } from '@/components/ui/country-language-switcher';

afterEach(() => {
  cleanup();
  setActiveMarket('AF');
});

const wrap = () =>
  render(
    <LanguageProvider initialLanguage="prs">
      <CountryLanguageSwitcher />
    </LanguageProvider>,
  );

describe('Iran’s own words', () => {
  const ir = labelsFor('prs', 'IR');
  const af = labelsFor('prs', 'AF');

  it('says «قابل توافق», never «جورآمد», for a price open to an offer', () => {
    expect(ir.terms.NEGOTIABLE).toBe('قابل توافق');
    expect(ir.terms.FIXED).toBe('مقطوع');
    expect(af.terms.NEGOTIABLE).toBe('جورآمد'); // Afghanistan keeps its word
    expect(Object.values(ir.terms).join(' ')).not.toContain('جورآمد');
  });

  it('uses Iran’s names for the deals', () => {
    expect(ir.deal.SALE).toBe('فروش');
    expect(ir.deal.MORTGAGE_GROWI).toBe('رهن کامل');
    expect(ir.deal.MORTGAGE_RENT).toBe('اجاره'); // a deposit and a monthly rent
    expect(ir.deal.DAILY_RENT).toBe('اجاره روزانه');
    expect(translate('prs', 'form.deposit')).toContain('ودیعه');
    expect(translate('prs', 'form.monthlyRent')).toContain('ماهانه');
    expect(ir.feature.SINGLE_DEED).toBe('سند تک‌برگ');
  });

  it('never writes «تشناب» in a Dari / Persian label', () => {
    const offenders = Object.entries(prs).filter(([, v]) => String(v).includes('تشناب'));
    expect(offenders).toEqual([]);
  });
});

describe('the language choice', () => {
  it('is not drawn in Iran (Persian only), and is drawn in Afghanistan once the country is known', async () => {
    const { settleMarket, activeMarket } = await import('@/lib/market');
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    const view = wrap();
    // Before the country is found nothing is drawn, so it never flashes up for someone in Iran.
    expect(screen.queryByTestId('language-switcher')).toBeNull();
    await act(async () => {
      await settleMarket(); // no position and no saved country: Iran
    });
    expect(activeMarket()).toBe('IR');
    expect(screen.queryByTestId('language-switcher')).toBeNull();
    await act(async () => setActiveMarket('AF'));
    expect(screen.getByTestId('language-switcher')).toBeTruthy();
    expect(screen.getByTestId('language-prs')).toBeTruthy();
    expect(screen.getByTestId('language-ps')).toBeTruthy();
    view.unmount();
  });
});
