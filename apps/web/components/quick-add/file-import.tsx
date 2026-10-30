'use client';

import { useCallback, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import type { Market } from '@bongah/shared-types';
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { MAX_DRAFTS, useDrafts } from '@/lib/import/drafts-store';
import { guessMapping, importFields, MAX_FILE_ROWS, rowsFromTable, templateCsv, type FileTable, type ImportField } from '@/lib/import/parse-file';
import { FileImportError, readTableFile } from '@/lib/import/read-file';
import { pinnedFor, useBatchMarket, usePinned } from '@/hooks/use-pinned';
import { tNow } from '@/i18n/active';
import { useLanguage, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { LoadingDots } from '@/components/ui/loading';

function downloadTemplate(market: Market) {
  const url = URL.createObjectURL(new Blob([templateCsv(undefined, market)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bongah-listings-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** Drop a spreadsheet; check which column is which; the rows become drafts. */
export function FileImport() {
  const t = useT();
  const { language } = useLanguage();
  const [pinnedRaw] = usePinned();
  const [market] = useBatchMarket();
  const pinned = pinnedFor(pinnedRaw, market);
  const { actions } = useDrafts();
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; table: FileTable } | null>(null);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setReading(true);
    try {
      const table = await readTableFile(f);
      setFile({ name: f.name, table });
      setMapping(guessMapping(table.headers));
    } catch (e) {
      setFile(null);
      setError(e instanceof FileImportError ? e.message : tNow('file.readFailed'));
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  }, []);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void load(e.dataTransfer.files[0]);
  }

  const mappedPrice = mapping.includes('price');
  const mappedBasics = mappedPrice && (mapping.includes('type') || mapping.includes('title'));

  function build() {
    if (!file) return;
    const { rows, skipped } = rowsFromTable(file.table, mapping, pinned);
    const left = actions.add(rows);
    toast.success(`${tNow('file.built', { n: formatNumber(rows.length - left) })}${skipped ? tNow('file.skipped', { n: formatNumber(skipped) }) : ''}.`);
    if (left > 0) toast.warning(tNow('file.overflow', { max: formatNumber(MAX_DRAFTS), left: formatNumber(left) }));
    setFile(null);
    requestAnimationFrame(() => document.getElementById('drafts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return (
    <Card className="p-4 sm:p-6">
      {!file ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              over ? 'border-primary bg-primary-tint' : 'border-line-strong',
            )}
          >
            {reading ? (
              <div className="flex flex-col items-center gap-3 text-muted">
                <LoadingDots className="text-primary" />
                <p className="text-sm">{t('file.reading')}</p>
              </div>
            ) : (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-soft text-primary">
                  <UploadCloud aria-hidden className="h-7 w-7" strokeWidth={1.7} />
                </span>
                <p className="mt-4 text-[15px] font-bold text-ink">{t('file.dropTitle')}</p>
                <p className="mt-1 text-[13px] text-muted">
                  {t('file.dropHelp', { max: formatNumber(MAX_FILE_ROWS) })}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Button onClick={() => input.current?.click()} className="gap-2">
                    <FileSpreadsheet aria-hidden className="h-4 w-4" />
                    {t('file.choose')}
                  </Button>
                  <Button variant="secondary" onClick={() => downloadTemplate(market)} className="gap-2">
                    <Download aria-hidden className="h-4 w-4" />
                    {t('file.template')}
                  </Button>
                </div>
              </>
            )}
            <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx" hidden onChange={(e) => void load(e.target.files?.[0])} />
          </div>
          {error ? (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink">{t('file.checkColumns')}</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {t('file.checkHelp', { name: file.name, n: formatNumber(file.table.rows.length) })}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
              {t('file.another')}
            </Button>
          </div>

          <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[40rem] text-start text-[13px]">
              <thead className="bg-soft/60">
                <tr>
                  {file.table.headers.map((h, i) => (
                    <th key={i} className="min-w-40 px-3 py-2 text-start align-top">
                      <div className="mb-1.5 truncate text-xs font-semibold text-muted" title={h}>
                        {h}
                      </div>
                      <Select
                        aria-label={t('file.columnAria', { name: h })}
                        value={mapping[i] ?? ''}
                        onChange={(e) => {
                          const v = (e.target.value || null) as ImportField | null;
                          // A field can be fed by one column only: move it here.
                          setMapping((m) => m.map((x, j) => (j === i ? v : x === v ? null : x)));
                        }}
                        className="h-8 text-[13px]"
                      >
                        <option value="">{t('file.ignore')}</option>
                        {importFields(language, market).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {file.table.rows.slice(0, 4).map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="max-w-56 truncate px-3 py-1.5 text-ink-2" title={c}>
                        {c || <span className="text-muted">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!mappedBasics ? (
            <p role="status" className="text-[13px] text-accent-text">
              {t('file.needMapping')}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button size="lg" onClick={build} disabled={!mapping.some(Boolean)}>
              {t('file.build', { n: formatNumber(file.table.rows.length) })}
            </Button>
            <span className="text-xs text-muted">{t('file.nothingSaved')}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
