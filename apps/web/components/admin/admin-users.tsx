'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Gift, Inbox } from 'lucide-react';
import type { AdminUserItem, Role } from '@bongah/shared-types';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useT } from '@/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPage, Pager, PersonCell, ReasonDialog, SearchBox, useAdminList, useDebounced } from './admin-kit';

type Filter = 'ALL' | Role | 'BANNED';
const FILTERS: Filter[] = ['ALL', 'USER', 'AGENCY', 'ADMIN', 'BANNED'];

/** Every account: find one by name or phone, close or open it (with a reason), and send it to the gift page. */
export function AdminUsers() {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, filter]);
  const list = useAdminList<AdminUserItem>(
    'admin/users',
    { q, role: filter === 'ALL' || filter === 'BANNED' ? undefined : filter, banned: filter === 'BANNED' },
    page,
  );
  const [ban, setBan] = useState<AdminUserItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      setBan(null);
      await list.mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const data = list.data;
  return (
    <AdminPage title={t('adm.us.title')} subtitle={t('adm.us.subtitle')}>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === 'ALL' ? t('adm.all') : f === 'BANNED' ? t('adm.us.bannedOnly') : t(`adm.role.${f}` as 'adm.role.USER')}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchBox value={search} onChange={setSearch} placeholder={t('adm.us.searchHint')} testId="admin-us-search" />
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
              <table className="w-full min-w-[48rem] text-[13px]" data-testid="admin-us-table">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.person')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.role')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.credits')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.col.date')}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.data.map((u) => {
                    const banned = Boolean(u.banned_at);
                    return (
                      <tr key={u.id} data-testid="admin-us-row">
                        <td className="py-2.5 pe-3">
                          <PersonCell person={u} extra={banned && u.ban_reason ? <div className="max-w-[14rem] truncate text-xs text-danger">{u.ban_reason}</div> : null} />
                        </td>
                        <td className="py-2.5 pe-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge tone={u.role === 'ADMIN' ? 'gold' : u.role === 'AGENCY' ? 'info' : 'neutral'}>{t(`adm.role.${u.role}` as 'adm.role.USER')}</Badge>
                            {banned ? <Badge tone="danger">{t('adm.us.banned')}</Badge> : null}
                          </div>
                          {u.agency ? <div className="mt-1 max-w-[12rem] truncate text-xs text-muted">{u.agency.agency_name}</div> : null}
                        </td>
                        <td className="tabular py-2.5 pe-3 text-xs text-ink-2">
                          {t('adm.us.credits', { listings: formatNumber(u.listing_credits), featured: formatNumber(u.featured_credits) })}
                        </td>
                        <td className="tabular py-2.5 pe-3 text-xs text-muted">
                          {u.last_login_at ? t('adm.us.lastLogin', { date: formatDateTime(u.last_login_at) }) : t('adm.us.neverLogin')}
                        </td>
                        <td className="py-2.5 text-end">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Link
                              href={`/dashboard/admin/gifts?user=${u.id}`}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-[13px] font-semibold text-ink-2 hover:border-primary hover:text-primary"
                            >
                              <Gift aria-hidden className="h-3.5 w-3.5" />
                              {t('adm.us.gift')}
                            </Link>
                            {u.role === 'ADMIN' ? null : banned ? (
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api.post(`admin/users/${u.id}/unban`), t('adm.us.unbanDone'))} data-testid="admin-us-unban">
                                {t('adm.us.unban')}
                              </Button>
                            ) : (
                              <Button size="sm" variant="danger" disabled={busy} onClick={() => setBan(u)} data-testid="admin-us-ban">
                                {t('adm.us.ban')}
                              </Button>
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

      <ReasonDialog
        open={ban !== null}
        title={t('adm.us.banTitle')}
        text={t('adm.us.banText')}
        confirmLabel={t('adm.us.ban')}
        busy={busy}
        onClose={() => setBan(null)}
        onSubmit={(reason) => ban && void run(() => api.post(`admin/users/${ban.id}/ban`, { reason }), t('adm.us.banDone'))}
      />
    </AdminPage>
  );
}
