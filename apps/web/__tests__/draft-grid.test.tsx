// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const publish = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/use-api', () => ({ useWallet: () => ({ data: undefined }) }));
vi.mock('@/lib/listing-actions', () => ({ refreshListingData: vi.fn(async () => undefined) }));
vi.mock('@/lib/import/publish', () => ({ publishDrafts: (...a: unknown[]) => publish(...a) }));

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DraftGrid } from '@/components/quick-add/draft-grid';
import { useDrafts } from '@/lib/import/drafts-store';
import { emptyDraft, type DraftRow } from '@/lib/import/types';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);

const complete = (key: string, over: Partial<DraftRow> = {}): DraftRow => ({
  ...emptyDraft('form'),
  key,
  title: 'خانهٔ دو منزله در کارته چهار',
  type: 'HOUSE_HAWILI',
  deal_type: 'SALE',
  price: '5000000',
  currency: 'AFGHANI',
  area_sqm: '200',
  province: 'کابل',
  address: 'کارتهٔ چهار، سرک سوم',
  ...over,
});

let seed: DraftRow[] = [];
function Seed() {
  const { actions } = useDrafts();
  return (
    <button
      onClick={() => {
        actions.clear();
        actions.add(seed);
      }}
    >
      seed
    </button>
  );
}

function mountWith(rows: DraftRow[]) {
  seed = rows;
  render(
    <LanguageProvider initialLanguage="prs">
      <TooltipProvider>
        <Seed />
        <DraftGrid />
      </TooltipProvider>
    </LanguageProvider>,
  );
  fireEvent.click(screen.getByText('seed'));
}

beforeEach(() => {
  window.localStorage.clear();
  // These tests are about the table; a single draft would otherwise open as a card (see «the drafts as cards»).
  window.localStorage.setItem('bongah.drafts-view', JSON.stringify('table'));
  publish.mockReset();
  publish.mockResolvedValue([]);
});
afterEach(() => cleanup());

describe('the drafts as cards', () => {
  beforeEach(() => window.localStorage.removeItem('bongah.drafts-view'));

  it('shows a single draft as a card, with the full description in a box of its own', async () => {
    const whole = 'توجه توجه\nخانه در هرات\nتماس: 0799123456\n0700654321';
    mountWith([complete('a', { description: whole })]);
    const card = await screen.findByTestId('draft-card');
    expect(document.querySelector('table')).toBeNull();
    const box = within(card).getByLabelText(t('card.description')) as HTMLTextAreaElement;
    expect(box.value).toBe(whole);
  });

  it('shows the price terms beside the price and lets the person change them', async () => {
    mountWith([complete('a', { price_terms: 'NEGOTIABLE' })]);
    const card = await screen.findByTestId('draft-card');
    const terms = within(card).getByRole('combobox', { name: t('grid.h.terms') });
    expect(terms.textContent).toBe(t('label.terms.NEGOTIABLE'));
    fireEvent.click(terms);
    fireEvent.click(screen.getByRole('option', { name: t('label.terms.FIXED') }));
    await waitFor(() => expect(within(screen.getByTestId('draft-card')).getByRole('combobox', { name: t('grid.h.terms') }).textContent).toBe(t('label.terms.FIXED')));
  });

  it('keeps the table for several drafts, and lets the person switch either way (and remembers it)', async () => {
    mountWith([complete('a'), complete('b')]);
    await waitFor(() => expect(document.querySelector('table')).toBeTruthy());
    expect(screen.queryByTestId('draft-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('grid.view.cards') }));
    expect(await screen.findAllByTestId('draft-card')).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem('bongah.drafts-view')!)).toBe('cards');
    fireEvent.click(screen.getByRole('button', { name: t('grid.view.table') }));
    await waitFor(() => expect(document.querySelector('table')).toBeTruthy());
  });

  it('edits a draft from its card', async () => {
    mountWith([complete('a')]);
    const card = await screen.findByTestId('draft-card');
    fireEvent.change(within(card).getByLabelText(new RegExp('^' + t('grid.h.price'))), { target: { value: '7000000' } });
    await waitFor(() => expect((within(screen.getByTestId('draft-card')).getByLabelText(new RegExp('^' + t('grid.h.price'))) as HTMLInputElement).value).toBe('7000000'));
  });

  it('says what is missing quietly, and names the field after «ثبت»', async () => {
    mountWith([complete('a', { price: '' })]);
    const card = await screen.findByTestId('draft-card');
    expect(within(card).getByText(t('grid.todo', { fields: t('import.field.price') }))).toBeTruthy();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('grid.publish', { n: '۰' })) }));
    await waitFor(() => expect(screen.getByText(t('grid.fixTitle'))).toBeTruthy());
  });
});

describe('the drafts table', () => {
  it('keeps the status guide out of the way until the ⓘ beside the title is pressed', async () => {
    mountWith([complete('a')]);
    const button = await screen.findByRole('button', { name: t('grid.legend.title') });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(t('grid.legend.note'))).toBeNull();
    expect(button.closest('h2')).not.toBeNull(); // it sits in the title line

    fireEvent.click(button);
    const guide = await screen.findByRole('dialog', { name: t('grid.legend.title') });
    expect(within(guide).getByText(t('grid.ready'))).toBeTruthy();
    expect(within(guide).getByText(t('grid.needsFix'))).toBeTruthy();
    expect(within(guide).getByText(t('grid.failed'))).toBeTruthy();
    expect(within(guide).getByText(t('grid.legend.note'))).toBeTruthy();

    fireEvent.click(within(guide).getByRole('button', { name: t('common.close') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('has a price-terms column in the table, filled from the draft', async () => {
    mountWith([complete('a', { price_terms: 'FIXED' }), complete('b')]);
    await waitFor(() => expect(document.querySelectorAll('tbody [data-state]').length).toBe(2));
    expect([...document.querySelectorAll('thead th')].some((th) => th.textContent?.includes(t('grid.h.terms')))).toBe(true);
    const cells = screen.getAllByRole('combobox', { name: new RegExp(t('import.field.price_terms')) });
    expect(cells.map((c) => c.textContent)).toEqual([t('label.terms.FIXED'), '—']);
  });

  it('shows each row as a word, not just an icon, and the explanation is on the pill for screen readers', async () => {
    mountWith([complete('a'), complete('b', { title: '', price: '' })]);
    await waitFor(() => expect(document.querySelectorAll('tbody [data-state]').length).toBe(2));
    const pills = [...document.querySelectorAll('tbody [data-state]')];
    expect(pills.map((p) => p.getAttribute('data-state'))).toEqual(['ready', 'incomplete']);
    expect(pills[0]!.textContent).toBe(t('grid.ready'));
    expect(pills[1]!.textContent).toBe(t('grid.needsFix'));
    expect(pills[1]!.getAttribute('aria-label')).toContain(t('grid.tip.incomplete'));
  });

  it('keeps an untouched incomplete row calm: a plain to-do line, no red alert', async () => {
    mountWith([complete('b', { price: '' })]);
    await waitFor(() => expect(document.querySelector('tbody [data-state]')).toBeTruthy());
    expect(screen.getByText(t('grid.todo', { fields: t('import.field.price') }))).toBeTruthy();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('after «ثبت» names the column next to each complaint, so the agent knows which cell to fix', async () => {
    mountWith([complete('ok'), complete('b', { price: '', area_sqm: '' })]);
    await waitFor(() => expect(document.querySelectorAll('tbody [data-state]').length).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('grid.publish', { n: '۱' })) }));
    await waitFor(() => expect(screen.getByText(t('grid.fixTitle'))).toBeTruthy());
    const box = screen.getByText(t('grid.fixTitle')).parentElement!;
    expect(within(box).getByText(t('import.field.price'))).toBeTruthy();
    expect(within(box).getByText(t('import.field.area_sqm'))).toBeTruthy();
    expect(within(box).getByText(t('list.col.priceNumber'))).toBeTruthy();
  });

  it('marks a row the server refused, with the reason and what to do next', async () => {
    publish.mockResolvedValue([{ key: 'a', ok: false, message: 'سهمیهٔ شما تمام شده است.' }]);
    mountWith([complete('a')]);
    await waitFor(() => expect(document.querySelector('tbody [data-state="ready"]')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('grid.publish', { n: '۱' })) }));
    await waitFor(() => expect(document.querySelector('tbody [data-state="failed"]')).toBeTruthy());
    expect(screen.getByText(t('grid.refused', { reason: 'سهمیهٔ شما تمام شده است.' }))).toBeTruthy();
    expect(screen.getByText(t('grid.refusedHint'))).toBeTruthy();
  });
});
