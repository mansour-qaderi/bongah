import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { launchImageLibrary } from 'react-native-image-picker';
import Clipboard from '@react-native-clipboard/clipboard';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { ApiError } from '../src/api/client';
import { errorMessage } from '../src/api/errors';
import { pickReceipt } from '../src/payments/pickReceipt';
import { cleanReference, isValidReference } from '../src/payments/reference';
import i18next from 'i18next';
import { captureToasts } from '../test-utils/toasts';
import {
  allText,
  callsTo,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';

const fetchMock = jest.fn();
let toasts: ReturnType<typeof captureToasts>;

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({
    status: 'signedIn',
    user: { id: 'u1', role: 'AGENCY', phone_number: '+93701234567', featured_credits: 0 },
    refreshUser: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screen picks it up.
import CheckoutScreen from '../src/screens/payments/CheckoutScreen';

const PRICING = {
  body: {
    currency: 'AFGHANI',
    subscription: {},
    subscription_list: {},
    featured_ad: 100,
    map_location: 30,
    featured_ad_days: 7,
    contact_credits: 40,
    contact_credits_per_pack: 10,
    plans: {},
    featured_bundles: [{ size: 1, price: 100, list_price: 100, discount_percent: 0 }],
  },
};

const ACCOUNTS = [
  { kind: 'HESABPAY', number: '0700 000 000', holder: 'Test Holder', bank: null },
  { kind: 'CARD', number: '1234 5678 9012 3456', holder: 'Test Holder', bank: 'Test Bank' },
];

const payment = (over: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  purpose: 'FEATURED_CREDITS',
  status: 'PENDING',
  amount: 100,
  currency: 'AFGHANI',
  created_at: '2026-10-28T08:00:00Z',
  payment_url: null,
  method: 'MANUAL',
  receipt_uploaded: false,
  reference: null,
  manual: { accounts: ACCOUNTS, note: 'test-note' },
  ...over,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const mount = async () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const tree = await renderTree(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CheckoutScreen
        {...({ navigation, route: {} } as unknown as React.ComponentProps<typeof CheckoutScreen>)}
      />
    </QueryClientProvider>,
  );
  mounted.push(tree);
  await settle();
  return tree;
};
const press = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
  await ReactTestRenderer.act(async () => {
    pressableWith(tree.root, label).props.onPress();
  });
  await settle();
};
/** fetch answers the API routes; the picture the person chose is read from the phone (a file: address). */
const api = (routes: Parameters<typeof mockApi>[1]) => {
  mockApi(fetchMock, routes);
  const routed = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    String(url).startsWith('file:')
      ? { blob: async () => new Blob(['pixels']) }
      : routed(url, init),
  );
};
const chosen = (type = 'image/png') =>
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
    assets: [{ uri: 'file:///receipt.png', type, fileSize: 1000 }],
  });

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  (launchImageLibrary as jest.Mock).mockReset();
  (launchImageLibrary as jest.Mock).mockResolvedValue({ didCancel: true });
  toasts = captureToasts();
});
afterEach(async () => {
  toasts.restore();
  jest.restoreAllMocks();
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe('paying by hand (manual mode)', () => {
  it('opens no payment page, and shows the amount and the accounts the server sent', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': { body: payment() },
    });
    const tree = await mount();
    await press(tree, prs.checkout.pay);

    expect(open).not.toHaveBeenCalled();
    const text = allText(tree.root);
    expect(text).toContain(prs.manualPay.intro);
    expect(text).toContain('0700 000 000'); // the number is shown as the server gave it, not in Persian digits
    expect(text).toContain('1234 5678 9012 3456');
    expect(text).toContain('Test Holder');
    expect(text).toContain('test-note');
    // Nothing that belongs to a payment page: no "reopen the page" button.
    expect(text).not.toContain(prs.checkout.reopen);
  });

  it('copies an account number without its spaces', async () => {
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': { body: payment() },
    });
    const copy = jest.spyOn(Clipboard, 'setString').mockImplementation(() => undefined);
    const tree = await mount();
    await press(tree, prs.checkout.pay);
    const card = tree.root.find(n => n.props.testID === 'manual-account-CARD');
    await ReactTestRenderer.act(async () => {
      pressableWith(card, prs.manualPay.copy).props.onPress();
    });
    await settle();
    expect(copy).toHaveBeenCalledWith('1234567890123456');
    expect(toasts.messages).toContain(prs.manualPay.copied);
  });

  it('uploads the chosen picture as the receipt, and then says it is waiting for the admin', async () => {
    let uploaded = false;
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': () => ({ body: payment({ receipt_uploaded: uploaded }) }),
      'POST /hesabpay/payments/pay-1/proof': () => {
        uploaded = true;
        return { body: payment({ receipt_uploaded: true }) };
      },
    });
    chosen();
    const tree = await mount();
    await press(tree, prs.checkout.pay);
    expect(allText(tree.root)).not.toContain(prs.manualPay.sent);

    await press(tree, prs.manualPay.choose);

    const proof = fetchMock.mock.calls.find(
      ([url, init]: [string, RequestInit?]) =>
        !String(url).startsWith('file:') && new URL(url).pathname === '/hesabpay/payments/pay-1/proof' && init?.method === 'POST',
    );
    expect(proof).toBeDefined();
    expect((proof![1].headers as Record<string, string>)['Content-Type']).toBe('image/png');
    expect(proof![1].body).toBeInstanceOf(Blob); // the picture itself, not JSON
    const text = allText(tree.root);
    expect(text).toContain(prs.manualPay.sent);
    expect(text).toContain(prs.manualPay.replace);
  });

  it('does not upload a file that is not a picture, and says so', async () => {
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': { body: payment() },
    });
    chosen('application/pdf');
    const tree = await mount();
    await press(tree, prs.checkout.pay);
    await press(tree, prs.manualPay.choose);
    expect(callsTo(fetchMock).some(c => c.path.endsWith('/proof'))).toBe(false);
    expect(toasts.messages).toContain(prs.manualPay.badType);
  });

  describe('the transaction reference', () => {
    const routes = (extra: Parameters<typeof mockApi>[1] = {}) => ({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': { body: payment() },
      ...extra,
    });
    const typeReference = async (tree: ReactTestRenderer.ReactTestRenderer, value: string) => {
      const field = tree.root.findAll(
        n => n.props.testID === 'manual-reference' && typeof n.props.onChangeText === 'function',
      )[0]!;
      await ReactTestRenderer.act(async () => {
        field.props.onChangeText(value);
      });
    };

    it('is offered next to the picture, and sent cleaned up (Persian digits become 0-9)', async () => {
      let saved: string | null = null;
      api(
        routes({
          'GET /hesabpay/payments/pay-1': () => ({ body: payment({ reference: saved }) }),
          'POST /hesabpay/payments/pay-1/reference': () => {
            saved = 'HP12345';
            return { body: payment({ reference: saved }) };
          },
        }),
      );
      const tree = await mount();
      await press(tree, prs.checkout.pay);
      expect(allText(tree.root)).toContain(prs.manualPay.refTitle);

      await typeReference(tree, '  HP۱۲۳۴۵ ');
      await press(tree, prs.manualPay.refSend);

      const call = callsTo(fetchMock).find(c => c.path === '/hesabpay/payments/pay-1/reference');
      expect(call).toMatchObject({ method: 'POST', body: { reference: 'HP12345' } });
      const text = allText(tree.root);
      expect(text).toContain(prs.manualPay.refSent);
      expect(text).toContain('HP12345');
      expect(text).toContain(prs.manualPay.refChange);
      expect(callsTo(fetchMock).some(c => c.path.endsWith('/proof'))).toBe(false);
    });

    it('does not send something that cannot be a transaction id, and says what to write', async () => {
      api(routes());
      const tree = await mount();
      await press(tree, prs.checkout.pay);
      await typeReference(tree, 'ab1');
      await press(tree, prs.manualPay.refSend);
      expect(allText(tree.root)).toContain(prs.manualPay.refInvalid);
      expect(callsTo(fetchMock).some(c => c.path.endsWith('/reference'))).toBe(false);
    });

    it('says plainly when the same reference is already on another payment', async () => {
      api(
        routes({
          'POST /hesabpay/payments/pay-1/reference': {
            status: 409,
            body: { code: 'REFERENCE_ALREADY_USED', message: 'x' },
          },
        }),
      );
      const tree = await mount();
      await press(tree, prs.checkout.pay);
      await typeReference(tree, 'HP12345');
      await press(tree, prs.manualPay.refSend);
      expect(toasts.messages).toContain(prs.manualPay.refUsed);
    });

    it('cleans and checks a reference the way the server does', () => {
      expect(cleanReference('  hp ۱۲ ٣٤  ')).toBe('hp 12 34');
      for (const ok of ['4829175603', 'HP-2026/10.29', 'ab 12']) expect(isValidReference(ok)).toBe(true);
      for (const bad of ['', 'ab1', '-1234-', '<b>1234</b>', 'x'.repeat(65)]) expect(isValidReference(bad)).toBe(false);
    });
  });

  it('does nothing when the gallery is closed without choosing', async () => {
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': { body: payment() },
    });
    const tree = await mount();
    await press(tree, prs.checkout.pay);
    await press(tree, prs.manualPay.choose);
    expect(callsTo(fetchMock).some(c => c.path.endsWith('/proof'))).toBe(false);
    expect(toasts.messages).toEqual([]);
  });

  it('shows the admin’s reason when the payment is refused, and lets the person start again', async () => {
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': {
        body: payment({ status: 'FAILED', receipt_uploaded: true, review_note: 'blurry' }),
      },
    });
    const tree = await mount();
    await press(tree, prs.checkout.pay);
    const text = allText(tree.root);
    expect(text).toContain(prs.manualPay.rejected.replace('{{reason}}', 'blurry'));
    await press(tree, prs.common.retry);
    expect(allText(tree.root)).toContain(prs.checkout.pay); // back to choosing
  });

  it('finishes when the admin confirmed', async () => {
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': { status: 201, body: payment() },
      'GET /hesabpay/payments/pay-1': { body: payment({ status: 'SUCCESS', receipt_uploaded: true }) },
    });
    const tree = await mount();
    await press(tree, prs.checkout.pay);
    expect(allText(tree.root)).toContain(prs.checkout.success);
    expect(allText(tree.root)).toContain(prs.common.done);
  });
});

describe('a gateway payment is unchanged', () => {
  it('still opens the payment page', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    api({
      'GET /hesabpay/pricing': PRICING,
      'POST /hesabpay/payments': {
        status: 201,
        body: payment({ payment_url: 'https://pay.example/1', method: 'GATEWAY', manual: undefined }),
      },
      'GET /hesabpay/payments/pay-1': { body: payment({ payment_url: 'https://pay.example/1', method: 'GATEWAY' }) },
    });
    const tree = await mount();
    await press(tree, prs.checkout.pay);
    expect(open).toHaveBeenCalledWith('https://pay.example/1');
    expect(allText(tree.root)).toContain(prs.checkout.reopen);
  });
});

describe('pickReceipt', () => {
  it('returns the picture’s address and type', async () => {
    chosen('image/jpeg');
    await expect(pickReceipt()).resolves.toEqual({ kind: 'picked', uri: 'file:///receipt.png', contentType: 'image/jpeg' });
  });

  it('tells a cancelled gallery, a wrong file type and a failure apart', async () => {
    await expect(pickReceipt()).resolves.toEqual({ kind: 'cancelled' });
    chosen('image/gif');
    await expect(pickReceipt()).resolves.toEqual({ kind: 'unsupported' });
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({ errorCode: 'permission' });
    await expect(pickReceipt()).resolves.toEqual({ kind: 'failed' });
    (launchImageLibrary as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(pickReceipt()).resolves.toEqual({ kind: 'failed' });
  });
});

describe('the free trial', () => {
  it('has its own message when the trial listings run out', () => {
    const error = new ApiError('http', 403, { code: 'TRIAL_LISTING_LIMIT_REACHED' });
    expect(errorMessage(error, i18next.t.bind(i18next))).toBe(prs.add.trialLimitReached);
  });
});

describe('the wording', () => {
  it('has the same keys and placeholders in Dari and Pashto', () => {
    const keys = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
      );
    expect(keys(ps.manualPay)).toEqual(keys(prs.manualPay));
    expect(keys(ps.manualPay).length).toBeGreaterThan(10);
    expect(ps.manualPay.rejected).toContain('{{reason}}');
    expect(ps.balance.trialText).toContain('{{date}}');
    expect(ps.balance.trialText).toContain('{{used}}');
    expect(ps.balance.trialText).toContain('{{limit}}');
    expect(ps.manualPay.rejected).not.toBe(prs.manualPay.rejected);
  });
});
