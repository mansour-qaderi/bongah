'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { tNow } from '@/i18n/active';
import { useT } from '@/i18n/provider';
import { MAX_DRAFTS, useDrafts } from '@/lib/import/drafts-store';
import { parseText, splitListings } from '@/lib/import/parse-text';
import { usePinned } from '@/hooks/use-pinned';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch, Textarea } from '@/components/ui/field';

const MAX_CHARS = 200_000;

/** Paste messages as they come from Telegram or WhatsApp; the listings are read out of them and land in the draft grid. */
export function SmartText() {
  const t = useT();
  const EXAMPLE = t('text.example');
  const [text, setText] = useState('');
  // Off by default: the description keeps the whole text, every number and note in it.
  const [stripPhones, setStripPhones] = useState(false);
  const [single, setSingle] = useState(false);
  const [pinned] = usePinned();
  const { actions } = useDrafts();
  const deferred = useDeferredValue(text);
  const count = useMemo(() => (deferred.trim() ? splitListings(deferred, { single }).length : 0), [deferred, single]);

  function analyse() {
    const rows = parseText(text, { defaults: pinned, stripPhones, single });
    if (rows.length === 0) {
      toast.info(tNow('text.empty'));
      return;
    }
    const left = actions.add(rows);
    toast.success(tNow('text.made', { n: formatNumber(rows.length - left) }));
    if (left > 0) toast.warning(tNow('text.overflow', { max: formatNumber(MAX_DRAFTS), left: formatNumber(left) }));
    setText('');
    requestAnimationFrame(() => document.getElementById('drafts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{t('text.heading')}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {t('text.help')}
          </p>
        </div>
        <button type="button" onClick={() => setText(EXAMPLE)} className="text-[13px] font-semibold text-primary hover:underline">
          {t('text.useExample')}
        </button>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        rows={12}
        aria-label={t('text.aria')}
        placeholder={EXAMPLE}
        className="min-h-60 text-[13px] leading-7"
      />
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={analyse} disabled={!text.trim()} className="gap-2">
          <Sparkles aria-hidden className="h-4 w-4" />
          {t('text.analyse')}
        </Button>
        {count > 0 ? <span className="text-[13px] font-semibold text-primary">{t('text.detected', { n: formatNumber(count) })}</span> : null}
        <div className="ms-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            {t('text.single')}
            <Switch label={t('text.singleAria')} checked={single} onChange={setSingle} />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            {t('text.stripPhones')}
            <Switch label={t('text.stripPhonesAria')} checked={stripPhones} onChange={setStripPhones} />
          </label>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        {t('text.footer')}
      </p>
    </Card>
  );
}
