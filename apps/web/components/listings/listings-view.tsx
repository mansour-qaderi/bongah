'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, FilePlus2, Frame, MapPin, MoreHorizontal, Pencil, SearchX, Star, Trash2 } from 'lucide-react';
import { moneyAmount } from '@bongah/validation';
import type { Paginated, Property, PropertyStatus } from '@bongah/shared-types';
import { errorMessage, fetcher } from '@/lib/api';
import { formatNumber, formatShortDate, parseLooseNumber } from '@/lib/format';
import { tNow } from '@/i18n/active';
import { useLanguage, useT } from '@/i18n/provider';
import { provinceNameLabel } from '@/lib/provinces';
import { useLabels } from '@/i18n/use-labels';
import {
  applyFeatured,
  archiveMany,
  fetchAllListings,
  patchCachedListings,
  refreshListingData,
  updateListing,
  updateMany,
  type BulkOutcome,
  type FeaturedSource,
} from '@/lib/listing-actions';
import { DEFAULT_TAB, PAGE_SIZE, STATUS_TABS, useListingQuery, type StatusTab } from '@/hooks/use-listing-query';
import { SYNC_INTERVAL_MS } from '@/hooks/use-api';
import { cn } from '@/lib/cn';
import { deleteListing, useDeletedListings } from '@/lib/deleted-listings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Checkbox } from '@/components/ui/field';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BulkBar } from './bulk-bar';
import { EditListingDialog } from './edit-listing-dialog';
import { FeaturedDialog } from './featured-dialog';
import { ListingFilters } from './filters';
import { InlineEdit } from './inline-edit';
import { PriceTermsTag } from './price-terms-tag';
import { listingPrice } from '@/lib/price';
import { ProgressDialog, type RunState } from './progress-dialog';
import { StatusActions, StatusBadge, useStatusChange } from './status-toggle';


function DealBadge({ deal }: { deal: Property['deal_type'] }) {
  const labels = useLabels();
  return <Badge tone={deal === 'SALE' ? 'primary' : deal === 'RENT' ? 'info' : 'gold'}>{labels.deal[deal]}</Badge>;
}

export function ListingsView() {
  const t = useT();
  const { language } = useLanguage();
  const labels = useLabels();
  const { query, update, reset, apiQuery, activeFilters } = useListingQuery();
  const swrKey = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries({ ...apiQuery, page: query.page, limit: PAGE_SIZE }).forEach(([k, v]) => v !== undefined && p.set(k, String(v)));
    return `properties/mine?${p.toString()}`;
  }, [apiQuery, query.page]);

  const { data, error, isValidating, mutate } = useSWR<Paginated<Property>>(swrKey, fetcher, {
    refreshInterval: SYNC_INTERVAL_MS,
    keepPreviousData: true,
    revalidateOnFocus: true,
  });
  const { change, isPending } = useStatusChange();
  const router = useRouter();

  // Selection survives page changes and filters: the whole listing is kept, so bulk actions know each one's state.
  const [selected, setSelected] = useState<ReadonlyMap<string, Property>>(new Map());
  const [loadingAll, setLoadingAll] = useState(false);
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive'>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [rowFeatured, setRowFeatured] = useState<Property | null>(null);
  const [editing, setEditing] = useState<Property | null>(null);
  const [deleting, setDeleting] = useState<Property | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const deleted = useDeletedListings();

  // A listing deleted in this browser stays out of the table (the server only archives it; see lib/deleted-listings).
  const rows = useMemo(() => (data?.data ?? []).filter((p) => !deleted.includes(p.id)), [data, deleted]);
  const total = data?.meta.total ?? 0;
  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pageSomeSelected = rows.some((r) => selected.has(r.id));

  const toggleOne = useCallback((p: Property, on: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(p.id, p);
      else next.delete(p.id);
      return next;
    });
  }, []);

  function togglePage(on: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      rows.forEach((r) => (on ? next.set(r.id, r) : next.delete(r.id)));
      return next;
    });
  }

  async function selectEverything() {
    setLoadingAll(true);
    try {
      const all = await fetchAllListings(apiQuery);
      setSelected(new Map(all.map((p) => [p.id, p])));
      if (all.length < total) toast.info(tNow('list.selectedAll', { n: formatNumber(all.length) }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingAll(false);
    }
  }

  // ── Inline edits ──
  const saveField = useCallback(async (p: Property, patch: { title?: string; price?: number }) => {
    await patchCachedListings(new Set([p.id]), patch);
    try {
      await updateListing(p.id, patch);
      toast.success(tNow('common.saved'));
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    } finally {
      await refreshListingData();
    }
  }, []);

  // ── Bulk actions ──
  async function execute(
    title: string,
    items: Property[],
    job: (ids: string[], onProgress: (done: number, total: number) => void) => Promise<BulkOutcome>,
    optimistic?: Partial<Property>,
  ) {
    const titles = new Map(items.map((p) => [p.id, p.title]));
    const ids = items.map((p) => p.id);
    setRun({ title, done: 0, total: ids.length, titles });
    if (optimistic) await patchCachedListings(new Set(ids), optimistic);
    let outcome: BulkOutcome;
    try {
      outcome = await job(ids, (done, totalCount) => setRun((r) => (r ? { ...r, done, total: totalCount } : r)));
    } catch (e) {
      outcome = { succeeded: [], failed: ids.map((id) => ({ id, message: errorMessage(e) })) };
    }
    setRun((r) => (r ? { ...r, done: r.total, outcome } : r));
    setSelected((prev) => {
      const next = new Map(prev);
      outcome.succeeded.forEach((id) => next.delete(id));
      return next;
    });
    await refreshListingData();
  }

  const selectedList = [...selected.values()];
  const featuredEligible = selectedList.filter((p) => p.status === 'ACTIVE' && !p.is_featured);

  function bulkStatus(status: PropertyStatus, label: string, skipIf: PropertyStatus) {
    const items = selectedList.filter((p) => p.status !== skipIf);
    if (items.length === 0) {
      toast.info(tNow('list.alreadyInStatus'));
      return;
    }
    void execute(label, items, (ids, progress) => updateMany(ids, { status }, progress), { status });
  }

  const columns = useMemo<ColumnDef<Property>[]>(
    () => [
      {
        id: 'select',
        header: () => <Checkbox label={t('list.col.selectPage')} checked={pageAllSelected} indeterminate={pageSomeSelected} onChange={togglePage} />,
        cell: ({ row }) => (
          <Checkbox label={t('list.col.selectOne', { title: row.original.title })} checked={selected.has(row.original.id)} onChange={(on) => toggleOne(row.original, on)} />
        ),
        size: 44,
      },
      {
        id: 'listing',
        header: t('list.col.listing'),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="min-w-0 max-w-[26rem]">
              <InlineEdit
                label={t('list.col.titleLabel')}
                value={p.title}
                display={<span className="block truncate text-sm font-semibold text-ink">{p.title}</span>}
                validate={(d) => (d.trim().length < 3 ? t('list.col.titleShort') : d.trim().length > 150 ? t('list.col.titleLong') : null)}
                onSave={(d) => saveField(p, { title: d.replace(/\s+/g, ' ').trim() })}
              />
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <DealBadge deal={p.deal_type} />
                <span>{labels.type[p.type]}</span>
                <span aria-hidden>·</span>
                <span className="truncate">{[p.district, p.province ? provinceNameLabel(p.province, language) : ''].filter(Boolean).join('، ')}</span>
                {p.is_featured ? (
                  <Badge tone="gold" className="gap-1">
                    <Star aria-hidden className="h-3 w-3" fill="currentColor" />
                    {t('list.col.featured')}
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: 'price',
        header: t('list.col.price'),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <InlineEdit
              label={t('list.col.price')}
              value={String(p.price)}
              inputMode="decimal"
              ltr
              inputClassName="w-36"
              display={
                <span className="flex flex-col items-start gap-0.5">
                  <span className="tabular whitespace-nowrap text-sm font-semibold text-ink-2">{listingPrice(p)}</span>
                  <PriceTermsTag terms={p.price_terms} market={p.market} />
                </span>
              }
              validate={(d) => {
                const n = parseLooseNumber(d);
                if (n === null || n <= 0) return t('list.col.priceNumber');
                return moneyAmount.safeParse(n).success ? null : t('list.col.priceInvalid');
              }}
              onSave={(d) => saveField(p, { price: parseLooseNumber(d)! })}
            />
          );
        },
      },
      {
        id: 'views',
        header: t('list.col.views'),
        cell: ({ row }) => (
          <span className="tabular flex items-center gap-1 text-[13px] text-ink-2">
            <Eye aria-hidden className="h-3.5 w-3.5 text-muted" />
            {formatNumber(row.original.view_count ?? 0)}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('list.col.status'),
        cell: ({ row }) => (
          <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
            <StatusBadge status={row.original.status} />
            <StatusActions listing={row.original} change={change} busy={isPending(row.original.id)} />
          </div>
        ),
      },
      {
        id: 'date',
        header: t('list.col.created'),
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{formatShortDate(row.original.created_at)}</span>,
      },
      {
        id: 'menu',
        header: () => <span className="sr-only">{t('list.col.more')}</span>,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <DropdownRoot>
              <DropdownTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('list.col.options', { title: p.title })}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownTrigger>
              <DropdownContent align="start">
                <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setEditing(p)}>
                  {t('list.menu.edit')}
                </DropdownItem>
                <DropdownItem icon={<MapPin className="h-4 w-4" />} onSelect={() => router.push(`/dashboard/map?focus=${p.id}`)}>
                  {t('list.menu.map')}
                </DropdownItem>
                <DropdownItem
                  icon={<Frame className="h-4 w-4" />}
                  disabled={p.status !== 'ACTIVE' || p.is_featured}
                  onSelect={() => setRowFeatured(p)}
                >
                  {t('list.menu.featured')}
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem disabled={p.status === 'ARCHIVED'} onSelect={() => void change(p, 'ARCHIVED')}>
                  {t('list.menu.archive')}
                </DropdownItem>
                <DropdownItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => setDeleting(p)}>
                  {t('list.menu.delete')}
                </DropdownItem>
              </DropdownContent>
            </DropdownRoot>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, pageAllSelected, pageSomeSelected, rows, change, isPending, saveField, toggleOne, router, t],
  );

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id, manualPagination: true });

  const sortIcon = (asc: 'price_asc' | 'oldest', desc: 'price_desc' | 'newest') =>
    query.sort === asc ? <ArrowUp className="h-3 w-3" /> : query.sort === desc ? <ArrowDown className="h-3 w-3" /> : null;

  const pages = data?.meta.total_pages ?? 1;
  const firstLoad = !data && !error;
  const noResults = !firstLoad && !error && rows.length === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">{t('list.title')}</h2>
          <p className="text-[13px] text-muted">{t('list.subtitle')}</p>
        </div>
        <Link href="/dashboard/listings/quick-add">
          <Button variant="secondary" className="gap-2">
            <FilePlus2 aria-hidden className="h-4 w-4" />
            {t('nav.quickAdd')}
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 pt-4 sm:px-5">
          <Tabs value={query.tab} onValueChange={(v) => update({ tab: v as StatusTab })}>
            <TabsList className="max-w-full overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} count={tab === query.tab && data ? formatNumber(total) : undefined}>
                  {t(`list.tab.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <ListingFilters query={query} update={update} reset={reset} activeFilters={activeFilters} />

        {firstLoad ? (
          <TableRowsSkeleton rows={8} cols={6} />
        ) : error && !data ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
        ) : noResults ? (
          activeFilters > 0 || query.tab !== DEFAULT_TAB ? (
            <EmptyState
              icon={SearchX}
              title={t('list.empty.filteredTitle')}
              description={t('list.empty.filteredText')}
              action={<Button variant="secondary" onClick={reset}>{t('filter.clear')}</Button>}
            />
          ) : (
            <EmptyState
              icon={FilePlus2}
              title={t('list.empty.title')}
              description={t('list.empty.text')}
              action={
                <Link href="/dashboard/listings/quick-add">
                  <Button>{t('list.empty.first')}</Button>
                </Link>
              }
            />
          )
        ) : (
          <div className={cn('overflow-x-auto transition-opacity', isValidating && 'opacity-80')}>
            <table className="w-full min-w-[56rem] text-start text-sm">
              <thead className="border-b border-line bg-soft/60 text-xs text-muted">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const sortable = h.id === 'price' || h.id === 'views' || h.id === 'date';
                      const toggle = () => {
                        if (h.id === 'price') update({ sort: query.sort === 'price_asc' ? 'price_desc' : 'price_asc' });
                        else if (h.id === 'views') update({ sort: 'views' });
                        else update({ sort: query.sort === 'newest' ? 'oldest' : 'newest' });
                      };
                      return (
                        <th key={h.id} scope="col" className="px-4 py-2.5 text-start font-semibold first:ps-5 last:pe-5" style={{ width: h.id === 'select' ? 44 : undefined }}>
                          {sortable ? (
                            <button onClick={toggle} className="flex items-center gap-1 hover:text-primary">
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {h.id === 'price' ? sortIcon('price_asc', 'price_desc') : h.id === 'views' ? (query.sort === 'views' ? <ArrowDown className="h-3 w-3" /> : null) : sortIcon('oldest', 'newest')}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-line">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className={cn('reveal align-top transition-colors hover:bg-soft/50', selected.has(row.id) && 'bg-primary-tint/50')}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 first:ps-5 last:pe-5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <BulkBar
          count={selected.size}
          total={total}
          allSelected={selected.size >= total && total > 0}
          loadingAll={loadingAll}
          onSelectAll={() => void selectEverything()}
          onClear={() => setSelected(new Map())}
          onFeatured={() => setFeaturedOpen(true)}
          onSold={() => bulkStatus('SOLD', t('list.run.markSold'), 'SOLD')}
          onActivate={() => bulkStatus('ACTIVE', t('list.run.activate'), 'ACTIVE')}
          onArchive={() => setConfirm('archive')}
        />

        {pages > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
            <span>
              {t('list.pagination', { page: formatNumber(query.page), pages: formatNumber(pages), total: formatNumber(total) })}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={query.page <= 1} onClick={() => update({ page: query.page - 1 })}>
                {t('pay.prev')}
              </Button>
              <Button variant="secondary" size="sm" disabled={query.page >= pages} onClick={() => update({ page: query.page + 1 })}>
                {t('pay.next')}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <FeaturedDialog
        open={featuredOpen || rowFeatured !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFeaturedOpen(false);
            setRowFeatured(null);
          }
        }}
        count={rowFeatured ? 1 : featuredEligible.length}
        skipped={rowFeatured ? 0 : selectedList.length - featuredEligible.length}
        onConfirm={(source: FeaturedSource) => {
          const items = rowFeatured ? [rowFeatured] : featuredEligible;
          setFeaturedOpen(false);
          setRowFeatured(null);
          void execute(t('bulk.featured'), items, (ids, progress) => applyFeatured(ids, source, progress));
        }}
      />

      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('list.confirm.title', { n: formatNumber(selected.size) })}
        description={t('list.confirm.text')}
        confirmLabel={t('list.confirm.button')}
        onConfirm={() => {
          const items = selectedList.filter((p) => p.status !== 'ARCHIVED');
          setConfirm(null);
          if (items.length) void execute(t('list.run.delete'), items, (ids, progress) => archiveMany(ids, progress), { status: 'ARCHIVED' });
          else toast.info(t('list.alreadyArchived'));
        }}
      />
      <ProgressDialog run={run} onClose={() => setRun(null)} />
      <EditListingDialog listing={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !deletingBusy && setDeleting(null)}
        title={t('list.delete.title')}
        description={deleting ? t('list.delete.text', { title: deleting.title }) : ''}
        confirmLabel={t('common.delete')}
        loading={deletingBusy}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          setDeletingBusy(true);
          deleteListing(target.id)
            .then(async () => {
              setSelected((prev) => {
                const next = new Map(prev);
                next.delete(target.id);
                return next;
              });
              toast.success(tNow('list.delete.done'));
              await refreshListingData();
            })
            .catch((e) => toast.error(errorMessage(e)))
            .finally(() => {
              setDeletingBusy(false);
              setDeleting(null);
            });
        }}
      />
    </div>
  );
}
