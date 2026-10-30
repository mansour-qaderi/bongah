import { beforeEach, describe, expect, it, vi } from 'vitest';

const fulfil = vi.fn();
vi.mock('./hesabpay.fulfilment.js', () => ({ fulfil: (...args: unknown[]) => fulfil(...args) }));

import { HesabpayService } from './hesabpay.service.js';
import type { HesabPaySettings } from './hesabpay.config.js';

/** The service with just enough fake around it to start a FEATURED_CREDITS payment (no agency, no listing needed). */
function setup(mockAutoSuccess: boolean, claimed = 1, market: 'AF' | 'IR' = 'AF') {
  const row = {
    id: 'tx-1',
    purpose: 'FEATURED_CREDITS',
    status: 'PENDING',
    amount: { toNumber: () => 270 },
    createdAt: new Date('2026-10-26T00:00:00Z'),
  };
  const db = { $executeRaw: vi.fn().mockResolvedValue(claimed) };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ market }) },
    transaction: {
      create: vi.fn().mockResolvedValue(row),
      findUnique: vi.fn().mockResolvedValue({ status: claimed === 1 ? 'SUCCESS' : 'PENDING' }),
    },
    $transaction: vi.fn(async (fn: (d: typeof db) => unknown) => fn(db)),
  };
  const gateway = { createSession: vi.fn().mockResolvedValue({ id: 'mock_1', paymentUrl: 'https://pay.mock.invalid/mock_1' }) };
  const pricing = {
    effective: vi.fn().mockResolvedValue({ FEATURED_AD: { price: '100', quantity: 7 } }),
    marketSettings: vi.fn((m: 'AF' | 'IR') => ({
      currency: m === 'IR' ? 'TOMAN' : 'AFGHANI',
      manual: { accounts: m === 'IR' ? [{ kind: 'CARD', number: '6037 9912 3456 7893', holder: 'Bongah', bank: null }] : [], note: null },
    })),
  };
  const settings = { currency: 'AFGHANI', featuredAdDays: 7, mockAutoSuccess, mode: 'mock' } as unknown as HesabPaySettings;
  const promotion = {};
  const service = new HesabpayService(prisma as never, gateway as never, promotion as never, pricing as never, settings);
  return { service, prisma, db, gateway, pricing };
}

describe('HesabpayService.initiate with the test checkout', () => {
  beforeEach(() => fulfil.mockReset());

  it('settles the payment on the spot through the same delivery a webhook uses', async () => {
    const { service, prisma, db } = setup(true);
    const result = await service.initiate('user-1', { purpose: 'FEATURED_CREDITS', bundle_size: 3 });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(fulfil).toHaveBeenCalledTimes(1);
    expect(fulfil.mock.calls[0]?.[1]).toMatchObject({ id: 'tx-1', purpose: 'FEATURED_CREDITS' });
    expect(prisma.transaction.findUnique).toHaveBeenCalled();
    expect(result.status).toBe('SUCCESS');
  });

  it('does not deliver anything when the test checkout is off: the payment stays PENDING for the gateway', async () => {
    const { service, prisma } = setup(false);
    const result = await service.initiate('user-1', { purpose: 'FEATURED_CREDITS', bundle_size: 3 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(fulfil).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING');
    expect(result.payment_url).toBe('https://pay.mock.invalid/mock_1');
  });

  it('delivers nothing twice if the payment was already settled by someone else', async () => {
    const { service } = setup(true, 0);
    await service.initiate('user-1', { purpose: 'FEATURED_CREDITS', bundle_size: 3 });
    expect(fulfil).not.toHaveBeenCalled();
  });

  it('lets a failed delivery reach the caller instead of reporting a purchase that did not happen', async () => {
    const { service } = setup(true);
    fulfil.mockRejectedValueOnce(new Error('boom'));
    await expect(service.initiate('user-1', { purpose: 'FEATURED_CREDITS', bundle_size: 3 })).rejects.toThrow('boom');
  });

  describe('an Iranian payer', () => {
    it('pays by hand even when the test checkout is on: manual method, toman, card details, nothing settled, no gateway session', async () => {
      const { service, prisma, gateway, pricing } = setup(true, 1, 'IR');
      const result = await service.initiate('user-1', { purpose: 'FEATURED_CREDITS', bundle_size: 3 });
      expect(prisma.$transaction).not.toHaveBeenCalled(); // never settled by the test checkout: nobody has paid
      expect(fulfil).not.toHaveBeenCalled();
      expect(gateway.createSession).not.toHaveBeenCalled(); // Iran has no gateway
      expect(pricing.effective).toHaveBeenCalledWith(prisma, 'IR');
      expect(prisma.transaction.create.mock.calls[0]?.[0].data).toMatchObject({
        market: 'IR',
        currency: 'TOMAN',
        method: 'MANUAL',
        userId: 'user-1',
      });
      expect(result).toMatchObject({
        status: 'PENDING',
        currency: 'TOMAN',
        method: 'MANUAL',
        payment_url: null,
        manual: { accounts: [{ kind: 'CARD', holder: 'Bongah' }] },
      });
    });

    it('is refused with a clear reason when Iranian payments are not set up', async () => {
      const { service, pricing } = setup(false, 1, 'IR');
      pricing.marketSettings.mockImplementation(() => {
        throw Object.assign(new Error('unavailable'), { response: { code: 'MARKET_PAYMENTS_UNAVAILABLE' } });
      });
      await expect(service.initiate('user-1', { purpose: 'FEATURED_CREDITS', bundle_size: 3 })).rejects.toMatchObject({
        response: { code: 'MARKET_PAYMENTS_UNAVAILABLE' },
      });
    });
  });
});
