'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BellRing, MessageCircleHeart, Pencil, Plus, Trash2 } from 'lucide-react';
import { QUOTE_MAX_LENGTH, type DailyQuote, type Language, type MorningPushDay, type QuoteCategory, type TestPushResult } from '@bongah/shared-types';
import { api, errorMessage, fetcher } from '@/lib/api';
import { LANGUAGE_META } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field, Select, Switch, Textarea } from '@/components/ui/field';
import { CardListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPage, Pager, useAdminList } from './admin-kit';

// The morning message comes first (on the right, in a right-to-left page) and is the tab shown on arrival.
const CATEGORIES: QuoteCategory[] = ['MORNING_NOTIFICATION', 'WELCOME_ONBOARDING'];
const LANGS: Language[] = ['prs', 'ps'];

/**
 * The daily greetings: the texts of the welcome card (shown once to a new person) and of the morning notification (sent
 * every day), in Dari and Pashto, each of which can be switched off without deleting it; and how the last 14 mornings went.
 */
export function AdminGreetings() {
  const t = useT();
  const [category, setCategory] = useState<QuoteCategory>(CATEGORIES[0]!);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [category]);
  const list = useAdminList<DailyQuote>('admin/quotes', { category }, page);
  const [editing, setEditing] = useState<DailyQuote | 'new' | null>(null);
  const [removing, setRemoving] = useState<DailyQuote | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(q: DailyQuote) {
    try {
      await api.patch(`admin/quotes/${q.id}`, { is_active: !q.is_active });
      await list.mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`admin/quotes/${removing.id}`);
      toast.success(t('adm.gr.deleted'));
      setRemoving(null);
      await list.mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const data = list.data;
  return (
    <AdminPage title={t('adm.gr.title')} subtitle={t('adm.gr.subtitle')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={category} onValueChange={(v) => setCategory(v as QuoteCategory)}>
          <TabsList>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c} value={c}>
                {t(`adm.gr.cat.${c}` as 'adm.gr.cat.WELCOME_ONBOARDING')}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button className="gap-1.5" onClick={() => setEditing('new')} data-testid="admin-gr-add">
          <Plus aria-hidden className="h-4 w-4" />
          {t('adm.gr.add')}
        </Button>
      </div>

      {!data && !list.error ? (
        <CardListSkeleton rows={3} />
      ) : list.error && !data ? (
        <Card>
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.mutate()} />
        </Card>
      ) : !data || data.data.length === 0 ? (
        <Card>
          <EmptyState compact icon={MessageCircleHeart} title={t('adm.gr.empty')} />
        </Card>
      ) : (
        <>
          <ul className="space-y-3" data-testid="admin-gr-list">
            {data.data.map((q) => (
              <li key={q.id}>
                <Card className="flex flex-wrap items-start gap-3 p-4" data-testid="admin-gr-item">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[14px] leading-7 text-ink">{q.text}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="neutral">{LANGUAGE_META[q.language].nativeName}</Badge>
                    <Badge tone={q.is_active ? 'primary' : 'neutral'}>{q.is_active ? t('adm.gr.active') : t('adm.gr.inactive')}</Badge>
                    <Switch checked={q.is_active} onChange={() => void toggle(q)} label={t('adm.gr.active')} />
                    <Button size="icon" variant="secondary" aria-label={t('adm.gr.edit')} onClick={() => setEditing(q)} data-testid="admin-gr-edit">
                      <Pencil aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="danger" aria-label={t('adm.ls.remove')} onClick={() => setRemoving(q)} data-testid="admin-gr-delete">
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Pager page={page} totalPages={data.meta.total_pages} onPage={setPage} />
        </>
      )}

      <MorningStats />

      <QuoteDialog
        quote={editing}
        defaultCategory={category}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void list.mutate();
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && !busy && setRemoving(null)}
        title={t('adm.gr.confirmDelete')}
        description={removing?.text ?? ''}
        confirmLabel={t('adm.ls.remove')}
        loading={busy}
        onConfirm={() => void remove()}
      />
    </AdminPage>
  );
}

function QuoteDialog({
  quote,
  defaultCategory,
  onClose,
  onSaved,
}: {
  quote: DailyQuote | 'new' | null;
  defaultCategory: QuoteCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const existing = quote && quote !== 'new' ? quote : null;
  const [text, setText] = useState('');
  const [category, setCategory] = useState<QuoteCategory>(defaultCategory);
  const [language, setLanguage] = useState<Language>('prs');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!quote) return;
    setText(existing?.text ?? '');
    setCategory(existing?.category ?? defaultCategory);
    setLanguage(existing?.language ?? 'prs');
    setActive(existing?.is_active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh form per opened quote, not per keystroke
  }, [quote]);

  const ok = text.trim().length >= 3;
  async function save() {
    setBusy(true);
    try {
      const body = { text: text.trim(), category, language, is_active: active };
      if (existing) await api.patch(`admin/quotes/${existing.id}`, body);
      else await api.post('admin/quotes', body);
      toast.success(t('adm.gr.saved'));
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={quote !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
      title={existing ? t('adm.gr.edit') : t('adm.gr.add')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!ok} onClick={() => void save()} data-testid="admin-gr-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('adm.gr.text')} hint={`${formatNumber(text.length)} / ${formatNumber(QUOTE_MAX_LENGTH)}`}>
          {(props) => <Textarea {...props} value={text} maxLength={QUOTE_MAX_LENGTH} onChange={(e) => setText(e.target.value)} className="min-h-28" data-testid="admin-gr-text" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('adm.gr.category')}>
            {(props) => (
              <Select {...props} value={category} onChange={(e) => setCategory(e.target.value as QuoteCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`adm.gr.cat.${c}` as 'adm.gr.cat.WELCOME_ONBOARDING')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('adm.gr.language')}>
            {(props) => (
              <Select {...props} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_META[l].nativeName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
          <span className="text-[13px] font-semibold text-ink-2">{t('adm.gr.active')}</span>
          <Switch checked={active} onChange={setActive} label={t('adm.gr.active')} />
        </div>
      </div>
    </Dialog>
  );
}

function MorningStats() {
  const t = useT();
  const stats = useSWR<MorningPushDay[]>('admin/notifications/morning', fetcher, { refreshInterval: 60_000 });
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    try {
      const r = await api.post<TestPushResult>('admin/notifications/test');
      toast.success(t('adm.gr.testDone', { delivered: formatNumber(r.delivered), devices: formatNumber(r.devices) }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('adm.gr.morning')}
        action={
          <Button size="sm" variant="secondary" className="gap-1.5" loading={busy} onClick={() => void test()} data-testid="admin-gr-test">
            <BellRing aria-hidden className="h-4 w-4" />
            {t('adm.gr.test')}
          </Button>
        }
      />
      <div className="overflow-x-auto p-5 pt-3">
        {stats.error && !stats.data ? (
          <ErrorState message={errorMessage(stats.error)} onRetry={() => void stats.mutate()} />
        ) : (
          <table className="w-full min-w-[26rem] text-[13px]" data-testid="admin-gr-stats">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 pe-3 text-start font-semibold">{t('adm.gr.day')}</th>
                <th className="py-2 pe-3 text-start font-semibold">{t('adm.gr.claimed')}</th>
                <th className="py-2 pe-3 text-start font-semibold">{t('adm.gr.sent')}</th>
                <th className="py-2 text-start font-semibold">{t('adm.gr.failed')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(stats.data ?? []).map((d) => (
                <tr key={d.day}>
                  <td className="ltr tabular py-2 pe-3 text-start">{d.day}</td>
                  <td className="tabular py-2 pe-3">{formatNumber(d.claimed)}</td>
                  <td className="tabular py-2 pe-3">{formatNumber(d.sent)}</td>
                  <td className={d.failed > 0 ? 'tabular py-2 font-semibold text-danger' : 'tabular py-2'}>{formatNumber(d.failed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
