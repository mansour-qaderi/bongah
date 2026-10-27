'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Property, PropertyStatus } from '@bongah/shared-types';
import { errorMessage } from '@/lib/api';
import { patchCachedListings, refreshListingData, updateListing } from '@/lib/listing-actions';
import { tNow } from '@/i18n/active';
import { useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';

const TONE = { ACTIVE: 'primary', SOLD: 'gold', ARCHIVED: 'neutral' } as const;

export function StatusBadge({ status }: { status: PropertyStatus }) {
  const labels = useLabels();
  return <Badge tone={TONE[status]}>{labels.status[status]}</Badge>;
}

/** Sets a listing's status from anywhere in the panel; the lists change at once and are re-read afterwards. */
export function useStatusChange() {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  async function change(listing: Pick<Property, 'id' | 'status' | 'title'>, status: PropertyStatus) {
    if (pending.has(listing.id)) return;
    setPending((p) => new Set(p).add(listing.id));
    await patchCachedListings(new Set([listing.id]), { status });
    try {
      await updateListing(listing.id, { status });
      toast.success(tNow(`status.toast.${status}`));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      await refreshListingData(); // also puts the old status back when the change failed
      setPending((p) => {
        const next = new Set(p);
        next.delete(listing.id);
        return next;
      });
    }
  }
  return { change, isPending: (id: string) => pending.has(id) };
}

function Chip({
  children,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'gold';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-50',
        tone === 'neutral' && 'border-line-strong text-ink-2 hover:border-ink-2',
        tone === 'primary' && 'border-primary text-primary hover:bg-primary-tint',
        tone === 'gold' && 'border-accent text-accent-text hover:bg-accent-tint',
      )}
    >
      {children}
    </button>
  );
}

/** The inline actions of one row: "sold" and "inactive" for a live listing, "activate" for the others. */
export function StatusActions({
  listing,
  change,
  busy,
}: {
  listing: Pick<Property, 'id' | 'status' | 'title'>;
  change: (listing: Pick<Property, 'id' | 'status' | 'title'>, status: PropertyStatus) => void;
  busy: boolean;
}) {
  const t = useT();
  const labels = useLabels();
  return (
    <div className="flex items-center gap-1.5">
      {listing.status === 'ACTIVE' ? (
        <>
          <Chip tone="gold" disabled={busy} onClick={() => change(listing, 'SOLD')}>
            {labels.status.SOLD}
          </Chip>
          <Chip disabled={busy} onClick={() => change(listing, 'ARCHIVED')}>
            {labels.status.ARCHIVED}
          </Chip>
        </>
      ) : (
        <>
          <Chip tone="primary" disabled={busy} onClick={() => change(listing, 'ACTIVE')}>
            {t('status.activate')}
          </Chip>
          {listing.status === 'SOLD' ? (
            <Chip disabled={busy} onClick={() => change(listing, 'ARCHIVED')}>
              {labels.status.ARCHIVED}
            </Chip>
          ) : null}
        </>
      )}
    </div>
  );
}
