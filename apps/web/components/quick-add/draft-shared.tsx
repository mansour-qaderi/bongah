'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, PencilLine } from 'lucide-react';
import { checkDraft, type DraftErrors, type DraftField } from '@/lib/import/draft-validation';
import type { PublishResult } from '@/lib/import/publish';
import type { DraftRow } from '@/lib/import/types';
import type { MessageKey } from '@/i18n/translate';
import { useT } from '@/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Tip } from '@/components/ui/tooltip';

/** The name of each field that can be missing, for the one-line hint. */
export const FIELD_LABEL: Partial<Record<DraftField, MessageKey>> = {
  title: 'import.field.title',
  type: 'import.field.type',
  deal_type: 'import.field.deal_type',
  price: 'import.field.price',
  currency: 'import.field.currency',
  area_sqm: 'import.field.area_sqm',
  province: 'import.field.province',
  address: 'import.field.address',
  bedrooms: 'import.field.bedrooms',
  bathrooms: 'import.field.bathrooms',
  district: 'import.field.district',
  neighborhood: 'import.field.neighborhood',
};

/** The name of the column a complaint is about, so the agent knows which cell to look at. */
export function fieldName(t: (key: MessageKey) => string, field: DraftField): string {
  if (field === 'location') return t('grid.f.location');
  if (field === 'description') return t('import.field.description');
  if (field === 'images') return t('import.field.images');
  const key = FIELD_LABEL[field];
  return key ? t(key) : field;
}

/** Where a row stands, in three words an agent already uses: ready to register, incomplete, refused by the server. */
export type RowState = 'ready' | 'incomplete' | 'failed';

export const STATE_VIEW: Record<RowState, { tone: 'primary' | 'gold' | 'danger'; icon: typeof CheckCircle2; label: MessageKey; tip: MessageKey }> = {
  ready: { tone: 'primary', icon: CheckCircle2, label: 'grid.ready', tip: 'grid.tip.ready' },
  incomplete: { tone: 'gold', icon: PencilLine, label: 'grid.needsFix', tip: 'grid.tip.incomplete' },
  failed: { tone: 'danger', icon: AlertCircle, label: 'grid.failed', tip: 'grid.tip.failed' },
};

/** The status of one row: a word with an icon (never the icon alone), and a tooltip that says what it means. */
export function StatusPill({ state, withTip = true }: { state: RowState; withTip?: boolean }) {
  const t = useT();
  const view = STATE_VIEW[state];
  const Icon = view.icon;
  const pill = (
    <Badge tone={view.tone} role="img" aria-label={`${t(view.label)}. ${t(view.tip)}`} data-state={state}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {t(view.label)}
    </Badge>
  );
  return withTip ? <Tip label={t(view.tip)}>{pill}</Tip> : pill;
}

/**
 * What a draft shows about itself, the same in the table row and in the card: its status, the cells to fix (loud only
 * after «ثبت» was pressed, the row was touched or the server refused it), and a quiet list of what is still missing.
 */
export function useRowReport(row: DraftRow, serverError: PublishResult | undefined, attempted: boolean) {
  const t = useT();
  const [touched, setTouched] = useState(false);
  const check = checkDraft(row);
  const loud = attempted || touched || Boolean(serverError);
  const errors: DraftErrors = loud ? { ...check.errors, ...(serverError?.errors ?? {}) } : {};
  const missing = !loud && !check.ok ? (Object.keys(check.errors) as DraftField[]).map((f) => (f in FIELD_LABEL ? t(FIELD_LABEL[f]!) : '')).filter(Boolean) : [];
  const state: RowState = serverError ? 'failed' : check.ok ? 'ready' : 'incomplete';
  const fixes = (Object.entries(errors) as [DraftField, string][]).filter(([, text]) => Boolean(text));
  return { errors, missing, state, fixes, hasProblem: fixes.length > 0 || Boolean(serverError), touch: () => setTouched(true), bad: (f: DraftField) => Boolean(errors[f]) };
}
