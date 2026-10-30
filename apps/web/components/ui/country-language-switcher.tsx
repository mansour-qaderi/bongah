'use client';

import { useActiveMarket, useMarketSettled } from '@/hooks/use-active-market';
import { LanguageSwitcher } from './language-switcher';

/**
 * The language choice (Dari | Pashto) for a page that is shown before the person is known (the login page): offered only once
 * the country is known to be Afghanistan. In Iran the page is in Persian and has no choice; until the country is found nothing
 * is drawn, so the switcher never flashes up for someone in Iran.
 */
export function CountryLanguageSwitcher({ className }: { className?: string }) {
  const market = useActiveMarket();
  const settled = useMarketSettled();
  if (!settled || market === 'IR') return null;
  return <LanguageSwitcher className={className} />;
}
