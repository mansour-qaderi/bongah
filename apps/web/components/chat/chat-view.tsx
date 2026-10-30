'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { toast } from 'sonner';
import { ArrowRight, Bot, Check, CheckCheck, ImageIcon, MapPin, MessageSquare, Search, Send, Users } from 'lucide-react';
import type { ChatConversation, ChatMessage } from '@bongah/shared-types';
import { errorMessage } from '@/lib/api';
import { fetchOlder, inFilter, matchesQuery, markRead, sendText, sortConversations, threadKey, threadOrder, chatImageSrc, osmLink, CHAT_FILTERS, type ChatFilter } from '@/lib/chat';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { listingPrice } from '@/lib/price';
import { provinceNameLabel } from '@/lib/provinces';
import { useConversations, useThread } from '@/hooks/use-api';
import { useLanguage, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/field';
import { CardListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MAX_LENGTH = 2000;

const nameOf = (c: ChatConversation, fallback: string) => c.counterpart.name?.trim() || fallback;

/** The dashboard's chat: the people who wrote about my listings (customers), the chats I started, and the thread. */
export function ChatView() {
  const t = useT();
  const { data, error, mutate } = useConversations();
  const [filter, setFilter] = useState<ChatFilter>('ALL');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => sortConversations(data ?? []), [data]);
  const count = (f: ChatFilter) => all.filter((c) => inFilter(c, f)).length;
  const shown = all.filter((c) => inFilter(c, filter) && matchesQuery(c, query));
  const open = all.find((c) => c.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-ink">{t('chat.title')}</h2>
        <p className="text-[13px] text-muted">{t('chat.subtitle')}</p>
      </div>

      <Card className="grid h-[calc(100dvh-11rem)] min-h-[30rem] overflow-hidden md:grid-cols-[22rem_1fr]">
        {/* The inbox. On a phone it is the whole card until a chat is opened. */}
        <section aria-label={t('chat.inbox')} className={cn('flex min-h-0 flex-col border-line md:border-e', open && 'hidden md:flex')}>
          <div className="space-y-3 border-b border-line p-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as ChatFilter)}>
              <TabsList className="w-full max-w-full overflow-x-auto">
                {CHAT_FILTERS.map((f) => (
                  <TabsTrigger key={f} value={f} count={data ? formatNumber(count(f)) : undefined}>
                    {t(`chat.tab.${f}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input aria-label={t('chat.search')} placeholder={t('chat.search')} value={query} onChange={(e) => setQuery(e.target.value)} className="ps-9" />
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {!data && !error ? (
              <div className="p-3">
                <CardListSkeleton rows={5} />
              </div>
            ) : error && !data ? (
              <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
            ) : shown.length === 0 ? (
              <EmptyState
                compact
                icon={filter === 'CUSTOMERS' ? Users : MessageSquare}
                title={all.length === 0 ? t('chat.empty.title') : t('chat.empty.filtered')}
                description={all.length === 0 ? t('chat.empty.text') : undefined}
              />
            ) : (
              <ul className="divide-y divide-line">
                {shown.map((c) => (
                  <li key={c.id}>
                    <ConversationRow conversation={c} active={c.id === openId} onOpen={() => setOpenId(c.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* The thread. */}
        <section aria-label={t('chat.thread')} className={cn('flex min-h-0 flex-col', !open && 'hidden md:flex')}>
          {open ? (
            <Thread key={open.id} conversation={open} onBack={() => setOpenId(null)} />
          ) : (
            <EmptyState icon={MessageSquare} title={t('chat.pick.title')} description={t('chat.pick.text')} className="m-auto" />
          )}
        </section>
      </Card>
    </div>
  );
}

function ConversationRow({ conversation: c, active, onOpen }: { conversation: ChatConversation; active: boolean; onOpen: () => void }) {
  const t = useT();
  const last = c.last_message;
  const preview = !last ? t('chat.noMessages') : last.type === 'IMAGE' ? t('chat.image') : last.type === 'LOCATION' ? t('chat.location') : last.body ?? '';
  const stamp = c.last_message_at ?? c.created_at;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active || undefined}
      data-testid="chat-row"
      className={cn('flex w-full items-start gap-3 px-3 py-3 text-start transition-colors', active ? 'bg-primary-tint' : 'hover:bg-soft')}
    >
      <span aria-hidden className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft text-sm font-bold text-primary">
        {nameOf(c, '؟').slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[13px]', c.unread_count > 0 ? 'font-extrabold text-ink' : 'font-semibold text-ink')}>{nameOf(c, t('chat.unknown'))}</span>
          <span className="shrink-0 text-[11px] text-muted">{formatRelative(stamp)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">{c.property.title}</span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn('truncate text-xs', c.unread_count > 0 ? 'font-semibold text-ink-2' : 'text-muted')}>{preview}</span>
          {c.unread_count > 0 ? (
            <span aria-label={t('chat.unread', { n: formatNumber(c.unread_count) })} className="tabular grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
              {formatNumber(c.unread_count)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function Thread({ conversation: c, onBack }: { conversation: ChatConversation; onBack: () => void }) {
  const t = useT();
  const { language } = useLanguage();
  const { data, error, mutate } = useThread(c.id);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined); // undefined: follow the first page
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const messages = useMemo(() => threadOrder(older, data?.data ?? []), [older, data]);
  const nextCursor = cursor === undefined ? data?.next_cursor ?? null : cursor;
  const lastId = messages[messages.length - 1]?.id;

  // Read what the other person wrote while this thread is open (and again whenever something new arrives).
  const unreadFromOther = messages.some((m) => m.sender_id === c.counterpart.id && m.read_at === null);
  useEffect(() => {
    if (!unreadFromOther && c.unread_count === 0) return;
    void markRead(c.id)
      .then(() => globalMutate('chat/conversations'))
      .catch(() => undefined);
  }, [c.id, c.unread_count, unreadFromOther, lastId]);

  // Stay at the bottom while new messages arrive, unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingOlder(true);
    try {
      const page = await fetchOlder(c.id, nextCursor);
      stick.current = false;
      setOlder((prev) => threadOrder(prev, page.data));
      setCursor(page.next_cursor);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [c.id, nextCursor]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendText(c.id, body);
      setDraft('');
      stick.current = true;
      await Promise.all([mutate(), globalMutate('chat/conversations'), globalMutate(threadKey(c.id))]);
    } catch (e) {
      toast.error(errorMessage(e)); // the text stays in the box so it can be sent again
    } finally {
      setSending(false);
    }
  }

  const p = c.property;
  const place = [p.district, p.province ? provinceNameLabel(p.province, language) : ''].filter(Boolean).join('، ');
  const days = groupByDay(messages);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label={t('chat.back')}>
          <ArrowRight className="h-4 w-4" />
        </Button>
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft text-sm font-bold text-primary">
          {nameOf(c, '؟').slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-ink">{nameOf(c, t('chat.unknown'))}</h3>
          <p className="truncate text-xs text-muted">
            {c.my_role === 'SELLER' ? t('chat.role.customer') : t('chat.role.owner')} · {p.title}
            {place ? ` · ${place}` : ''}
          </p>
        </div>
        <span className="tabular hidden shrink-0 text-[13px] font-bold text-ink-2 sm:block">{listingPrice({ ...p, deal_type: p.deal_type ?? 'SALE', monthly_rent: p.monthly_rent ?? null })}</span>
      </header>

      <div
        ref={scroller}
        data-testid="chat-scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-page px-3 py-4"
      >
        {error && !data ? <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
        {nextCursor ? (
          <div className="text-center">
            <Button size="sm" variant="secondary" loading={loadingOlder} onClick={() => void loadOlder()}>
              {t('chat.older')}
            </Button>
          </div>
        ) : null}
        {data && messages.length === 0 ? <p className="py-10 text-center text-[13px] text-muted">{t('chat.noMessages')}</p> : null}
        {days.map((day) => (
          <div key={day.key} className="space-y-1.5">
            <p className="text-center text-[11px] text-muted">{day.label}</p>
            {day.items.map((m) => (
              <Bubble key={m.id} message={m} mine={m.sender_id !== c.counterpart.id} />
            ))}
          </div>
        ))}
      </div>

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          aria-label={t('chat.placeholder')}
          placeholder={t('chat.placeholder')}
          value={draft}
          rows={1}
          maxLength={MAX_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line (and an Enter that picks a letter in an input method does neither).
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          className="max-h-32 min-h-10 flex-1 resize-none"
        />
        <Button type="submit" loading={sending} disabled={!draft.trim()} className="gap-1.5" aria-label={t('chat.sendAria')}>
          <Send aria-hidden className="h-4 w-4 -scale-x-100" />
          {t('chat.send')}
        </Button>
      </form>
    </>
  );
}

function groupByDay(messages: readonly ChatMessage[]): { key: string; label: string; items: ChatMessage[] }[] {
  const out: { key: string; label: string; items: ChatMessage[] }[] = [];
  for (const m of messages) {
    const key = m.created_at.slice(0, 10);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(m);
    else out.push({ key, label: formatDateTime(m.created_at).split('،').slice(0, -1).join('،') || formatDateTime(m.created_at), items: [m] });
  }
  return out;
}

function Bubble({ message: m, mine }: { message: ChatMessage; mine: boolean }) {
  const t = useT();
  const time = formatDateTime(m.created_at).split('،').pop()?.trim() ?? '';
  return (
    <div className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
      <div
        data-testid="chat-bubble"
        data-mine={mine || undefined}
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-6',
          mine ? 'rounded-ss-md bg-primary text-white' : 'rounded-se-md border border-line bg-surface text-ink',
        )}
      >
        {m.is_auto_reply ? (
          <p className={cn('mb-0.5 flex items-center gap-1 text-[11px]', mine ? 'text-white/80' : 'text-muted')}>
            <Bot aria-hidden className="h-3 w-3" />
            {t('chat.autoReply')}
          </p>
        ) : null}
        {m.type === 'IMAGE' && m.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- behind the API's login, so it goes through the proxy as is
          <img src={chatImageSrc(m.image_url)} alt={t('chat.image')} loading="lazy" className="mb-1 max-h-64 rounded-xl" />
        ) : null}
        {m.type === 'IMAGE' && !m.image_url ? (
          <p className="flex items-center gap-1">
            <ImageIcon aria-hidden className="h-4 w-4" />
            {t('chat.image')}
          </p>
        ) : null}
        {m.type === 'LOCATION' && m.lat !== null && m.lng !== null ? (
          <a href={osmLink(m.lat, m.lng)} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-1.5 font-semibold underline">
            <MapPin aria-hidden className="h-4 w-4" />
            {t('chat.openMap')}
          </a>
        ) : null}
        {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
        <p className={cn('mt-0.5 flex items-center justify-end gap-1 text-[11px]', mine ? 'text-white/75' : 'text-muted')}>
          <span className="tabular">{time}</span>
          {mine ? m.read_at ? <CheckCheck aria-label={t('chat.read')} className="h-3.5 w-3.5" /> : <Check aria-hidden className="h-3.5 w-3.5" /> : null}
        </p>
      </div>
    </div>
  );
}
