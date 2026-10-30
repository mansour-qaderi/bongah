'use client';

import { useMemo } from 'react';
import { useActiveMarket } from '@/hooks/use-active-market';
import { labelsFor, type Labels } from '@/lib/labels';
import { useLanguage } from './provider';
import { marketKey, translateFor, type MessageKey, type MessageParams } from './translate';

/** The names of property types, deals, statuses, plans and so on in the page's language and market (for components). */
export function useLabels(): Labels {
  const { language } = useLanguage();
  const market = useActiveMarket();
  return useMemo(() => labelsFor(language, market), [language, market]);
}

/**
 * The translator for the page's language, worded for the market the person is in: a text that has an Iranian sibling
 * («…IR», see `marketKey`) reads in the Iranian words in Iran. For every text that can say something Afghan.
 */
export function useMarketT(): (key: MessageKey, params?: MessageParams) => string {
  const { language } = useLanguage();
  const market = useActiveMarket();
  return useMemo(() => (key, params) => translateFor(language, key, market, params), [language, market]);
}

export { marketKey };
