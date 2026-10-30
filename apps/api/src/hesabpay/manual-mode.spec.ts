import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ManualHesabPayGateway } from './gateway/manual-hesabpay.gateway.js';
import { isValidCardNumber, isValidSheba, paymentSettingsFor, readHesabPaySettings, settlesByHand } from './hesabpay.config.js';

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

describe('Iranian payment settings', () => {
  const CARD = '6037 9912 3456 7893';
  const SHEBA = 'IR27 0170 0000 0010 0324 2000 01';
  const IR = {
    ...PRICES,
    HESABPAY_MODE: 'mock',
    HESABPAY_WEBHOOK_SECRET: 'a-webhook-secret-of-16+',
    MANUAL_PAY_IR_CARD_NUMBER: CARD,
    MANUAL_PAY_IR_CARD_HOLDER: 'Bongah Co',
    MANUAL_PAY_IR_CARD_BANK: 'Melli',
    MANUAL_PAY_IR_SHEBA: SHEBA,
  };

  it('is off (null) without an Iranian account, and Afghanistan is unchanged', () => {
    const settings = readHesabPaySettings(config({ ...PRICES, HESABPAY_MODE: 'mock', HESABPAY_WEBHOOK_SECRET: 'a-webhook-secret-of-16+' }));
    expect(settings.iran).toBeNull();
    expect(paymentSettingsFor(settings, 'IR')).toBeNull();
    expect(paymentSettingsFor(settings, 'AF')).toMatchObject({ currency: 'AFGHANI' });
  });

  it('reads a card and a Sheba, in toman by default, with placeholder prices in mock mode', () => {
    const iran = readHesabPaySettings(config(IR)).iran!;
    expect(iran.currency).toBe('TOMAN');
    expect(iran.manual.accounts).toEqual([
      { kind: 'CARD', number: '6037 9912 3456 7893', holder: 'Bongah Co', bank: 'Melli' },
      { kind: 'SHEBA', number: 'IR270170000000100324200001', holder: 'Bongah Co', bank: 'Melli' },
    ]);
    expect(iran.prices.ladder).toBe('50000');
    expect(iran.prices.subscription.MONTHLY).toBe('1800000'); // 10% off a 2,000,000 list month
  });

  it('prices in rial when asked, from its own settings', () => {
    const iran = readHesabPaySettings(
      config({ ...IR, IR_CURRENCY: 'RIAL', IR_PRICE_SUBSCRIPTION_LIST_MONTHLY: '20000000', IR_PRICE_LADDER: '500000' }),
    ).iran!;
    expect(iran.currency).toBe('RIAL');
    expect(iran.prices.subscription.YEARLY).toBe('120000000');
    expect(iran.prices.ladder).toBe('500000');
  });

  it('settles Iranian payments by hand whatever the mode, Afghan ones as the mode says', () => {
    const mock = readHesabPaySettings(config(IR));
    expect(settlesByHand(mock, 'AF')).toBe(false);
    expect(settlesByHand(mock, 'IR')).toBe(true);
    expect(settlesByHand(readHesabPaySettings(config(MANUAL)), 'AF')).toBe(true);
  });

  it('refuses a mistyped card or Sheba at startup, not at the first payment', () => {
    expect(() => readHesabPaySettings(config({ ...IR, MANUAL_PAY_IR_CARD_NUMBER: '6037 9912 3456 7894' }))).toThrow(/16-digit/);
    expect(() => readHesabPaySettings(config({ ...IR, MANUAL_PAY_IR_SHEBA: 'IR27 0170 0000 0010 0324 2000 02' }))).toThrow(/Sheba|IR/);
    expect(() => readHesabPaySettings(config({ ...IR, MANUAL_PAY_IR_CARD_HOLDER: '' }))).toThrow(/CARD_HOLDER/);
    expect(() => readHesabPaySettings(config({ ...IR, IR_CURRENCY: 'USD' }))).toThrow(/TOMAN or RIAL/);
  });

  it('needs explicit prices when real money is taken', () => {
    const live = { ...IR, HESABPAY_MODE: 'manual', MANUAL_PAY_HESABPAY_PHONE: '+93 785 000 000', MANUAL_PAY_HESABPAY_HOLDER: 'H' };
    expect(() => readHesabPaySettings(config(live))).toThrow(/IR_PRICE_SUBSCRIPTION_LIST_MONTHLY must be set/);
    const priced = readHesabPaySettings(
      config({
        ...live,
        IR_PRICE_SUBSCRIPTION_LIST_MONTHLY: '2000000',
        IR_PRICE_LADDER: '50000',
        IR_PRICE_FEATURED_AD: '100000',
        IR_PRICE_MAP_LOCATION: '30000',
        IR_PRICE_CONTACT_CREDITS: '40000',
      }),
    );
    expect(priced.iran?.prices.featuredAd).toBe('100000');
  });

  it('checks card numbers (Luhn) and Sheba numbers (IBAN mod 97)', () => {
    expect(isValidCardNumber('6037991234567893')).toBe(true);
    expect(isValidCardNumber('6037991234567890')).toBe(false);
    expect(isValidCardNumber('603799123456789')).toBe(false);
    expect(isValidSheba('IR270170000000100324200001')).toBe(true);
    expect(isValidSheba('IR280170000000100324200001')).toBe(false);
    expect(isValidSheba('IR27017000000010032420000')).toBe(false);
  });
});
