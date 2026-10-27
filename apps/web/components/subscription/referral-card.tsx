'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Gift, Send, Users } from 'lucide-react';
import { LADDERS_PER_LISTING, type ReferralSummary, type SpendLaddersResponse } from '@bongah/shared-types';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { refreshListingData } from '@/lib/listing-actions';
import { tNow } from '@/i18n/active';
import { useT } from '@/i18n/provider';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

async function copy(text: string, what: 'code' | 'link') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(tNow(what === 'code' ? 'ref.copiedCode' : 'ref.copiedLink'));
  } catch {
    toast.error(tNow('ref.copyFailed'));
  }
}

export function ReferralCard({
  data,
  error,
  loading,
  onRetry,
}: {
  data: ReferralSummary | undefined;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  const [spending, setSpending] = useState(false);
  const [copied, setCopied] = useState(false);

  if (loading && !data) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-11 w-full" />
        <Skeleton className="mt-3 h-24 w-full" />
      </Card>
    );
  }
  if (error && !data) {
    return (
      <Card>
        <ErrorState message={errorMessage(error)} onRetry={onRetry} />
      </Card>
    );
  }
  if (!data) return null;

  const link = data.share_url ?? '';
  const shareText = `${t('ref.shareText', { code: data.referral_code })}${link ? `\n${link}` : ''}`;
  const { stats } = data;

  async function spend() {
    setSpending(true);
    try {
      const res = await api.post<SpendLaddersResponse>('rewards/ladders/spend', { purpose: 'LISTING_QUOTA' });
      toast.success(tNow('ref.spent', { n: formatNumber(res.ladders_available) }));
      await Promise.all([mutate('wallet'), mutate('referrals/me'), refreshListingData()]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSpending(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('ref.title')}
        description={t('ref.desc', { n: formatNumber(LADDERS_PER_LISTING) })}
      />
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted">{t('ref.code')}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="ltr tabular text-lg font-extrabold tracking-wider text-ink">{data.referral_code}</span>
              <Button size="sm" variant="secondary" onClick={() => void copy(data.referral_code, 'code')} className="gap-1.5">
                <Copy aria-hidden className="h-3.5 w-3.5" />
                {t('ref.copy')}
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted">{t('ref.link')}</div>
            {link ? (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="ltr min-w-0 flex-1 truncate text-[13px] text-ink-2">{link}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => {
                    void copy(link, 'link');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
                  {copied ? t('ref.copiedBtn') : t('ref.copy')}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">{t('ref.noLink')}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3 text-[13px] font-semibold text-ink-2 hover:border-primary hover:text-primary"
          >
            <Send aria-hidden className="h-4 w-4" />
            {t('ref.whatsapp')}
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(link || 'https://t.me')}&text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3 text-[13px] font-semibold text-ink-2 hover:border-primary hover:text-primary"
          >
            <Send aria-hidden className="h-4 w-4" />
            {t('ref.telegram')}
          </a>
        </div>

        <dl className="tabular grid grid-cols-3 gap-3 text-center">
          <Stat label={t('ref.stat.invited')} value={stats.invited_count} />
          <Stat label={t('ref.stat.rewarded')} value={t('ref.stat.rewardedValue', { n: formatNumber(stats.rewarded_invites), max: formatNumber(stats.max_rewarded_invites) })} />
          <Stat label={t('ref.stat.ladders')} value={stats.ladder_tokens_available} />
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-tint/50 p-3">
          <p className="text-[13px] text-ink-2">
            <Gift aria-hidden className="me-1.5 inline h-4 w-4 text-primary" />
            {stats.ladder_tokens_available >= LADDERS_PER_LISTING
              ? t('ref.convert.can', { n: formatNumber(LADDERS_PER_LISTING) })
              : t('ref.convert.need', { n: formatNumber(LADDERS_PER_LISTING) })}
          </p>
          <Button size="sm" loading={spending} disabled={stats.ladder_tokens_available < LADDERS_PER_LISTING} onClick={() => void spend()}>
            {t('ref.convert.button')}
          </Button>
        </div>

        {data.invited.length === 0 ? (
          <EmptyState compact icon={Users} title={t('ref.empty.title')} description={t('ref.empty.text')} />
        ) : (
          <div>
            <h3 className="mb-2 text-[13px] font-bold text-ink">{t('ref.invited.title')}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {data.invited.slice(0, 8).map((i) => (
                <li key={`${i.phone_masked}${i.joined_at}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-ink">{i.name ?? t('account.fallbackName')}</span>
                  <span className="ltr tabular text-xs text-muted">{i.phone_masked}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDate(i.joined_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <dd className="text-lg font-extrabold text-ink">{typeof value === 'number' ? formatNumber(value) : value}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
    </div>
  );
}
