import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import { formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import { captureToasts } from '../test-utils/toasts';
import {
  propertyRef,
  telUrl,
  whatsappDigits,
  whatsappUrl,
} from '../src/contact/contactLinks';
import {
  allText,
  callsTo,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';
import { mockNavigation } from '../test-utils/navMock';

const fetchMock = jest.fn();
let mockAuth: { status: string; user: unknown } = {
  status: 'signedIn',
  user: null,
};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-navigation/native', () =>
  require('../test-utils/navMock').navigationModule(),
);
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screens pick them up.
import PropertyDetailsScreen from '../src/screens/property/PropertyDetailsScreen';
import Badge from '../src/components/Badge';

const L = '11111111-1111-4111-8111-111111111111';
const viewer = {
  id: 'viewer',
  role: 'USER',
  phone_number: '+93700000000',
  full_name: null,
  avatar: null,
};

const listing = (ownerId = 'seller') => ({
  id: L,
  user_id: ownerId,
  agency_id: null,
  agency_name: null,
  title: 'خانه نو',
  description: 'تازه',
  type: 'HOUSE_HAWILI',
  deal_type: 'SALE',
  price: 1000,
  currency: 'AFGHANI',
  area_sqm: 100,
  bedrooms: 2,
  bathrooms: 1,
  province: 'کابل',
  district: 'شهر نو',
  neighborhood: 'قلعه',
  address: 'سرک',
  lat: null,
  lng: null,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});

const quota = (overrides: Record<string, unknown> = {}) => ({
  free_limit: 3,
  free_used: 0,
  free_remaining: 3,
  credits: 0,
  referral_credits: 0,
  unlimited: false,
  unlimited_reason: null,
  resets_at: '2026-10-14T19:30:00.000Z',
  ...overrides,
});
const SELLER_CONTACT = {
  full_name: 'احمد',
  phone_number: '+93701234567',
  agency_name: null,
};
const locked = (q = quota()) => ({
  unlocked: false,
  is_owner: false,
  contact: null,
  quota: q,
  paid_with: null,
});
const unlocked = (q = quota({ free_used: 1, free_remaining: 2 })) => ({
  unlocked: true,
  is_owner: false,
  contact: SELLER_CONTACT,
  quota: q,
  paid_with: 'FREE_DAILY',
});
const limitReached = (q: ReturnType<typeof quota>) => ({
  status: 403,
  body: { code: 'CONTACT_LIMIT_REACHED', message: 'limit', quota: q },
});

const PRICING = {
  currency: 'AFGHANI',
  subscription: { MONTHLY: 1000, QUARTERLY: 2700, SEMIANNUAL: 5000, YEARLY: 9600 },
  ladder: 50,
  featured_ad: 100,
  map_location: 30,
  featured_ad_days: 7,
  contact_credits: 40,
  contact_credits_per_pack: 10,
};
const PAYMENT = {
  id: 'pay1',
  purpose: 'CONTACT_CREDITS',
  status: 'PENDING',
  amount: 40,
  currency: 'AFGHANI',
  created_at: '2026-10-13T00:00:00Z',
  payment_url: 'https://pay.example/x',
};

const withQuery = (node: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);
const screen = () =>
  withQuery(
    <PropertyDetailsScreen
      {...({
        navigation: mockNavigation,
        route: { params: { id: L } },
      } as unknown as React.ComponentProps<typeof PropertyDetailsScreen>)}
    />,
  );

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    pressableWith(root, label).props.onPress();
  });
const unlockCalls = () =>
  callsTo(fetchMock).filter(
    c => c.method === 'POST' && c.path === `/properties/${L}/contact/unlock`,
  );

const openUrl = jest.fn(async () => true);

beforeAll(async () => {
  await initI18n();
});
let toasts: ReturnType<typeof captureToasts>;
beforeEach(() => {
  toasts = captureToasts();
  fetchMock.mockReset();
  openUrl.mockClear();
  mockNavigation.navigate.mockClear();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user: viewer };
  jest
    .spyOn(require('react-native').Linking, 'openURL')
    .mockImplementation(openUrl);
});
afterEach(async () => {
  toasts.restore();
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

describe('contact links', () => {
  it('builds a tel: link and a wa.me link with the text already typed', () => {
    expect(telUrl('+93701234567')).toBe('tel:+93701234567');
    expect(whatsappDigits('+93 70-123 4567')).toBe('93701234567');
    const url = whatsappUrl('+93701234567', 'سلام #abc');
    expect(url.startsWith('https://wa.me/93701234567?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('سلام #abc');
  });

  it('quotes the first 8 characters of the listing id as its reference', () => {
    expect(propertyRef(L)).toBe('#11111111');
  });
});

describe('PropertyDetailsScreen: contact bar', () => {
  it('shows Call, WhatsApp and Chat, and how many free reveals are left', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: locked() },
    });
    const tree = await render(screen());
    await settle();
    const text = allText(tree.root);
    expect(text).toContain(prs.property.callAction);
    expect(text).toContain(prs.property.whatsappAction);
    expect(text).toContain(prs.property.chatAction);
    expect(text).toContain(
      prs.property.freeRevealsLeft.replace('{{count}}', formatNumber(3, 0)),
    );
  });

  it('reveals the number and dials it', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: locked() },
      [`POST /properties/${L}/contact/unlock`]: { body: unlocked() },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.callAction);
    await settle();

    expect(unlockCalls()).toHaveLength(1);
    // A plain tap never spends a credit.
    expect(unlockCalls()[0].body).toEqual({ use_credit: false });
    expect(openUrl).toHaveBeenCalledWith('tel:+93701234567');
    // The owner's details are shown once revealed.
    expect(allText(tree.root)).toContain('احمد');
  });

  it('opens WhatsApp on the number with the listing title and reference prefilled', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: locked() },
      [`POST /properties/${L}/contact/unlock`]: { body: unlocked() },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.whatsappAction);
    await settle();

    const [url] = openUrl.mock.calls[0] as unknown as [string];
    expect(url.startsWith('https://wa.me/93701234567?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('خانه نو');
    expect(text).toContain('#11111111');
  });

  it('does not reveal again when the number is already unlocked today', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: unlocked() },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.callAction);
    await settle();
    expect(unlockCalls()).toHaveLength(0);
    expect(openUrl).toHaveBeenCalledWith('tel:+93701234567');
  });

  it('opens the in-app chat for the listing without spending a reveal', async () => {
    const conversation = { id: 'c1', property: { id: L } };
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: locked() },
      'POST /chat/conversations': { status: 201, body: conversation },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.chatAction);
    await settle();
    expect(
      callsTo(fetchMock).find(c => c.path === '/chat/conversations')?.body,
    ).toEqual({ property_id: L });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', {
      conversation,
    });
    expect(unlockCalls()).toHaveLength(0);
  });

  it('says so when the phone cannot open the link', async () => {
    openUrl.mockRejectedValueOnce(new Error('no app'));
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: unlocked() },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.callAction);
    await settle();
    expect(toasts.messages).toContain(prs.contact.openFailed);
  });

  it('tells a signed-out visitor to sign in', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
    });
    const tree = await render(screen());
    await settle();
    expect(allText(tree.root)).toContain(prs.property.contactSignIn);
    // The contact status is only asked for when signed in.
    expect(
      callsTo(fetchMock).some(c => c.path === `/properties/${L}/contact`),
    ).toBe(false);
  });

  it("shows no contact bar on the owner's own listing", async () => {
    mockAuth = { status: 'signedIn', user: { ...viewer, id: 'seller' } };
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing('seller') },
    });
    const tree = await render(screen());
    await settle();
    const text = allText(tree.root);
    expect(text).not.toContain(prs.property.callAction);
    expect(text).toContain(prs.property.yourListing);
  });

  it('says unlimited for an agency with perks', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: {
        body: locked(
          quota({ unlimited: true, unlimited_reason: 'AGENCY_SUBSCRIPTION' }),
        ),
      },
    });
    const tree = await render(screen());
    await settle();
    expect(allText(tree.root)).toContain(prs.property.unlimitedReveals);
  });
});

describe('PropertyDetailsScreen: daily limit reached', () => {
  const exhausted = (overrides: Record<string, unknown> = {}) =>
    quota({ free_used: 3, free_remaining: 0, ...overrides });

  it('opens the lock sheet instead of dialling, and offers a held credit', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: {
        body: locked(exhausted({ credits: 2 })),
      },
      [`POST /properties/${L}/contact/unlock`]: limitReached(
        exhausted({ credits: 2, referral_credits: 1 }),
      ),
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { status: 401, body: {} },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.callAction);
    await settle();

    const text = allText(tree.root);
    expect(text).toContain(prs.contact.limitTitle);
    // The day it renews is a Solar Hijri date (15 Oct 2026 is 23 Mizan), never a Gregorian one.
    expect(text).toContain('۲۳ میزان');
    expect(text).not.toMatch(/۲۰۲۶|۲۰۲۶\/۱۰/);
    expect(text).toContain(
      prs.contact.creditsLeft.replace('{{count}}', formatNumber(2, 0)),
    );
    expect(text).toContain(
      prs.contact.referralCreditsLeft.replace('{{count}}', formatNumber(1, 0)),
    );
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('spends one credit only when asked, then does what was tapped', async () => {
    let attempt = 0;
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: {
        body: locked(exhausted({ credits: 2 })),
      },
      [`POST /properties/${L}/contact/unlock`]: () => {
        attempt += 1;
        return attempt === 1
          ? limitReached(exhausted({ credits: 2 }))
          : {
              body: {
                ...unlocked(exhausted({ credits: 1 })),
                paid_with: 'CREDIT',
              },
            };
      },
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { status: 401, body: {} },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.whatsappAction);
    await settle();
    expect(unlockCalls()).toHaveLength(1);
    expect(unlockCalls()[0].body).toEqual({ use_credit: false });

    await press(tree.root, prs.contact.useCredit);
    await settle();
    expect(unlockCalls()).toHaveLength(2);
    expect(unlockCalls()[1].body).toEqual({ use_credit: true });
    // It was WhatsApp that was tapped, so WhatsApp opens (and not the dialler).
    const [url] = openUrl.mock.calls[0] as unknown as [string];
    expect(url.startsWith('https://wa.me/93701234567')).toBe(true);
    // The sheet closes.
    expect(allText(tree.root)).not.toContain(prs.contact.limitTitle);
  });

  it("with no credits, sells a pack at the server's price and starts the HesabPay payment", async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: locked(exhausted()) },
      [`POST /properties/${L}/contact/unlock`]: limitReached(exhausted()),
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { status: 401, body: {} },
      'POST /hesabpay/payments': { status: 201, body: PAYMENT },
      'GET /hesabpay/payments/pay1': { body: PAYMENT },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.callAction);
    await settle();

    const text = allText(tree.root);
    expect(text).not.toContain(prs.contact.useCredit);
    expect(text).toContain(
      prs.contact.buyItem.replace('{{count}}', formatNumber(10, 0)),
    );

    await press(tree.root, prs.contact.buy);
    await settle();
    const started = callsTo(fetchMock).find(
      c => c.path === '/hesabpay/payments' && c.method === 'POST',
    );
    expect(started?.body).toEqual({ purpose: 'CONTACT_CREDITS' });
    expect(openUrl).toHaveBeenCalledWith('https://pay.example/x');
  });

  it('offers the referral screen when invites earn credits', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: locked(exhausted()) },
      [`POST /properties/${L}/contact/unlock`]: limitReached(exhausted()),
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': {
        body: {
          referral_code: 'ABCD2345',
          share_url: null,
          stats: {
            invited_count: 0,
            rewarded_invites: 0,
            max_rewarded_invites: 20,
            contact_credits_per_invite: 2,
            ladder_tokens_available: 0,
            ladder_tokens_earned: 0,
          },
          invited: [],
          rewards: [],
        },
      },
    });
    const tree = await render(screen());
    await settle();
    await press(tree.root, prs.property.callAction);
    await settle();

    await press(
      tree.root,
      prs.contact.inviteFriends.replace('{{count}}', formatNumber(2, 0)),
    );
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Referral');
  });

  it("keeps the bar's allowance line in step with the 403's numbers", async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: { body: listing() },
      [`POST /properties/${L}/view`]: { status: 204 },
      // The page was loaded when 1 free reveal was left; another device used it since.
      [`GET /properties/${L}/contact`]: {
        body: locked(quota({ free_used: 2, free_remaining: 1 })),
      },
      [`POST /properties/${L}/contact/unlock`]: limitReached(exhausted()),
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { status: 401, body: {} },
    });
    const tree = await render(screen());
    await settle();
    expect(allText(tree.root)).toContain(
      prs.property.freeRevealsLeft.replace('{{count}}', formatNumber(1, 0)),
    );
    await press(tree.root, prs.property.callAction);
    await settle();
    expect(allText(tree.root)).toContain(prs.property.noFreeRevealsLeft);
  });
});

describe('PropertyDetailsScreen: layout and the jerib helper', () => {
  const open = async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L}`]: {
        body: { ...listing(), price: 1_200_000, area_sqm: 500 },
      },
      [`POST /properties/${L}/view`]: { status: 204 },
      [`GET /properties/${L}/contact`]: { body: locked() },
    });
    const tree = await render(screen());
    await settle();
    return tree;
  };
  const byId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
    root.findAll(n => n.props.testID === id);

  it('leads with the title, the place and the price with commas, and lists the figures as tiles', async () => {
    const tree = await open();
    const text = allText(tree.root);
    expect(text).toContain('خانه نو');
    expect(text).toContain('۱,۲۰۰,۰۰۰');
    expect(text).toContain('؋');
    expect(text).toContain('شهر نو'); // the place line
    expect(text).toContain(prs.property.specs);
    expect(text).toContain('۵۰۰ متر مربع');
    expect(text).toContain(prs.property.bedrooms);
    expect(text).toContain(prs.property.bathrooms);
    // The title comes before the price, which comes before the specs.
    expect(text.indexOf('خانه نو')).toBeLessThan(text.indexOf('۱,۲۰۰,۰۰۰'));
    expect(text.indexOf('۱,۲۰۰,۰۰۰')).toBeLessThan(
      text.indexOf(prs.property.specs),
    );
  });

  it('shows the deal tag at the top but not the type, which the specs say once', async () => {
    const tree = await open();
    const labels = tree.root
      .findAllByType(Badge)
      .map(badge => badge.props.label as string);
    expect(labels).toContain(prs.dealType.SALE);
    expect(labels).not.toContain(prs.propertyType.HOUSE_HAWILI);
    // The type is in the specs card, once.
    const specs = allText(tree.root).split(prs.property.specs)[1] ?? '';
    expect(specs).toContain(prs.propertyType.HOUSE_HAWILI);
  });

  const toggle = (root: ReactTestRenderer.ReactTestInstance) =>
    byId(root, 'jerib-conversion-toggle').find(
      n => typeof n.props.onPress === 'function',
    )!;

  it('keeps the jerib conversion out of the area row, folded away in a card of its own', async () => {
    const tree = await open();
    const text = allText(tree.root);
    // No info icon beside the area, and no conversion line in the page until the card is opened.
    expect(byId(tree.root, 'jerib-info')).toHaveLength(0);
    expect(text).toContain('۵۰۰ متر مربع');
    expect(text).not.toContain('حدود');
    expect(text).not.toContain('۰٫۲۵');
    expect(byId(tree.root, 'jerib-conversion').length).toBeGreaterThan(0);
    expect(text).toContain(prs.property.areaConversion);
    expect(byId(tree.root, 'jerib-conversion-body')).toHaveLength(0);
  });

  it('opens the conversion card with this listing worked out, and folds it again', async () => {
    const tree = await open();
    await act(async () => toggle(tree.root).props.onPress());
    const text = allText(tree.root);
    expect(byId(tree.root, 'jerib-conversion-body').length).toBeGreaterThan(0);
    expect(text).toContain(prs.property.jeribInfoIntro);
    expect(text).toContain(prs.property.jeribInfoOne); // 1 jerib = 2,000 m²
    expect(text).toContain(prs.property.jeribInfoHectare);
    // 500 m² is a quarter of a jerib.
    expect(text).toContain('۵۰۰ متر مربع، یعنی حدود ۰٫۲۵ جریب');
    await act(async () => toggle(tree.root).props.onPress());
    expect(byId(tree.root, 'jerib-conversion-body')).toHaveLength(0);
  });

  describe('the owner', () => {
    const asOwner = async () => {
      mockAuth = { status: 'signedIn', user: { ...viewer, id: 'seller' } };
      mockApi(fetchMock, {
        [`GET /properties/${L}`]: { body: listing('seller') },
      });
      const tree = await render(screen());
      await settle();
      return tree;
    };

    it('gets a small pencil button next to the bookmark, which opens the listing in the form', async () => {
      const tree = await asOwner();
      const button = byId(tree.root, 'edit-listing').find(
        node => typeof node.props.onPress === 'function',
      );
      expect(button).toBeDefined();
      expect(button?.props.accessibilityLabel).toBe(prs.property.editListing);
      // The same row as the bookmark: one parent holds both.
      const bookmark = byId(tree.root, `bookmark-${L}`).find(
        node => typeof node.props.onPress === 'function',
      );
      expect(bookmark?.parent?.parent).toBe(button?.parent?.parent);
      // Its name is written beside the icon, and the big "ویرایش آگهی" button in the page is gone.
      expect(allText(button as ReactTestRenderer.ReactTestInstance)).toBe(
        prs.my.edit,
      );
      expect(allText(tree.root)).not.toContain(prs.property.editListing);
      await act(async () => button?.props.onPress());
      expect(mockNavigation.navigate).toHaveBeenCalledWith('AddProperty', {
        propertyId: L,
      });
    });

    it('is the only one to see it', async () => {
      const tree = await open();
      expect(byId(tree.root, 'edit-listing')).toHaveLength(0);
      expect(allText(tree.root)).not.toContain(prs.property.editListing);
    });
  });
});
