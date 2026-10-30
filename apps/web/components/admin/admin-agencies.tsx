'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Inbox } from 'lucide-react';
import type { AdminAgencyItem, AgencyVerificationStatus } from '@bongah/shared-types';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPage, Pager, PersonCell, ReasonDialog, SearchBox, useAdminList, useDebounced } from './admin-kit';

type Filter = 'ALL' | AgencyVerificationStatus;
const FILTERS: Filter[] = ['ALL', 'PENDING', 'VERIFIED', 'REJECTED'];
const TONE = { PENDING: 'gold', VERIFIED: 'primary', REJECTED: 'danger' } as const;

/** The real estate offices (رهنمای معاملات): their documents, and the decision to verify or refuse them. */
export function AdminAgencies() {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, filter]);
  const list = useAdminList<AdminAgencyItem>('admin/agencies', { q, status: filter === 'ALL' ? undefined : filter }, page);
  const [reject, setReject] = useState<AdminAgencyItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function review(agency: AdminAgencyItem, body: { status: 'VERIFIED' } | { status: 'REJECTED'; reason: string }, done: string) {
    setBusy(true);
    try {
      await api.put(`admin/agencies/${agency.id}/verification`, body);
      toast.success(done);
      setReject(null);
      await list.mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const data = list.data;
  return (
    <AdminPage title={t('adm.ag.title')} subtitle={t('adm.ag.subtitle')}>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === 'ALL' ? t('adm.all') : t(`adm.ag.status.${f}` as 'adm.ag.status.PENDING')}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchBox value={search} onChange={setSearch} placeholder={t('adm.ag.searchHint')} testId="admin-ag-search" />
      </div>

      <Card className="p-5">
        {!data && !list.error ? (
          <TableRowsSkeleton rows={5} cols={5} />
        ) : list.error && !data ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.mutate()} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState compact icon={Inbox} title={t('adm.empty')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-[13px]" data-testid="admin-ag-table">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.ag.title')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.owner')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.status')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.date')}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.data.map((a) => (
                    <tr key={a.id} data-testid="admin-ag-row">
                      <td className="max-w-[16rem] py-2.5 pe-3">
                        <div className="truncate font-semibold text-ink">{a.agency_name}</div>
                        <div className="truncate text-xs text-muted">{a.address}</div>
                        {a.license_photo ? (
                          <a href={a.license_photo} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">
                            {t('adm.ag.license')}
                          </a>
                        ) : null}
                      </td>
                      <td className="py-2.5 pe-3">
                        <PersonCell person={a.owner} />
                      </td>
                      <td className="py-2.5 pe-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={TONE[a.verification_status]}>{t(`adm.ag.status.${a.verification_status}` as 'adm.ag.status.PENDING')}</Badge>
                          <Badge tone={a.subscription_active ? 'info' : 'neutral'}>{a.subscription_active ? t('adm.ag.subActive') : t('adm.ag.noSub')}</Badge>
                        </div>
                        {a.verification_status === 'REJECTED' && a.rejection_reason ? (
                          <div className="mt-1 max-w-[14rem] truncate text-xs text-muted">{t('adm.ag.rejectedBecause', { reason: a.rejection_reason })}</div>
                        ) : null}
                      </td>
                      <td className="tabular py-2.5 pe-3 text-xs text-muted">{formatDateTime(a.created_at)}</td>
                      <td className="py-2.5 text-end">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {a.verification_status !== 'VERIFIED' ? (
                            <Button size="sm" disabled={busy} onClick={() => void review(a, { status: 'VERIFIED' }, t('adm.ag.approveDone'))} data-testid="admin-ag-approve">
                              {t('adm.ag.approve')}
                            </Button>
                          ) : null}
                          {a.verification_status !== 'REJECTED' ? (
                            <Button size="sm" variant="danger" disabled={busy} onClick={() => setReject(a)} data-testid="admin-ag-reject">
                              {t('adm.ag.reject')}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={data.meta.total_pages} onPage={setPage} />
          </>
        )}
      </Card>

      <ReasonDialog
        open={reject !== null}
        title={t('adm.ag.rejectTitle')}
        text={reject?.agency_name ?? ''}
        confirmLabel={t('adm.ag.reject')}
        busy={busy}
        onClose={() => setReject(null)}
        onSubmit={(reason) => reject && void review(reject, { status: 'REJECTED', reason }, t('adm.ag.rejectDone'))}
      />
    </AdminPage>
  );
}
