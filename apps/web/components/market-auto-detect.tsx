'use client';

import { useEffect } from 'react';
import { useActiveMarket } from '@/hooks/use-active-market';
import { useLanguage } from '@/i18n/provider';
import { settleMarket } from '@/lib/market';

/**
 * Finds the person's country once (from the browser's position; Iran when that cannot be told, see settleMarket) and keeps the
 * page in Persian while the country is Iran, where there is no language choice. Draws nothing. Mounted in the root layout,
 * so the login page has the country too.
 */
export function MarketAutoDetect() {
  const market = useActiveMarket();
  const { language, setLanguage } = useLanguage();
  useEffect(() => {
    void settleMarket();
  }, []);
  useEffect(() => {
    if (market === 'IR' && language !== 'prs') setLanguage('prs');
  }, [market, language, setLanguage]);
  return null;
}
