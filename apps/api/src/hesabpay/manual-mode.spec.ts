import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ManualHesabPayGateway } from './gateway/manual-hesabpay.gateway.js';
import { readHesabPaySettings } from './hesabpay.config.js';

const config = (env: Record<string, string>) => new ConfigService(env);

const PRICES = {
  HESABPAY_PRICE_LADDER: '50',
  HESABPAY_PRICE_FEATURED_AD: '100',
  HESABPAY_PRICE_MAP_LOCATION: '30',
  HESABPAY_PRICE_CONTACT_CREDITS: '40',
  HESABPAY_CONTACT_CREDITS_PER_PACK: '10',
  HESABPAY_FEATURED_AD_DAYS: '7',
};
const MANUAL = { HESABPAY_MODE: 'manual', ...PRICES, MANUAL_PAY_HESABPAY_PHONE: '+93 785 000 000', MANUAL_PAY_HESABPAY_HOLDER: 'Test Holder' };

describe('manual payment settings', () => {
  it('reads the accounts from the environment: a HesabPay wallet, a card, or both', () => {
    const wallet = readHesabPaySettings(config(MANUAL));
    expect(wallet.mode).toBe('manual');
    expect(wallet.manual).toEqual({
      accounts: [{ kind: 'HESABPAY', number: '+93 785 000 000', holder: 'Test Holder', bank: null }],
      note: null,
    });
    const both = readHesabPaySettings(
      config({
        ...MANUAL,
        MANUAL_PAY_CARD_NUMBER: '6037 1111 2222 3333',
        MANUAL_PAY_CARD_HOLDER: 'Card Holder',
        MANUAL_PAY_CARD_BANK: 'Some Bank',
        MANUAL_PAY_NOTE: ' Reviewed every day ',
      }),
    );
    expect(both.manual.accounts.map((a) => a.kind)).toEqual(['HESABPAY', 'CARD']);
    expect(both.manual.accounts[1]).toMatchObject({ bank: 'Some Bank' });
    expect(both.manual.note).toBe('Reviewed every day');
  });

  it('refuses to start with nowhere to send the money, or with half an account', () => {
    expect(() => readHesabPaySettings(config({ HESABPAY_MODE: 'manual', ...PRICES }))).toThrow(/somewhere to send the money/);
    expect(() => readHesabPaySettings(config({ HESABPAY_MODE: 'manual', ...PRICES, MANUAL_PAY_CARD_NUMBER: '6037 1111 2222 3333' }))).toThrow(
      /MANUAL_PAY_CARD_NUMBER and MANUAL_PAY_CARD_HOLDER/,
    );
    expect(() => readHesabPaySettings(config({ ...MANUAL, MANUAL_PAY_HESABPAY_PHONE: 'abc' }))).toThrow(/phone or card number/);
  });

  it('takes real money, so the prices are never placeholders', () => {
    const { HESABPAY_PRICE_LADDER: _ladder, ...withoutLadder } = MANUAL as Record<string, string>;
    expect(() => readHesabPaySettings(config(withoutLadder))).toThrow(/HESABPAY_PRICE_LADDER must be set/);
  });

  it('never auto-approves, and needs neither an API key nor a webhook secret', () => {
    const s = readHesabPaySettings(config({ ...MANUAL, HESABPAY_MOCK_AUTO_SUCCESS: 'true' }));
    expect(s.mockAutoSuccess).toBe(false);
    expect(s.apiKey).toBe('');
  });

  it('has no accounts outside manual mode, and a sane picture limit', () => {
    const mock = readHesabPaySettings(config({ HESABPAY_WEBHOOK_SECRET: 'a-webhook-secret-of-16+chars' }));
    expect(mock.manual).toEqual({ accounts: [], note: null });
    expect(mock.proofMaxBytes).toBe(5_000_000);
    expect(readHesabPaySettings(config({ ...MANUAL, MANUAL_PAY_PROOF_MAX_BYTES: '200000' })).proofMaxBytes).toBe(200_000);
    expect(() => readHesabPaySettings(config({ ...MANUAL, MANUAL_PAY_PROOF_MAX_BYTES: '10' }))).toThrow(/MANUAL_PAY_PROOF_MAX_BYTES/);
  });
});

describe('ManualHesabPayGateway', () => {
  const gateway = new ManualHesabPayGateway();

  it('makes an id for the row and has no page to send anyone to', async () => {
    const session = await gateway.createSession({ reference: 'r', amount: '900', currency: 'AFGHANI', description: 'x' });
    expect(session.id).toMatch(/^manual_[0-9a-f-]{36}$/);
    expect(session.paymentUrl).toBeNull();
  });

  it('refuses every webhook', async () => {
    await expect(gateway.verifyWebhook()).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
