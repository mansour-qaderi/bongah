import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { captureToasts } from '../test-utils/toasts';
import {
  allText,
  flush,
  inputAt,
  jsonResponse,
  pressableWith,
  render,
  typeOptions,
} from '../test-utils';

const fetchMock = jest.fn();
let toasts: ReturnType<typeof captureToasts>;
let mockAuth: { status: string; user: unknown } = {
  status: 'signedOut',
  user: null,
};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screens pick it up.
import PhoneScreen from '../src/screens/auth/PhoneScreen';
import AddPropertyScreen from '../src/screens/property/AddPropertyScreen';

beforeAll(async () => {
  await initI18n();
});

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedOut', user: null };
  toasts = captureToasts();
});

afterEach(() => toasts.restore());

const withQuery = (node: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);

// The screens only use a few navigation methods, so a small fake stands in for the real prop.
const phoneProps = (nav = navigation()) =>
  ({ navigation: nav, route: {} } as unknown as React.ComponentProps<
    typeof PhoneScreen
  >);
const addProps = (nav = navigation()) =>
  ({ navigation: nav, route: {} } as unknown as React.ComponentProps<
    typeof AddPropertyScreen
  >);

const navigation = () => ({
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  getParent: jest.fn(),
  addListener: jest.fn(() => () => undefined),
});

describe('PhoneScreen', () => {
  it('rejects a number the server would reject, without calling the API', async () => {
    const nav = navigation();
    const tree = await render(<PhoneScreen {...phoneProps(nav)} />);
    await ReactTestRenderer.act(async () => {
      inputAt(tree.root, 0).props.onChangeText('12345');
    });
    await ReactTestRenderer.act(async () => {
      pressableWith(tree.root, prs.auth.sendCode).props.onPress();
    });
    expect(toasts.messages).toEqual([prs.auth.invalidPhone]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the canonical +93 number and moves on to the code screen', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { message: 'sent', expires_in: 300, resend_after: 60 }),
    );
    const nav = navigation();
    const tree = await render(<PhoneScreen {...phoneProps(nav)} />);
    await ReactTestRenderer.act(async () => {
      inputAt(tree.root, 0).props.onChangeText('۰۷۰ ۱۲۳ ۴۵۶۷'); // typed with Persian digits
    });
    await ReactTestRenderer.act(async () => {
      pressableWith(tree.root, prs.auth.sendCode).props.onPress();
    });
    await flush();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/auth\/send-otp$/);
    expect(JSON.parse(init.body)).toEqual({ phone_number: '+93701234567' });
    expect(nav.navigate).toHaveBeenCalledWith('Otp', {
      phone: '+93701234567',
      resendAfter: 60,
      devOtp: undefined,
    });
  });

  it('shows a Dari message when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const tree = await render(<PhoneScreen {...phoneProps()} />);
    await ReactTestRenderer.act(async () => {
      inputAt(tree.root, 0).props.onChangeText('0701234567');
    });
    await ReactTestRenderer.act(async () => {
      pressableWith(tree.root, prs.auth.sendCode).props.onPress();
    });
    await flush();
    expect(toasts.messages).toContain(prs.errors.network);
  });
});

describe('AddPropertyScreen', () => {
  const user = {
    id: 'u1',
    role: 'USER',
    phone_number: '+93701234567',
    full_name: null,
    avatar: null,
  };

  it('asks a signed-out visitor to sign in instead of showing the form', async () => {
    const tree = await render(withQuery(<AddPropertyScreen {...addProps()} />));
    expect(allText(tree.root)).toContain(prs.auth.signInRequired);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('lists every property type the API accepts, each as its own row of the type dropdown', async () => {
    mockAuth = { status: 'signedIn', user };
    const tree = await render(withQuery(<AddPropertyScreen {...addProps()} />));
    const labels = (await typeOptions(tree.root)).map(row => row.label);
    // Afghanistan's form: every kind except the four that only the Iranian market has.
    const iranOnly = ['DUPLEX', 'COMMERCIAL', 'LAND_OLD', 'VILLA_GARDEN'];
    for (const [key, label] of Object.entries(prs.propertyType))
      if (iranOnly.includes(key)) expect(labels).not.toContain(label);
      else expect(labels).toContain(label);
    expect(Object.keys(prs.propertyType)).toEqual(
      expect.arrayContaining([
        'SHOP',
        'OFFICE',
        'GARDEN',
        'VILLA',
        'GARAGE',
        'OTHER',
      ]),
    );
  });

  it('groups the form into four titled cards: the place first, then what it is, its price and the description', async () => {
    mockAuth = { status: 'signedIn', user };
    const tree = await render(withQuery(<AddPropertyScreen {...addProps()} />));
    const text = allText(tree.root);
    const order = [
      prs.add.sectionPlace,
      prs.add.sectionBasics,
      prs.add.sectionPrice,
      prs.add.sectionDetails,
    ].map(title => text.indexOf(title));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('validates with the shared schema before calling the API', async () => {
    mockAuth = { status: 'signedIn', user };
    const tree = await render(withQuery(<AddPropertyScreen {...addProps()} />));
    await ReactTestRenderer.act(async () => {
      pressableWith(tree.root, prs.add.submit).props.onPress();
    });
    const text = allText(tree.root);
    // Each empty field says it is needed under itself; there is no all-purpose banner above the form.
    expect(text).not.toContain(prs.add.fixErrors);
    expect(text).not.toContain(prs.errors.validation);
    expect(text).toContain(prs.add.required);
    // The form may ask the server about map credits, but it must not try to publish.
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false);
  });
});
