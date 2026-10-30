'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Gift } from 'lucide-react';
import { GIFT_MAX_CREDITS } from '@bongah/validation';
import type { AdminAuditEntry, AdminUserDetail, AdminUserItem, Paginated } from '@bongah/shared-types';
import { api, errorMessage, fetcher } from '@/lib/api';
import { formatDateTime, formatNumber, formatPhone } from '@/lib/format';
import { useT } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { NumberStepper } from '@/components/ui/number-stepper';
import { AdminPage, PersonCell, SearchBox, useAdminList, useDebounced } from './admin-kit';

/**
 * Gifts and bonuses: find an account, say how many free listings and featured frames it gets (and why), and give them.
 * The API adds them to the account's balance and writes the gift into the audit log; the list below is read from there.
 */
export function AdminGifts() {
  const t = useT();
  const preselected = useSearchParams().get('user');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const found = useAdminList<AdminUserItem>('admin/users', { q }, 1);
  const [target, setTarget] = useState<AdminUserItem | AdminUserDetail | null>(null);

  // Arriving from the accounts page with ?user=<id>: that account is already chosen.
  const linked = useSWR<AdminUserDetail>(preselected ? `admin/users/${preselected}` : null, fetcher);
  useEffect(() => {
    if (linked.data) setTarget(linked.data);
  }, [linked.data]);

  const recent = useSWR<Paginated<AdminAuditEntry>>('admin/audit-log?action=USER_GIFTED&limit=10', fetcher, { refreshInterval: 30_000 });

  return (
    <AdminPage title={t('adm.gift.title')} subtitle={t('adm.gift.subtitle')}>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 text-[13px] font-semibold text-ink-2">{t('adm.gift.find')}</p>
          <SearchBox value={search} onChange={setSearch} placeholder={t('adm.us.searchHint')} testId="admin-gift-search" />
          <ul className="mt-3 divide-y divide-line" data-testid="admin-gift-results">
            {(found.data?.data ?? []).slice(0, 8).map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setTarget(u)}
                  aria-pressed={target?.id === u.id}
                  data-testid="admin-gift-pick"
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-start hover:bg-soft aria-pressed:bg-primary-tint"
                >
                  <PersonCell person={u} />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <GiftForm
          target={target}
          onGiven={(updated) => {
            setTarget(updated);
            void recent.mutate();
            void found.mutate();
          }}
        />
      </div>

      <Card>
        <CardHeader title={t('adm.gift.recent')} />
        <div className="p-5 pt-3">
          {!recent.data || recent.data.data.length === 0 ? (
            <EmptyState compact icon={Gift} title={t('adm.gift.noRecent')} />
          ) : (
            <ul className="divide-y divide-line text-[13px]" data-testid="admin-gift-recent">
              {recent.data.data.map((e) => {
                const meta = (e.metadata ?? {}) as { listing_credits?: number; featured_credits?: number; note?: string };
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="font-semibold text-ink">
                      {t('adm.gift.recentRow', { listings: formatNumber(meta.listing_credits ?? 0), featured: formatNumber(meta.featured_credits ?? 0) })}
                    </span>
                    {meta.note ? <span className="min-w-0 flex-1 truncate text-muted">{meta.note}</span> : null}
                    <span className="tabular text-xs text-muted">{formatDateTime(e.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </AdminPage>
  );
}

function GiftForm({ target, onGiven }: { target: AdminUserItem | AdminUserDetail | null; onGiven: (updated: AdminUserDetail) => void }) {
  const t = useT();
  // Whole numbers only (see NumberStepper): there is no text in these boxes to be wrong.
  const [listings, setListings] = useState<number | null>(null);
  const [featured, setFeatured] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setListings(null);
    setFeatured(null);
    setNote('');
  }, [target?.id]);

  if (!target) {
    return (
      <Card className="p-5">
        <EmptyState compact icon={Gift} title={t('adm.gift.pickFirst')} />
      </Card>
    );
  }

  const nListings = listings ?? 0;
  const nFeatured = featured ?? 0;
  const ok = nListings + nFeatured > 0 && (note.trim() === '' || note.trim().length >= 3);

  async function give() {
    if (!target) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { listing_credits: nListings, featured_credits: nFeatured };
      if (note.trim()) body.note = note.trim();
      const updated = await api.post<AdminUserDetail>(`admin/users/${target.id}/gift`, body);
      toast.success(t('adm.gift.given'));
      onGiven(updated);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5" data-testid="admin-gift-form">
      <div>
        <p className="text-[13px] font-semibold text-muted">{t('adm.gift.to')}</p>
        <p className="text-base font-extrabold text-ink">{target.full_name ?? '—'}</p>
        <p className="ltr tabular text-xs text-muted">{formatPhone(target.phone_number)}</p>
        <p className="tabular mt-1 text-xs text-ink-2" data-testid="admin-gift-balance">
          {t('adm.gift.balance', { listings: formatNumber(target.listing_credits), featured: formatNumber(target.featured_credits) })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('adm.gift.listings')} hint={t('adm.gift.max', { max: formatNumber(GIFT_MAX_CREDITS) })}>
          {(props) => (
            <NumberStepper
              {...props}
              value={listings}
              onValueChange={setListings}
              max={GIFT_MAX_CREDITS}
              decreaseLabel={t('adm.gift.decrease')}
              increaseLabel={t('adm.gift.increase')}
              data-testid="admin-gift-listings"
            />
          )}
        </Field>
        <Field label={t('adm.gift.featured')} hint={t('adm.gift.max', { max: formatNumber(GIFT_MAX_CREDITS) })}>
          {(props) => (
            <NumberStepper
              {...props}
              value={featured}
              onValueChange={setFeatured}
              max={GIFT_MAX_CREDITS}
              decreaseLabel={t('adm.gift.decrease')}
              increaseLabel={t('adm.gift.increase')}
              data-testid="admin-gift-featured"
            />
          )}
        </Field>
      </div>
      <Field label={t('adm.gift.note')}>
        {(props) => <Input {...props} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="admin-gift-note" />}
      </Field>
      <Button className="w-full gap-1.5" loading={busy} disabled={!ok} onClick={() => void give()} data-testid="admin-gift-give">
        <Gift aria-hidden className="h-4 w-4" />
        {t('adm.gift.give')}
      </Button>
    </Card>
  );
}
