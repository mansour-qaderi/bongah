'use client';

import { useMemo } from 'react';
import { labelsFor, type Labels } from '@/lib/labels';
import { useLanguage } from './provider';

/** The names of property types, deals, statuses, plans and so on in the page's language (for components). */
export function useLabels(): Labels {
  const { language } = useLanguage();
  return useMemo(() => labelsFor(language), [language]);
}
