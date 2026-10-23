'use client';

import { CheckCheck, Frame, Handshake, Power, Trash2, X } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';

export function BulkBar({
  count,
  total,
  allSelected,
  loadingAll,
  onSelectAll,
  onClear,
  onFeatured,
  onSold,
  onActivate,
  onArchive,
}: {
  count: number;
  total: number;
  allSelected: boolean;
  loadingAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onFeatured: () => void;
  onSold: () => void;
  onActivate: () => void;
  onArchive: () => void;
}) {
  if (count === 0) return null;
  return (
    // Fixed to the window (the table card clips and scrolls, so a sticky bar inside it would never show).
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex justify-center">
      <div
        role="region"
        aria-label="کارهای گروهی"
        className="reveal pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-primary bg-surface px-4 py-3"
      >
        <span className="tabular me-1 text-sm font-bold text-primary">{formatNumber(count)} آگهی انتخاب شد</span>
        {!allSelected && total > count ? (
          <Button variant="ghost" size="sm" loading={loadingAll} onClick={onSelectAll} className="gap-1.5 text-primary">
            <CheckCheck aria-hidden className="h-4 w-4" />
            انتخاب هر {formatNumber(total)} نتیجه
          </Button>
        ) : null}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button variant="gold" size="sm" onClick={onFeatured} className="gap-1.5">
            <Frame aria-hidden className="h-4 w-4" />
            پوشش با کادر ویژه
          </Button>
          <Button variant="secondary" size="sm" onClick={onSold} className="gap-1.5">
            <Handshake aria-hidden className="h-4 w-4" />
            معامله شد
          </Button>
          <Button variant="secondary" size="sm" onClick={onActivate} className="gap-1.5">
            <Power aria-hidden className="h-4 w-4" />
            فعال‌سازی
          </Button>
          <Button variant="secondary" size="sm" onClick={onArchive} className="gap-1.5 text-danger hover:border-danger hover:text-danger">
            <Trash2 aria-hidden className="h-4 w-4" />
            حذف
          </Button>
          <Button variant="ghost" size="icon" onClick={onClear} aria-label="لغو انتخاب">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
