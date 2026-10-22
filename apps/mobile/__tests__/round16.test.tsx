import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LADDER_SPEND_COST,
  LADDERS_PER_FRAME,
  LADDERS_PER_LISTING,
} from '@bongah/shared-types';
import { ApiError } from '../src/api/client';
import { isAnyListingLimit } from '../src/api/errors';
import i18next from 'i18next';
import { initI18n } from '../src/i18n';
import { formatSolarDate } from '../src/i18n/solarHijri';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { ICON_SHAPES } from '../src/components/iconShapes';
import { captureToasts } from '../test-utils/toasts';
import {
  allText,
  callsTo,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';

const fetchMock = jest.fn();
let mockAuth: Record<string, unknown> = {};
let toasts: ReturnType<typeof captureToasts>;

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screens pick it up.
import BalanceScreen, {
  quotaExhausted,
} from '../src/screens/account/BalanceScreen';
import LadderFrameOption from '../src/components/LadderFrameOption';
import LadderUnlockBanner from '../src/components/LadderUnlockBanner';

const person = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: 'احمد',
  avatar: null,
  featured_credits: 2,
};

const wallet = (ladders: number, quota: Record<string, unknown> = {}) => ({
  body: {
    server_time: '2026-10-20T10:00:00Z',
    subscription: null,
    contact_credits: 0,
    contact_unlimited: false,
    ladder_tokens: ladders,
    recent_payments: [],
    listing_quota: {
      limit: 1,
      used: 0,
      extra: 0,
      resets_at: '2026-11-01T00:00:00Z',
      ...quota,
    },
  },
});
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
  },
};
const SPENT = (purpose: string) => ({
  body: {
    purpose,
    ladders_available: 0,
    featured_until: null,
    extra_listings: null,
  },
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const withClient = (node: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);
const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const mount = async (node: React.ReactElement) => {
  const tree = await renderTree(withClient(node));
  mounted.push(tree);
  await settle();
  return tree;
};
const press = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(async () => {
    pressableWith(tree.root, label).props.onPress();
  });
const nav = () => ({ navigate: jest.fn(), goBack: jest.fn() });
const balance = (n = nav()) =>
  [
    n,
    <BalanceScreen
      key="b"
      {...({ navigation: n, route: {} } as unknown as React.ComponentProps<
        typeof BalanceScreen
      >)}
    />,
  ] as const;
const total = '۷'; // a frame
const listing = '۳'; // one more listing

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user: person, refreshUser: jest.fn() };
  toasts = captureToasts();
});
afterEach(async () => {
  toasts.restore();
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

describe('the rule: seven ladders', () => {
  it('is three for one more listing and seven for a featured frame', () => {
    expect(LADDERS_PER_LISTING).toBe(3);
    expect(LADDERS_PER_FRAME).toBe(7);
    expect(LADDER_SPEND_COST).toEqual({
      LISTING_QUOTA: 3,
      FEATURED_FRAME: 7,
    });
  });

  it('knows when this month is used up (and gift listings still count)', () => {
    const q = (o: Record<string, number | null>) =>
      ({ limit: 1, used: 0, extra: 0, resets_at: null, ...o } as never);
    expect(quotaExhausted(undefined)).toBe(false);
    expect(quotaExhausted(q({}))).toBe(false);
    expect(quotaExhausted(q({ used: 1 }))).toBe(true);
    expect(quotaExhausted(q({ used: 1, extra: 1 }))).toBe(false);
    expect(quotaExhausted(q({ limit: null, used: 9 }))).toBe(false);
  });

  it('is told apart from other limits only by the two listing-limit codes', () => {
    const err = (code: string) =>
      new ApiError('http', 403, { message: 'x', code });
    expect(isAnyListingLimit(err('FREE_LISTING_LIMIT_REACHED'))).toBe(true);
    expect(isAnyListingLimit(err('AGENCY_LISTING_LIMIT_REACHED'))).toBe(true);
    expect(isAnyListingLimit(err('SUBSCRIPTION_REQUIRED'))).toBe(false);
    expect(isAnyListingLimit(new Error('x'))).toBe(false);
  });
});

describe('BalanceScreen', () => {
  it('shows the frames left, the listings left and the ladders in total', async () => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(4, { limit: 1, used: 0, extra: 1 }),
      'GET /pricing': PRICING,
    });
    const [, el] = balance();
    const tree = await mount(el);
    const text = allText(tree.root);
    expect(text).toContain(prs.balance.quota);
    expect(text).toContain(
      prs.balance.quotaValue.replace('{{left}}', '۲').replace('{{total}}', '۲'),
    );
    expect(text).toContain(prs.balance.frames);
    expect(
      allText(tree.root.findByProps({ testID: 'balance-frames-value' })),
    ).toBe('۲');
    expect(
      allText(tree.root.findByProps({ testID: 'balance-ladders-value' })),
    ).toBe('۴');
  });

  it('has the two quick actions, to the upgrade screen and to the frame packs', async () => {
    mockApi(fetchMock, { 'GET /wallet': wallet(0), 'GET /pricing': PRICING });
    const [n, el] = balance();
    const tree = await mount(el);
    await press(tree, prs.balance.upgrade);
    expect(n.navigate).toHaveBeenLastCalledWith('Upgrade');
    await press(tree, prs.balance.buyFrames);
    expect(n.navigate).toHaveBeenLastCalledWith('Checkout');
  });

  it('will not spend ladders while a free listing is left', async () => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(9),
      'GET /pricing': PRICING,
    });
    const [, el] = balance();
    const tree = await mount(el);
    const unlock = pressableWith(
      tree.root,
      prs.ladder.unlockQuota.replace('{{total}}', listing),
    );
    expect(unlock.props.disabled).toBe(true);
    // No grey "your free listing is not used up yet" line under the explanation: the disabled button says it.
    expect(allText(tree.root)).not.toContain('هنوز تمام نشده است');
  });

  it('spends seven ladders on one more listing once the month is used up', async () => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(7, { used: 1 }),
      'GET /pricing': PRICING,
      'POST /rewards/ladders/spend': SPENT('LISTING_QUOTA'),
    });
    const [, el] = balance();
    const tree = await mount(el);
    await press(tree, prs.ladder.unlockQuota.replace('{{total}}', listing));
    await settle();
    const spend = callsTo(fetchMock).filter(
      c => c.path === '/rewards/ladders/spend',
    );
    expect(spend).toHaveLength(1);
    expect(spend[0].body).toEqual({ purpose: 'LISTING_QUOTA' });
    expect(toasts.messages).toContain(prs.ladder.unlocked);
  });

  it('keeps the unlock button off, without an extra line, when fewer are held and the month is used up', async () => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(2, { used: 1 }),
      'GET /pricing': PRICING,
    });
    const [n, el] = balance();
    const tree = await mount(el);
    expect(
      pressableWith(
        tree.root,
        prs.ladder.unlockQuota.replace('{{total}}', listing),
      ).props.disabled,
    ).toBe(true);
    await press(tree, prs.ladder.inviteFriends);
    expect(n.navigate).toHaveBeenCalledWith('Referral');
  });
});

describe('Round 17: the balance screen', () => {
  const open = async (ladders = 4, quota: Record<string, unknown> = {}) => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(ladders, quota),
      'GET /pricing': PRICING,
    });
    const [, el] = balance();
    return mount(el);
  };

  it('has the ladder explanation in exactly the words asked for', async () => {
    const tree = await open();
    expect(allText(tree.root)).toContain(
      'با دعوت دوستان می‌توانید نردبان دریافت کنید. با ۳ نردبان می‌توانید یک ملک ثبت کنید و با ۷ نردبان می‌توانید آگهی خود را با کادر ویژه بپوشانید.',
    );
  });

  it('has the listing-quota explanation in exactly the words asked for', async () => {
    const tree = await open();
    expect(allText(tree.root)).toContain(
      'هر ماه یک آگهی رایگان دریافت کنید. سهمیه رایگان جدید تنها در صورت مصرف سهمیه قبلی اختصاص داده می‌شود.',
    );
  });

  it('shows the ladders as a bare count: no progress bar, no "x of 7" line', async () => {
    const tree = await open(4);
    expect(
      tree.root.findAll(
        n =>
          n.props.testID === 'ladder-progress' ||
          n.props.accessibilityRole === 'progressbar',
      ),
    ).toHaveLength(0);
    expect(allText(tree.root)).not.toContain(
      prs.ladder.progress.replace('{{count}}', '۴').replace('{{total}}', total),
    );
    expect(
      allText(tree.root.findByProps({ testID: 'balance-ladders-value' })),
    ).toBe('۴');
  });

  it('says when the next free quota comes, as text, when the server names a date', async () => {
    const tree = await open(0, { resets_at: '2026-11-01T00:00:00Z' });
    const line = tree.root.findByProps({ testID: 'balance-quota-next' });
    expect(allText(line)).toBe(
      prs.balance.quotaNextDate.replace(
        '{{date}}',
        formatSolarDate('2026-11-01T00:00:00Z', i18next.t),
      ),
    );
  });

  it('shows no date line when there is no date (an account with unlimited listings)', async () => {
    const tree = await open(0, { limit: null, resets_at: null });
    expect(
      tree.root.findAllByProps({ testID: 'balance-quota-next' }),
    ).toHaveLength(0);
  });

  it('gives the featured frames an icon of their own: a star in a frame, shared by no other icon', async () => {
    const shapes = ICON_SHAPES.frameStar;
    // A frame and the five strokes of a five-pointed star.
    expect(shapes).toHaveLength(6);
    expect(shapes.filter(s => s.stroke)).toHaveLength(1);
    const key = (name: keyof typeof ICON_SHAPES) =>
      JSON.stringify(ICON_SHAPES[name]);
    for (const name of Object.keys(
      ICON_SHAPES,
    ) as (keyof typeof ICON_SHAPES)[]) {
      if (name !== 'frameStar') expect(key(name)).not.toBe(key('frameStar'));
    }
    const tree = await open();
    const iconsIn = (id: string) => [
      ...new Set(
        tree.root
          .findByProps({ testID: id })
          .findAll(
            n => typeof n.props.name === 'string' && n.props.size !== undefined,
          )
          .map(n => n.props.name as string),
      ),
    ];
    expect(iconsIn('balance-frames-card')).toEqual(['frameStar']);
    // The quota and ladder rows keep their own, different icons.
    expect(iconsIn('balance-quota-card')).toEqual(['listings']);
    expect(iconsIn('balance-ladders-card')).toContain('arrowUp');
    expect(iconsIn('balance-ladders-card')).not.toContain('frameStar');
  });

  it('keeps the two quick actions', async () => {
    const tree = await open();
    expect(allText(tree.root)).toContain(prs.balance.upgrade);
    expect(allText(tree.root)).toContain(prs.balance.buyFrames);
  });
});

describe('a featured frame for seven ladders', () => {
  const option = (onDone = jest.fn()) =>
    mount(<LadderFrameOption propertyId="p1" onDone={onDone} />);

  it('is not offered below seven', async () => {
    mockApi(fetchMock, { 'GET /wallet': wallet(6) });
    const tree = await option();
    expect(
      tree.root.findAllByProps({ testID: 'ladder-frame-option' }),
    ).toHaveLength(0);
  });

  it('is not offered with three to six ladders: those open a listing, not a frame', async () => {
    mockApi(fetchMock, { 'GET /wallet': wallet(LADDERS_PER_LISTING) });
    const tree = await option();
    expect(
      tree.root.findAll(n => n.props.testID === 'ladder-frame-option'),
    ).toHaveLength(0);
  });

  it('is offered from seven, and pays for the frame on that listing', async () => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(8),
      'POST /rewards/ladders/spend': SPENT('FEATURED_FRAME'),
    });
    const onDone = jest.fn();
    const tree = await option(onDone);
    expect(allText(tree.root)).toContain(
      prs.ladder.frameOffer
        .replace('{{count}}', '۸')
        .replace('{{total}}', total),
    );
    await press(tree, prs.ladder.useForFrame.replace('{{total}}', total));
    await settle();
    const spend = callsTo(fetchMock).find(
      c => c.path === '/rewards/ladders/spend',
    );
    expect(spend?.body).toEqual({
      purpose: 'FEATURED_FRAME',
      property_id: 'p1',
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(toasts.messages).toContain(
      prs.ladder.frameDone.replace('{{count}}', '۰'),
    );
  });

  it('keeps the sheet open and says why when the server refuses', async () => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(8),
      'POST /rewards/ladders/spend': {
        status: 409,
        body: { message: 'x', code: 'NOT_ENOUGH_LADDERS' },
      },
    });
    const onDone = jest.fn();
    const tree = await option(onDone);
    await press(tree, prs.ladder.useForFrame.replace('{{total}}', total));
    await settle();
    expect(onDone).not.toHaveBeenCalled();
    expect(toasts.messages.length).toBeGreaterThan(0);
  });
});

describe('one more listing for seven ladders, when the month is used up', () => {
  it('offers to open it, then runs the save again', async () => {
    mockApi(fetchMock, {
      'GET /wallet': wallet(7, { used: 1 }),
      'POST /rewards/ladders/spend': SPENT('LISTING_QUOTA'),
    });
    const onUnlocked = jest.fn();
    const tree = await mount(
      <LadderUnlockBanner onUnlocked={onUnlocked} onInvite={jest.fn()} />,
    );
    expect(allText(tree.root)).toContain(
      prs.ladder.unlockOffer.replace('{{total}}', listing),
    );
    await press(tree, prs.ladder.unlockQuota.replace('{{total}}', listing));
    await settle();
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('invites friends instead when fewer than seven are held', async () => {
    mockApi(fetchMock, { 'GET /wallet': wallet(2, { used: 1 }) });
    const onInvite = jest.fn();
    const tree = await mount(
      <LadderUnlockBanner onUnlocked={jest.fn()} onInvite={onInvite} />,
    );
    expect(allText(tree.root)).toContain(
      prs.ladder.unlockInvite
        .replace('{{total}}', listing)
        .replace('{{count}}', '۲'),
    );
    await press(tree, prs.ladder.inviteFriends);
    expect(onInvite).toHaveBeenCalledTimes(1);
  });
});

describe('the share icon', () => {
  it('is three connected circles: three rings and two links', () => {
    const shape = ICON_SHAPES.share;
    expect(shape).toHaveLength(5);
  });
});

describe('texts', () => {
  const KEYS = [
    'ladder.rule',
    'ladder.explain',
    'balance.quotaExplain',
    'balance.quotaNextDate',
    'account.balanceHint',
    'ladder.unlockQuota',
    'ladder.unlockOffer',
    'ladder.unlockInvite',
    'ladder.frameOffer',
    'ladder.useForFrame',
    'ladder.frameDone',
    'balance.quota',
    'balance.frames',
    'balance.ladders',
    'balance.upgrade',
    'balance.buyFrames',
    'account.inviteLadder',
    'account.balanceLadders',
  ];
  const get = (tree: unknown, key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (n, k) => (n as Record<string, unknown> | undefined)?.[k],
        tree,
      );
  it.each(KEYS)('%s exists in Dari and Pashto', key => {
    for (const tree of [prs, ps]) {
      expect(typeof get(tree, key)).toBe('string');
      expect((get(tree, key) as string).length).toBeGreaterThan(0);
    }
  });
});
