'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AgencyAnalytics } from '@bongah/shared-types';
import { formatCompact, formatDayKey, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/translate';

type SeriesKey = 'views' | 'leads' | 'phone_reveals';

const SERIES: { key: SeriesKey; label: MessageKey; color: string; dash?: string }[] = [
  { key: 'views', label: 'chart.views', color: '#047857' },
  { key: 'leads', label: 'chart.leads', color: '#2563EB', dash: '6 4' },
  { key: 'phone_reveals', label: 'chart.calls', color: '#D97706', dash: '2 3' },
];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: string }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      {payload.map((p) => {
        const meta = SERIES.find((s) => s.key === p.dataKey)!;
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-6 text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
              {t(meta.label)}
            </span>
            <span className="tabular font-semibold">{formatNumber(p.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Views, messages and calls per Kabul day. The chart box is forced left-to-right (the library lays axes out that way)
 * and the time axis is reversed, so the days run right to left like the page. The legend doubles as the on/off switches.
 */
export function PerformanceChart({ analytics }: { analytics: AgencyAnalytics }) {
  const t = useT();
  const [hidden, setHidden] = useState<ReadonlySet<SeriesKey>>(new Set());
  const data = useMemo(
    () => analytics.series.map((d) => ({ ...d, label: formatDayKey(d.day) })),
    [analytics.series],
  );
  const visible = SERIES.filter((s) => !hidden.has(s.key));
  const empty = analytics.totals.views + analytics.totals.leads + analytics.totals.phone_reveals === 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t('chart.toggle')}>
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={!off}
              onClick={() => {
                const next = new Set(hidden);
                if (off) next.delete(s.key);
                else if (visible.length > 1) next.add(s.key);
                setHidden(next);
              }}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                off ? 'border-line text-muted' : 'border-line-strong text-ink-2',
              )}
            >
              <span
                aria-hidden
                className="h-0 w-5 border-t-2"
                style={{ borderColor: off ? '#D1D5DB' : s.color, borderStyle: s.dash ? 'dashed' : 'solid' }}
              />
              {t(s.label)}
              <span className="tabular text-muted">{formatNumber(analytics.totals[s.key])}</span>
            </button>
          );
        })}
      </div>

      <div dir="ltr" className="relative h-64 w-full" role="img" aria-label={t('chart.aria')}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="fill-views" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#047857" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#047857" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#EEF0F2" />
            <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} minTickGap={24} />
            <YAxis orientation="right" width={44} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={formatCompact} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#D1D5DB' }} />
            {visible.map((s) =>
              s.key === 'views' ? (
                <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill="url(#fill-views)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
              ) : (
                <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
              ),
            )}
          </AreaChart>
        </ResponsiveContainer>
        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" dir="rtl">
            <p className="rounded-lg bg-surface/90 px-3 py-1.5 text-[13px] text-muted">{t('chart.empty')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
