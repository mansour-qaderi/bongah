'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CornerUpLeft, MessageSquareText } from 'lucide-react';
import { FEEDBACK_MAX_LENGTH, type AdminFeedbackItem, type AdminFeedbackReplyResult, type FeedbackCategory } from '@bongah/shared-types';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { toPersianDigits } from '@/lib/persian-input';
import { useT } from '@/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field, Textarea } from '@/components/ui/field';
import { CardListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPage, Pager, PersonCell, SearchBox, useAdminList, useDebounced } from './admin-kit';

type Filter = 'ALL' | FeedbackCategory;
const FILTERS: Filter[] = ['ALL', 'SUGGESTION', 'PROBLEM', 'PRAISE', 'OTHER'];
const TONE = { SUGGESTION: 'info', PROBLEM: 'danger', PRAISE: 'primary', OTHER: 'neutral' } as const;
const MIN_REPLY = 2;

/** The messages people send from the app's feedback form, newest first. */
export function AdminFeedback() {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, filter]);
  const list = useAdminList<AdminFeedbackItem>('admin/feedback', { q, category: filter === 'ALL' ? undefined : filter }, page);
  const data = list.data;
  const [replying, setReplying] = useState<AdminFeedbackItem | null>(null);

  return (
    <AdminPage title={t('adm.fb.title')} subtitle={t('adm.fb.subtitle')}>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === 'ALL' ? t('adm.all') : t(`adm.fb.cat.${f}` as 'adm.fb.cat.OTHER')}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchBox value={search} onChange={setSearch} placeholder={t('adm.fb.searchHint')} testId="admin-fb-search" />
      </div>

      {!data && !list.error ? (
        <CardListSkeleton rows={4} />
      ) : list.error && !data ? (
        <Card>
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.mutate()} />
        </Card>
      ) : !data || data.data.length === 0 ? (
        <Card>
          <EmptyState compact icon={MessageSquareText} title={q || filter !== 'ALL' ? t('adm.empty') : t('adm.fb.empty')} />
        </Card>
      ) : (
        <>
          <ul className="space-y-3" data-testid="admin-fb-list">
            {data.data.map((m) => (
              <li key={m.id}>
                <Card className="p-4" data-testid="admin-fb-item">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <PersonCell person={m.user} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[m.category]}>{t(`adm.fb.cat.${m.category}` as 'adm.fb.cat.OTHER')}</Badge>
                      {m.app_version ? <span className="ltr tabular text-xs text-muted">{t('adm.fb.version', { version: toPersianDigits(m.app_version) })}</span> : null}
                      <span className="tabular text-xs text-muted">{formatDateTime(m.created_at)}</span>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-7 text-ink">{m.message}</p>
                  {m.reply ? (
                    <div className="mt-3 rounded-xl bg-primary-tint p-3" data-testid="admin-fb-reply-text">
                      <p className="text-xs font-semibold text-primary">{t('adm.fb.replied', { date: formatDateTime(m.reply.replied_at) })}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-7 text-ink">{m.reply.message}</p>
                    </div>
                  ) : null}
                  <div className="mt-3 flex justify-end">
                    <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setReplying(m)} data-testid="admin-fb-reply">
                      <CornerUpLeft aria-hidden className="h-4 w-4" />
                      {m.reply ? t('adm.fb.replyAgain') : t('adm.fb.reply')}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Pager page={page} totalPages={data.meta.total_pages} onPage={setPage} />
        </>
      )}
      <ReplyDialog
        item={replying}
        onClose={() => setReplying(null)}
        onSent={() => {
          setReplying(null);
          void list.mutate();
        }}
      />
    </AdminPage>
  );
}

/** Writes back to the person who sent a message: the team's answer is kept, pushed to their phones and shown in their app. */
function ReplyDialog({ item, onClose, onSent }: { item: AdminFeedbackItem | null; onClose: () => void; onSent: () => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (item) setText(item.reply?.message ?? '');
  }, [item]);
  const ok = text.trim().length >= MIN_REPLY;

  async function send() {
    if (!item || !ok) return;
    setBusy(true);
    try {
      const result = await api.post<AdminFeedbackReplyResult>(`admin/feedback/${item.id}/reply`, { message: text.trim() });
      toast.success(t(result.notified ? 'adm.fb.replySent' : 'adm.fb.replySaved'));
      onSent();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => !next && !busy && onClose()}
      title={t('adm.fb.replyTitle', { name: item?.user.full_name ?? '—' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!ok} onClick={() => void send()} data-testid="admin-fb-reply-send">
            {t('adm.fb.replySend')}
          </Button>
        </>
      }
    >
      {item ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-soft p-3">
            <p className="text-xs font-semibold text-muted">{t('adm.fb.original')}</p>
            <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-ink-2">{item.message}</p>
          </div>
          <Field label={t('adm.fb.replyLabel')} hint={`${formatNumber(text.length)} / ${formatNumber(FEEDBACK_MAX_LENGTH)}`}>
            {(props) => (
              <Textarea {...props} value={text} maxLength={FEEDBACK_MAX_LENGTH} placeholder={t('adm.fb.replyPlaceholder')} onChange={(e) => setText(e.target.value)} data-testid="admin-fb-reply-input" />
            )}
          </Field>
        </div>
      ) : null}
    </Dialog>
  );
}
