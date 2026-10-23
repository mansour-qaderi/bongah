'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LADDER_SPEND_COST } from '@bongah/shared-types';
import { formatNumber } from '@/lib/format';
import type { FeaturedSource } from '@/lib/listing-actions';
import { useMe, useWallet } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

const COST = LADDER_SPEND_COST.FEATURED_FRAME;

/** Chooses what pays for the featured frame (کادر ویژه) on the selected listings: featured credits or ladders. */
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
  const { data: me } = useMe();
  const { data: wallet } = useWallet();
  const credits = me?.featured_credits ?? 0;
  const ladders = wallet?.ladder_tokens ?? 0;
  const laddersNeeded = count * COST;
  const [picked, setPicked] = useState<FeaturedSource | null>(null);

  const options: { key: FeaturedSource; title: string; have: string; need: string; enough: boolean }[] = [
    {
      key: 'credits',
      title: 'اعتبار کادر ویژه',
      have: `${formatNumber(credits)} اعتبار دارید`,
      need: `${formatNumber(count)} اعتبار لازم است`,
      enough: credits >= count,
    },
    {
      key: 'ladders',
      title: 'نردبان',
      have: `${formatNumber(ladders)} نردبان دارید`,
      need: `${formatNumber(laddersNeeded)} نردبان لازم است (هر آگهی ${formatNumber(COST)})`,
      enough: ladders >= laddersNeeded,
    },
  ];
  const choice = picked ?? options.find((o) => o.enough)?.key ?? null;
  const chosen = options.find((o) => o.key === choice);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="پوشش با کادر ویژه"
      description={`${formatNumber(count)} آگهی فعال کادر ویژه می‌گیرد و بالاتر دیده می‌شود.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button variant="gold" disabled={!chosen?.enough || count === 0} onClick={() => choice && onConfirm(choice)}>
            اعمال کادر ویژه
          </Button>
        </>
      }
    >
      {count === 0 ? (
        <p className="rounded-xl bg-soft p-3 text-[13px] text-ink-2">
          آگهی مناسبی انتخاب نشده است؛ کادر ویژه فقط برای آگهی‌های فعال و بدون کادر ویژه است.
        </p>
      ) : (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="پرداخت با" className="grid gap-3 sm:grid-cols-2">
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
              موجودی کافی نیست.{' '}
              <Link href="/dashboard/subscription" className="font-bold underline">
                خرید بسته کادر ویژه
              </Link>
            </p>
          ) : null}
          {skipped > 0 ? (
            <p className="text-xs text-muted">{formatNumber(skipped)} آگهی انتخاب‌شده (غیرفعال یا دارای کادر ویژه) نادیده گرفته می‌شود.</p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
