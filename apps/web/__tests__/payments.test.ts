import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const openManual = vi.fn();
vi.mock('../lib/api', () => ({ api: { post: (...args: unknown[]) => post(...args) } }));
const mutateKey = vi.fn();
vi.mock('swr', () => ({ mutate: (...args: unknown[]) => mutateKey(...args) }));
vi.mock('../lib/manual-payment', () => ({ openManualPayment: (...args: unknown[]) => openManual(...args) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { readPending } from '../lib/pending-payments';
import { safePaymentUrl, startPayment } from '../lib/payments';

const initiated = (over: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  purpose: 'SUBSCRIPTION',
  status: 'PENDING',
  amount: 100,
  currency: 'AFN',
  created_at: '2026-10-26T00:00:00Z',
  payment_url: 'https://pay.example/checkout/1',
  ...over,
});

describe('startPayment', () => {
  const assign = vi.fn();

  beforeEach(() => {
    post.mockReset();
    assign.mockReset();
    vi.stubGlobal('window', { location: { assign } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the browser to the gateway when the payment is still pending, and remembers it', async () => {
    post.mockResolvedValue(initiated());
    await expect(startPayment({ purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' })).resolves.toBe('redirected');
    expect(assign).toHaveBeenCalledWith('https://pay.example/checkout/1');
    expect(readPending().map((p) => p.id)).toContain('pay-1');
  });

  it('stays in the panel when the API already settled the payment', async () => {
    post.mockResolvedValue(initiated({ id: 'pay-2', status: 'SUCCESS', payment_url: 'javascript:alert(1)' }));
    await expect(startPayment({ purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' })).resolves.toBe('completed');
    expect(assign).not.toHaveBeenCalled();
    expect(readPending().map((p) => p.id)).not.toContain('pay-2');
  });

  it('refuses a gateway address that is not a web address', async () => {
    post.mockResolvedValue(initiated({ id: 'pay-3', payment_url: 'javascript:alert(1)' }));
    await expect(startPayment({ purpose: 'LADDER', property_id: 'p' })).rejects.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('startPayment in manual mode', () => {
  const assign = vi.fn();

  beforeEach(() => {
    post.mockReset();
    assign.mockReset();
    openManual.mockReset();
    mutateKey.mockReset();
    vi.stubGlobal('window', { location: { assign } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the pay-by-hand dialog and never leaves the panel (no gateway address at all)', async () => {
    post.mockResolvedValue(initiated({ id: 'pay-m', payment_url: null, method: 'MANUAL', manual: { accounts: [], note: '' } }));
    await expect(startPayment({ purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' })).resolves.toBe('manual');
    expect(openManual).toHaveBeenCalledWith('pay-m');
    expect(assign).not.toHaveBeenCalled();
    // The dialog opens with what the start already told it, without waiting for another round trip.
    expect(mutateKey).toHaveBeenCalledWith('hesabpay/payments/pay-m', expect.objectContaining({ id: 'pay-m' }), { revalidate: false });
  });

  it('is manual whenever there is no address, even if the method field were missing', async () => {
    post.mockResolvedValue(initiated({ id: 'pay-n', payment_url: null }));
    await expect(startPayment({ purpose: 'LADDER', property_id: 'p' })).resolves.toBe('manual');
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not wait for the watcher: a manual payment is only remembered once a receipt is sent', async () => {
    post.mockResolvedValue(initiated({ id: 'pay-o', payment_url: null, method: 'MANUAL' }));
    await startPayment({ purpose: 'SUBSCRIPTION', package_type: 'MONTHLY' });
    expect(readPending().map((p) => p.id)).not.toContain('pay-o');
  });
});

describe('safePaymentUrl', () => {
  it('only follows http(s)', () => {
    expect(safePaymentUrl('https://a.test/x')).toBe('https://a.test/x');
    expect(safePaymentUrl('javascript:alert(1)')).toBeNull();
    expect(safePaymentUrl('nope')).toBeNull();
  });
});
