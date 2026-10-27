'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LADDER_SPEND_COST } from '@bongah/shared-types';
import { formatNumber } from '@/lib/format';
import type { FeaturedSource } from '@/lib/listing-actions';
import { useMe, useWallet } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';

const COST = LADDER_SPEND_COST.FEATURED_FRAME;

/** Chooses what pays for the featured frame on the selected listings: featured credits or ladders. */
export function FeaturedDialog({
  open,
  onOpenChange,
  count,
  skipped,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Listings that can get the frame (active and not already featured). */
  count: number;
  /** Selected listings that cannot (not active, or already featured). */
  skipped: number;
  onConfirm: (source: FeaturedSource) => void;
}) {
  const t = useT();
  const { data: me } = useMe();
  const { data: wallet } = useWallet();
  const credits = me?.featured_credits ?? 0;
  const ladders = wallet?.ladder_tokens ?? 0;
  const laddersNeeded = count * COST;
  const [picked, setPicked] = useState<FeaturedSource | null>(null);

  const options: { key: FeaturedSource; title: string; have: string; need: string; enough: boolean }[] = [
    {
      key: 'credits',
      title: t('featured.credits'),
      have: t('featured.creditsHave', { n: formatNumber(credits) }),
      need: t('featured.creditsNeed', { n: formatNumber(count) }),
      enough: credits >= count,
    },
    {
      key: 'ladders',
      title: t('featured.ladders'),
      have: t('featured.laddersHave', { n: formatNumber(ladders) }),
      need: t('featured.laddersNeed', { n: formatNumber(laddersNeeded), cost: formatNumber(COST) }),
      enough: ladders >= laddersNeeded,
    },
  ];
  const choice = picked ?? options.find((o) => o.enough)?.key ?? null;
  const chosen = options.find((o) => o.key === choice);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.featured')}
      description={t('featured.desc', { n: formatNumber(count) })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="gold" disabled={!chosen?.enough || count === 0} onClick={() => choice && onConfirm(choice)}>
            {t('featured.apply')}
          </Button>
        </>
      }
    >
      {count === 0 ? (
        <p className="rounded-xl bg-soft p-3 text-[13px] text-ink-2">
          {t('featured.none')}
        </p>
      ) : (
        <div className="space-y-3">
          <div role="radiogroup" aria-label={t('featured.payWith')} className="grid gap-3 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.key}
                role="radio"
                aria-checked={choice === o.key}
                onClick={() => setPicked(o.key)}
                className={cn(
                  'rounded-xl border p-4 text-start transition-colors',
                  choice === o.key ? 'border-primary bg-primary-tint' : 'border-line-strong hover:border-primary',
                  !o.enough && 'opacity-70',
                )}
              >
                <div className="text-sm font-bold text-ink">{o.title}</div>
                <div className="mt-1 text-xs text-ink-2">{o.have}</div>
                <div className={cn('text-xs', o.enough ? 'text-muted' : 'text-danger')}>{o.need}</div>
              </button>
            ))}
          </div>
          {!options.some((o) => o.enough) ? (
            <p className="text-[13px] text-danger">
              {t('featured.insufficient')}{' '}
              <Link href="/dashboard/subscription" className="font-bold underline">
                {t('featured.buyBundle')}
              </Link>
            </p>
          ) : null}
          {skipped > 0 ? (
            <p className="text-xs text-muted">{t('featured.skipped', { n: formatNumber(skipped) })}</p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
