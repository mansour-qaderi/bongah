'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import type { BulkOutcome } from '@/lib/listing-actions';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface RunState {
  title: string;
  done: number;
  total: number;
  /** Set when the run has finished. */
  outcome?: BulkOutcome;
  titles: ReadonlyMap<string, string>;
}

/** Shows a long operation over many listings: a bar while it runs, then what worked and what did not. */
export function ProgressDialog({ run, onClose }: { run: RunState | null; onClose: () => void }) {
  const finished = Boolean(run?.outcome);
  const pct = run && run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <Dialog
      open={run !== null}
      onOpenChange={(open) => {
        if (!open && finished) onClose(); // cannot be dismissed while it is still working
      }}
      title={run?.title ?? ''}
      size="md"
      footer={finished ? <Button onClick={onClose}>بستن</Button> : null}
    >
      {run ? (
        finished && run.outcome ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              {run.outcome.failed.length === 0 ? (
                <CheckCircle2 aria-hidden className="h-5 w-5 text-primary" />
              ) : (
                <TriangleAlert aria-hidden className="h-5 w-5 text-accent" />
              )}
              {formatNumber(run.outcome.succeeded.length)} مورد انجام شد
              {run.outcome.failed.length ? `، ${formatNumber(run.outcome.failed.length)} مورد ناموفق` : ''}.
            </div>
            {run.outcome.failed.length ? (
              <ul className="scrollbar-thin max-h-56 space-y-2 overflow-y-auto rounded-xl border border-line p-3 text-[13px]">
                {run.outcome.failed.slice(0, 100).map((f) => (
                  <li key={f.id}>
                    <span className="font-semibold text-ink">{run.titles.get(f.id) ?? f.id}</span>
                    <span className="block text-xs text-danger">{f.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div aria-live="polite">
            <div className="h-2.5 overflow-hidden rounded-full bg-soft">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%`, marginInlineStart: 0 }} />
            </div>
            <p className="tabular mt-3 text-center text-[13px] text-muted">
              {formatNumber(run.done)} از {formatNumber(run.total)} — لطفاً این صفحه را نبندید.
            </p>
          </div>
        )
      ) : null}
    </Dialog>
  );
}
