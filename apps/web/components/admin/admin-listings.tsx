'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Inbox, Star } from 'lucide-react';
import type { AdminPropertyItem } from '@bongah/shared-types';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { useT } from '@/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPage, Pager, PersonCell, ReasonDialog, SearchBox, useAdminList, useDebounced } from './admin-kit';

type Filter = 'all' | 'featured' | 'removed';

/**
 * Every listing of every account: find one, give it the featured badge for some days (or end it), take it down with a
 * reason the owner can be told, or put a taken-down one back. The API decides and records each action in the audit log.
 */
export function AdminListings() {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, filter]);

  const list = useAdminList<AdminPropertyItem>(
    'admin/properties',
    { q, featured: filter === 'featured', removed: filter === 'removed' },
    page,
  );
  const [feature, setFeature] = useState<AdminPropertyItem | null>(null);
  const [remove, setRemove] = useState<AdminPropertyItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      setFeature(null);
      setRemove(null);
      await list.mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const data = list.data;
  return (
    <AdminPage title={t('adm.ls.title')} subtitle={t('adm.ls.subtitle')}>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">{t('adm.all')}</TabsTrigger>
            <TabsTrigger value="featured">{t('adm.ls.featuredOnly')}</TabsTrigger>
            <TabsTrigger value="removed">{t('adm.ls.removedOnly')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchBox value={search} onChange={setSearch} placeholder={t('adm.ls.searchHint')} testId="admin-ls-search" />
      </div>

      <Card className="p-5">
        {!data && !list.error ? (
          <TableRowsSkeleton rows={6} cols={5} />
        ) : list.error && !data ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.mutate()} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState compact icon={Inbox} title={t('adm.empty')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-[13px]" data-testid="admin-ls-table">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.title')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.owner')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.amount')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.status')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.date')}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.data.map((p) => {
                    const removed = Boolean(p.removed_by_admin_at);
                    return (
                      <tr key={p.id} data-testid="admin-ls-row">
                        <td className="max-w-[16rem] py-2.5 pe-3">
                          <div className="truncate font-semibold text-ink">{p.title}</div>
                          <div className="tabular text-xs text-muted">{t('adm.ls.views', { count: formatNumber(p.view_count) })}</div>
                        </td>
                        <td className="py-2.5 pe-3">
                          <PersonCell person={p.owner} />
                        </td>
                        <td className="tabular py-2.5 pe-3 font-semibold text-ink">{formatMoney(p.price, p.currency)}</td>
                        <td className="py-2.5 pe-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge tone={p.status === 'ACTIVE' ? 'primary' : 'neutral'}>{t(`adm.ls.status.${p.status}` as 'adm.ls.status.ACTIVE')}</Badge>
                            {p.is_featured ? (
                              <Badge tone="gold" className="gap-1">
                                <Star aria-hidden className="h-3 w-3" />
                                {t('adm.ls.featured')}
                              </Badge>
                            ) : null}
                            {removed ? <Badge tone="danger">{t('adm.ls.removed')}</Badge> : null}
                          </div>
                          {removed && p.removal_reason ? <div className="mt-1 max-w-[14rem] truncate text-xs text-muted">{p.removal_reason}</div> : null}
                        </td>
                        <td className="tabular py-2.5 pe-3 text-xs text-muted">{formatDateTime(p.created_at)}</td>
                        <td className="py-2.5 text-end">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {removed ? (
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api.post(`admin/properties/${p.id}/restore`), t('adm.ls.restoreDone'))} data-testid="admin-ls-restore">
                                {t('adm.ls.restore')}
                              </Button>
                            ) : (
                              <>
                                {p.is_featured ? (
                                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api.delete(`admin/properties/${p.id}/feature`), t('adm.ls.unfeatureDone'))} data-testid="admin-ls-unfeature">
                                    {t('adm.ls.unfeature')}
                                  </Button>
                                ) : p.status === 'ACTIVE' ? (
                                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setFeature(p)} data-testid="admin-ls-feature">
                                    {t('adm.ls.feature')}
                                  </Button>
                                ) : null}
                                <Button size="sm" variant="danger" disabled={busy} onClick={() => setRemove(p)} data-testid="admin-ls-remove">
                                  {t('adm.ls.remove')}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={data.meta.total_pages} onPage={setPage} />
          </>
        )}
      </Card>

      <FeatureDialog
        property={feature}
        busy={busy}
        onClose={() => setFeature(null)}
        onSubmit={(days) => feature && void run(() => api.post(`admin/properties/${feature.id}/feature`, { days }), t('adm.ls.featureDone'))}
      />
      <ReasonDialog
        open={remove !== null}
        title={t('adm.ls.removeTitle')}
        text={t('adm.ls.removeText')}
        confirmLabel={t('adm.ls.remove')}
        busy={busy}
        onClose={() => setRemove(null)}
        onSubmit={(reason) => remove && void run(() => api.post(`admin/properties/${remove.id}/remove`, { reason }), t('adm.ls.removeDone'))}
      />
    </AdminPage>
  );
}

function FeatureDialog({ property, busy, onClose, onSubmit }: { property: AdminPropertyItem | null; busy: boolean; onClose: () => void; onSubmit: (days: number) => void }) {
  const t = useT();
  const [days, setDays] = useState('7');
  useEffect(() => {
    if (property) setDays('7');
  }, [property]);
  const n = Number(days);
  const ok = Number.isInteger(n) && n >= 1 && n <= 365;
  return (
    <Dialog
      open={property !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
      title={t('adm.ls.featureTitle')}
      description={property?.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!ok} onClick={() => onSubmit(n)} data-testid="admin-feature-confirm">
            {t('adm.confirm')}
          </Button>
        </>
      }
    >
      <Field label={t('adm.ls.featureDays')}>
        {(props) => <Input {...props} type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} data-testid="admin-feature-days" />}
      </Field>
    </Dialog>
  );
}
