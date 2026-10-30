import { useEffect } from 'react';
import { changeLanguage, currentLanguage } from '../i18n';
import { useActiveMarket } from './marketStore';
import { useMarketSync } from './useMarket';

/**
 * Finds the country and keeps the phone's market and the account's market together (see useMarketSync), and keeps the
 * app in Persian while the country is Iran (there is no language choice there). Draws nothing. Reading the market here
 * also loads the saved choice at start-up, before any screen asks for it.
 */
export default function MarketSync() {
  const market = useActiveMarket();
  useMarketSync();
  useEffect(() => {
    if (market === 'IR' && currentLanguage() !== 'prs') changeLanguage('prs');
  }, [market]);
  return null;
}
