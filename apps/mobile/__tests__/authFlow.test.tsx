import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import { toPersianDigits } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import {
  allText,
  callsTo,
  inputLabelled,
  mockApi,
  pressableWith,
  render,
} from '../test-utils';
import { captureToasts } from '../test-utils/toasts';

const fetchMock = jest.fn();
const signIn = jest.fn(async () => {});
let mockAuth: Record<string, unknown> = {};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screens pick it up.
import OtpScreen, { TEST_CODE_TOAST_MS } from '../src/screens/auth/OtpScreen';
import PhoneScreen from '../src/screens/auth/PhoneScreen';

const PHONE = '+93701234567';
const act = ReactTestRenderer.act;
let toasts: ReturnType<typeof captureToasts>;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

const navigation = () => ({
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  getParent: jest.fn(() => ({ canGoBack: () => true, goBack: jest.fn() })),
});

const screen = async <P extends object>(
  Screen: React.ComponentType<P>,
  nav = navigation(),
  params?: object,
) => {
  const props = { navigation: nav, route: { params } } as unknown as P;
  const tree = await render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Screen {...props} />
    </QueryClientProvider>,
  );
  mounted.push(tree);
  return { tree, nav };
};
const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    pressableWith(root, label).props.onPress();
  });
const type = (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  value: string,
) =>
  act(async () => {
    inputLabelled(root, label).props.onChangeText(value);
  });
// A component and the host element it draws both carry the testID, so each name is counted once.
const iconNames = (root: ReactTestRenderer.ReactTestInstance) => [
  ...new Set(
    root
      .findAll(node => typeof node.props.testID === 'string')
      .map(node => node.props.testID as string)
      .filter(id => id.startsWith('icon-')),
  ),
];
const verifyPosts = () =>
  callsTo(fetchMock).filter(
    c => c.method === 'POST' && c.path === '/auth/verify-otp',
  );
const VERIFIED = {
  body: {
    access_token: 't',
    token_type: 'Bearer',
    expires_in: 100,
    is_new_user: false,
    user: { id: 'u1', role: 'USER', phone_number: PHONE },
  },
};
const otpParams = (extra: object = {}) => ({
  phone: PHONE,
  resendAfter: 60,
  ...extra,
});

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  toasts = captureToasts();
  fetchMock.mockReset();
  signIn.mockClear();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedOut', user: null, signIn };
});
afterEach(async () => {
  toasts.restore();
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

describe('the phone screen', () => {
  it('has one way forward: «ارسال کد», with its paper-plane icon, and no «بستن» under it', async () => {
    const { tree } = await screen(PhoneScreen);
    const text = allText(tree.root);
    expect(text).toContain(prs.auth.sendCode);
    expect(text).not.toContain(prs.common.close);
    expect(iconNames(pressableWith(tree.root, prs.auth.sendCode))).toEqual([
      'icon-send',
    ]);
  });
});

describe('the code screen', () => {
  it('keeps «تأیید و ورود» off until all six digits are in, and calls nothing before that', async () => {
    mockApi(fetchMock, { 'POST /auth/verify-otp': VERIFIED });
    const { tree } = await screen(OtpScreen, navigation(), otpParams());
    const verify = () => pressableWith(tree.root, prs.auth.verify);

    expect(verify().props.disabled).toBe(true);
    await type(tree.root, prs.auth.otpLabel, '123');
    expect(verify().props.disabled).toBe(true);
    await type(tree.root, prs.auth.otpLabel, '12345');
    expect(verify().props.disabled).toBe(true);
    await type(tree.root, prs.auth.otpLabel, '123456');
    expect(verify().props.disabled).toBe(false);
    // Taking a digit away switches it off again.
    await type(tree.root, prs.auth.otpLabel, '12345');
    expect(verify().props.disabled).toBe(true);
    expect(verifyPosts()).toHaveLength(0);
  });

  it('accepts the digits typed in Persian and sends them as plain 0-9', async () => {
    mockApi(fetchMock, { 'POST /auth/verify-otp': VERIFIED });
    const nav = navigation();
    const { tree } = await screen(OtpScreen, nav, otpParams());
    await type(tree.root, prs.auth.otpLabel, '۱۲۳ ۴۵۶');
    expect(pressableWith(tree.root, prs.auth.verify).props.disabled).toBe(
      false,
    );
    await press(tree.root, prs.auth.verify);
    await settle();
    expect(verifyPosts()).toHaveLength(1);
    expect(verifyPosts()[0].body).toEqual({
      phone_number: PHONE,
      otp_code: '123456',
    });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('puts a vector icon in each of its buttons', async () => {
    const { tree } = await screen(OtpScreen, navigation(), otpParams());
    expect(iconNames(pressableWith(tree.root, prs.auth.verify))).toEqual([
      'icon-check',
    ]);
    expect(iconNames(pressableWith(tree.root, prs.auth.changeNumber))).toEqual([
      'icon-edit',
    ]);
    const resend = pressableWith(
      tree.root,
      prs.auth.resendIn.split('{{')[0].trim(),
    );
    expect(iconNames(resend)).toEqual(['icon-refresh']);
  });

  it('says a wrong code in a toast and keeps the page as it was', async () => {
    mockApi(fetchMock, {
      'POST /auth/verify-otp': { status: 401, body: { code: 'UNAUTHORIZED' } },
    });
    const { tree } = await screen(OtpScreen, navigation(), otpParams());
    await type(tree.root, prs.auth.otpLabel, '000000');
    await press(tree.root, prs.auth.verify);
    await settle();
    expect(toasts.messages).toEqual([prs.errors.invalidCode]);
    expect(allText(tree.root)).not.toContain(prs.errors.invalidCode);
    expect(signIn).not.toHaveBeenCalled();
  });

  describe('when the server runs without a WhatsApp gateway (test mode)', () => {
    const globals = globalThis as unknown as { __DEV__: boolean };
    const wasDev = globals.__DEV__;
    afterEach(() => {
      globals.__DEV__ = wasDev;
    });

    it('shows the code it was given and fills it in, even in a release build', async () => {
      globals.__DEV__ = false; // a release build: nothing here depends on the debug flag
      mockApi(fetchMock, { 'POST /auth/verify-otp': VERIFIED });
      const { tree } = await screen(
        OtpScreen,
        navigation(),
        otpParams({ devOtp: '654321' }),
      );
      const text = allText(tree.root);
      expect(text).toContain(
        prs.auth.testCode.replace('{{code}}', toPersianDigits('654321')),
      );
      // Already in the boxes, so «تأیید و ورود» is on and a tap signs in with exactly that code.
      expect(pressableWith(tree.root, prs.auth.verify).props.disabled).toBe(
        false,
      );
      await press(tree.root, prs.auth.verify);
      await settle();
      expect(verifyPosts()[0].body).toEqual({
        phone_number: PHONE,
        otp_code: '654321',
      });
    });

    it('also says the code in a toast that stays long enough to read, so a blocked WhatsApp never blocks sign-in', async () => {
      const { tree } = await screen(
        OtpScreen,
        navigation(),
        otpParams({ devOtp: '654321' }),
      );
      expect(allText(tree.root)).toContain(toPersianDigits('654321'));
      const shown = toasts.calls.filter(c =>
        String(c[0]).includes(toPersianDigits('654321')),
      );
      expect(shown).toHaveLength(1);
      expect(shown[0][2]).toBe(TEST_CODE_TOAST_MS);
      expect(TEST_CODE_TOAST_MS).toBeGreaterThanOrEqual(10000);
    });

    it('shows no code toast when the real gateway sent the code', async () => {
      await screen(OtpScreen, navigation(), otpParams());
      expect(toasts.messages).toEqual([]);
    });

    it('shows nothing of the kind when the real gateway sent the code', async () => {
      const { tree } = await screen(OtpScreen, navigation(), otpParams());
      expect(allText(tree.root)).not.toContain(
        prs.auth.testCode.split('{{')[0].trim(),
      );
    });

    it('takes the new code when another one is asked for', async () => {
      mockApi(fetchMock, {
        'POST /auth/send-otp': {
          body: { resend_after: 60, expires_in: 300, dev_otp: '222333' },
        },
      });
      const { tree } = await screen(
        OtpScreen,
        navigation(),
        otpParams({ devOtp: '111444', resendAfter: 0 }),
      );
      await press(tree.root, prs.auth.resend);
      await settle();
      const text = allText(tree.root);
      expect(text).toContain(toPersianDigits('222333'));
      expect(text).not.toContain(toPersianDigits('111444'));
    });
  });
});
