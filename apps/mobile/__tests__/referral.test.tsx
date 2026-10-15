import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Share, TextInput } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import { formatDate, formatNumber, toPersianDigits } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import {
  allText,
  callsTo,
  inputLabelled,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';

const fetchMock = jest.fn();
const signIn = jest.fn(async () => {});
let mockAuth: Record<string, unknown> = {};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screens pick them up.
import PromotionSheet from '../src/components/PromotionSheet';
import AccountScreen from '../src/screens/account/AccountScreen';
import OtpScreen from '../src/screens/auth/OtpScreen';
import PhoneScreen from '../src/screens/auth/PhoneScreen';
import ProfileSetupScreen from '../src/screens/auth/ProfileSetupScreen';
import ReferralScreen from '../src/screens/referral/ReferralScreen';

const user = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: 'احمد',
  avatar: null,
};
const PHONE = '+93701234567';
const L1 = '11111111-1111-4111-8111-111111111111';
const PRICING = {
  currency: 'AFGHANI',
  subscription: { MONTHLY: 1000, QUARTERLY: 2700, YEARLY: 9600 },
  ladder: 50,
  featured_ad: 100,
  map_location: 30,
  featured_ad_days: 7,
  contact_credits: 40,
  contact_credits_per_pack: 10,
};

const summary = (overrides: Record<string, unknown> = {}) => ({
  referral_code: 'ABCD2345',
  share_url: 'https://bongah.example/invite/ABCD2345',
  stats: {
    invited_count: 3,
    rewarded_invites: 2,
    max_rewarded_invites: 20,
    contact_credits_per_invite: 0,
    ladder_tokens_available: 1,
    ladder_tokens_earned: 2,
  },
  invited: [
    {
      name: 'زرغونه احمدی',
      phone_masked: '+۹۳۷۰••••۵۶۷',
      joined_at: '2026-10-12T08:00:00Z',
      reward_granted: true,
    },
    {
      name: null,
      phone_masked: '+۹۳۷۷••••۹۰۱',
      joined_at: '2026-10-10T08:00:00Z',
      reward_granted: false,
    },
  ],
  rewards: [
    {
      type: 'LADDER_TOKEN',
      reason: 'REFERRER_BONUS',
      amount: 1,
      created_at: '2026-10-12T08:00:00Z',
      used_at: null,
    },
    {
      type: 'LADDER_TOKEN',
      reason: 'REFEREE_BONUS',
      amount: 1,
      created_at: '2026-10-01T08:00:00Z',
      used_at: '2026-10-05T08:00:00Z',
    },
  ],
  ...overrides,
});

const navigation = () => ({
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  getParent: jest.fn(() => ({ canGoBack: () => true, goBack: jest.fn() })),
});
const withQuery = (node: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);
const screenElement = <P extends object>(
  Screen: React.ComponentType<P>,
  nav: ReturnType<typeof navigation> = navigation(),
  params?: object,
) =>
  withQuery(
    <Screen {...({ navigation: nav, route: { params } } as unknown as P)} />,
  );

beforeAll(async () => {
  await initI18n();
});
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});
let shareSpy: jest.SpyInstance;
beforeEach(() => {
  fetchMock.mockReset();
  signIn.mockClear();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user, signIn, updateUser: jest.fn() };
  shareSpy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  shareSpy.mockClear(); // spyOn returns the same spy again, with the previous test's calls
});

const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const act = ReactTestRenderer.act;
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
const posts = (path: string) =>
  callsTo(fetchMock).filter(c => c.method === 'POST' && c.path === path);

describe('ReferralScreen', () => {
  it('shows my code, the figures, the friends who joined and the rewards', async () => {
    mockApi(fetchMock, { 'GET /referrals/me': { body: summary() } });
    const tree = await render(screenElement(ReferralScreen));
    await settle();

    const text = allText(tree.root);
    expect(text).toContain('ABCD2345'); // shown as is, never in Persian digits
    for (const [label, value] of [
      [prs.referral.statInvited, 3],
      [prs.referral.statEarned, 2],
      [prs.referral.statAvailable, 1],
    ] as const) {
      expect(text).toContain(label);
      expect(text).toContain(formatNumber(value, 0));
    }
    // Friends: a name or a fallback, the masked number, the date and whether I got a reward.
    expect(text).toContain('زرغونه احمدی');
    expect(text).toContain('+۹۳۷۰••••۵۶۷');
    expect(text).toContain(prs.referral.unnamedFriend);
    expect(text).toContain('+۹۳۷۷••••۹۰۱');
    expect(text).toContain(
      prs.referral.joinedOn.replace(
        '{{date}}',
        formatDate('2026-10-12T08:00:00Z'),
      ),
    );
    expect(text).toContain(prs.referral.rewardGranted);
    expect(text).toContain(prs.referral.rewardNotGranted);
    // Rewards: what, why, and whether it was used.
    expect(text).toContain(prs.referral.rewardType.LADDER_TOKEN);
    expect(text).toContain(prs.referral.rewardReason.REFERRER_BONUS);
    expect(text).toContain(prs.referral.rewardReason.REFEREE_BONUS);
    expect(text).toContain(prs.referral.available);
    expect(text).toContain(
      prs.referral.usedOn.replace(
        '{{date}}',
        formatDate('2026-10-05T08:00:00Z'),
      ),
    );
    // A token to spend: say where.
    expect(text).toContain(prs.referral.howToUse);
    expect(text).not.toContain(prs.referral.capReached.slice(0, 12));
  });

  it('makes the code selectable so it can be copied', async () => {
    mockApi(fetchMock, { 'GET /referrals/me': { body: summary() } });
    const tree = await render(screenElement(ReferralScreen));
    await settle();
    const code = tree.root.findAll(
      n => n.props.selectable === true && allText(n).includes('ABCD2345'),
    );
    expect(code.length).toBeGreaterThan(0);
  });

  it('opens the share sheet with the invite link and the code', async () => {
    mockApi(fetchMock, { 'GET /referrals/me': { body: summary() } });
    const tree = await render(screenElement(ReferralScreen));
    await settle();

    await press(tree.root, prs.referral.share);
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const { message } = shareSpy.mock.calls[0][0];
    expect(message).toBe(
      prs.referral.shareMessageWithLink
        .replace('{{url}}', 'https://bongah.example/invite/ABCD2345')
        .replace('{{code}}', 'ABCD2345'),
    );
  });

  it('shares the code alone when the server has no invite link', async () => {
    mockApi(fetchMock, {
      'GET /referrals/me': { body: summary({ share_url: null }) },
    });
    const tree = await render(screenElement(ReferralScreen));
    await settle();

    await press(tree.root, prs.referral.share);
    expect(shareSpy.mock.calls[0][0].message).toBe(
      prs.referral.shareMessage.replace('{{code}}', 'ABCD2345'),
    );
  });

  it('says so when the share sheet cannot open, and does not when the person just closes it', async () => {
    mockApi(fetchMock, { 'GET /referrals/me': { body: summary() } });
    const tree = await render(screenElement(ReferralScreen));
    await settle();

    shareSpy.mockResolvedValueOnce({ action: Share.dismissedAction });
    await press(tree.root, prs.referral.share);
    expect(allText(tree.root)).not.toContain(prs.referral.shareFailed);

    shareSpy.mockRejectedValueOnce(new Error('no share target'));
    await press(tree.root, prs.referral.share);
    expect(allText(tree.root)).toContain(prs.referral.shareFailed);
  });

  it('explains that further invites earn nothing once the limit is reached', async () => {
    mockApi(fetchMock, {
      'GET /referrals/me': {
        body: summary({
          stats: {
            invited_count: 25,
            rewarded_invites: 20,
            max_rewarded_invites: 20,
            contact_credits_per_invite: 0,
            ladder_tokens_available: 0,
            ladder_tokens_earned: 20,
          },
        }),
      },
    });
    const tree = await render(screenElement(ReferralScreen));
    await settle();
    const text = allText(tree.root);
    expect(text).toContain(
      prs.referral.capReached.replace('{{max}}', formatNumber(20, 0)),
    );
    expect(text).not.toContain(prs.referral.howToUse); // nothing to spend
  });

  it('shows the code and empty lists to someone nobody has invited yet', async () => {
    mockApi(fetchMock, {
      'GET /referrals/me': {
        body: summary({
          stats: {
            invited_count: 0,
            rewarded_invites: 0,
            max_rewarded_invites: 20,
            contact_credits_per_invite: 0,
            ladder_tokens_available: 0,
            ladder_tokens_earned: 0,
          },
          invited: [],
          rewards: [],
        }),
      },
    });
    const tree = await render(screenElement(ReferralScreen));
    await settle();
    const text = allText(tree.root);
    expect(text).toContain('ABCD2345');
    expect(text).toContain(prs.referral.invitedEmpty);
    expect(text).toContain(prs.referral.rewardsEmpty);
    expect(pressableWith(tree.root, prs.referral.share)).toBeTruthy();
  });

  it('shows a failure with a way to retry', async () => {
    mockApi(fetchMock, { 'GET /referrals/me': { status: 500, body: {} } });
    const tree = await render(screenElement(ReferralScreen));
    await settle();
    expect(allText(tree.root)).toContain(prs.errors.unknown);
    expect(pressableWith(tree.root, prs.common.retry)).toBeTruthy();
  });

  it('asks a signed-out visitor to sign in, without calling the API', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, {});
    const nav = navigation();
    const tree = await render(screenElement(ReferralScreen, nav));
    await settle();
    expect(allText(tree.root)).toContain(prs.referral.signInHint);
    expect(fetchMock).not.toHaveBeenCalled();
    await press(tree.root, prs.auth.signIn);
    expect(nav.navigate).toHaveBeenCalledWith('Auth');
  });
});

describe('AccountScreen invite button', () => {
  it('opens the referral screen', async () => {
    const nav = navigation();
    const tree = await render(screenElement(AccountScreen, nav));
    await press(tree.root, prs.account.invite);
    expect(nav.navigate).toHaveBeenCalledWith('Referral');
  });

  it('is not shown to a signed-out visitor', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const tree = await render(screenElement(AccountScreen));
    expect(allText(tree.root)).not.toContain(prs.account.invite);
  });
});

describe('PhoneScreen referral code field', () => {
  const SENT = { body: { resend_after: 60, expires_in: 300 } };

  it('is optional: nothing typed means nothing sent along', async () => {
    mockApi(fetchMock, { 'POST /auth/send-otp': SENT });
    const nav = navigation();
    const tree = await render(screenElement(PhoneScreen, nav));
    await type(tree.root, prs.auth.phoneLabel, '0701234567');
    await press(tree.root, prs.auth.sendCode);
    await settle();

    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.navigate.mock.calls[0][1]).not.toHaveProperty('referralCode');
  });

  it('passes the code on to the code screen in canonical form', async () => {
    mockApi(fetchMock, { 'POST /auth/send-otp': SENT });
    const nav = navigation();
    const tree = await render(screenElement(PhoneScreen, nav));
    await type(tree.root, prs.auth.phoneLabel, '0701234567');
    await type(tree.root, prs.auth.referralLabel, ' abcd-2345 ');
    await press(tree.root, prs.auth.sendCode);
    await settle();

    expect(nav.navigate).toHaveBeenCalledWith('Otp', {
      phone: PHONE,
      resendAfter: 60,
      devOtp: undefined,
      referralCode: 'ABCD2345',
    });
    // The invite code is never part of the SMS request.
    expect(posts('/auth/send-otp')[0].body).toEqual({ phone_number: PHONE });
  });

  it('refuses something that cannot be a code before sending any SMS', async () => {
    mockApi(fetchMock, { 'POST /auth/send-otp': SENT });
    const nav = navigation();
    const tree = await render(screenElement(PhoneScreen, nav));
    await type(tree.root, prs.auth.phoneLabel, '0701234567');
    await type(tree.root, prs.auth.referralLabel, 'ABC');
    await press(tree.root, prs.auth.sendCode);
    await settle();

    expect(allText(tree.root)).toContain(
      prs.auth.referralInvalidFormat.replace('{{length}}', toPersianDigits(8)),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('shows both problems at once when the phone and the code are wrong', async () => {
    mockApi(fetchMock, {});
    const tree = await render(screenElement(PhoneScreen));
    await type(tree.root, prs.auth.phoneLabel, '123');
    await type(tree.root, prs.auth.referralLabel, 'ABC');
    await press(tree.root, prs.auth.sendCode);
    const text = allText(tree.root);
    expect(text).toContain(prs.auth.invalidPhone);
    expect(text).toContain(
      prs.auth.referralInvalidFormat.replace('{{length}}', toPersianDigits(8)),
    );
  });

  it('is typed left-to-right', async () => {
    const tree = await render(screenElement(PhoneScreen));
    const field = tree.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === prs.auth.referralLabel)!;
    expect(JSON.stringify(field.props.style)).toContain('ltr');
    expect(field.props.autoCapitalize).toBe('characters');
  });
});

describe('OtpScreen with an invite code', () => {
  const params = (extra: object = {}) => ({
    phone: PHONE,
    resendAfter: 0,
    ...extra,
  });
  const verifyBody = (n = 0) => posts('/auth/verify-otp')[n].body;
  const VERIFIED = (referralApplied: boolean, isNew = true) => ({
    body: {
      access_token: 't',
      token_type: 'Bearer',
      expires_in: 100,
      is_new_user: isNew,
      referral_applied: referralApplied,
      user,
    },
  });
  const enterCode = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await type(tree.root, prs.auth.otpLabel, '123456');
    await press(tree.root, prs.auth.verify);
    await settle();
  };

  it('sends the invite code with the SMS code and tells the next screen it was used', async () => {
    mockApi(fetchMock, { 'POST /auth/verify-otp': VERIFIED(true) });
    const nav = navigation();
    const tree = await render(
      screenElement(OtpScreen, nav, params({ referralCode: 'ABCD2345' })),
    );
    await enterCode(tree);

    expect(verifyBody()).toEqual({
      phone_number: PHONE,
      otp_code: '123456',
      referral_code: 'ABCD2345',
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('ProfileSetup', {
      referralApplied: true,
    });
  });

  it('sends no invite code field when there is none, and goes on as before', async () => {
    mockApi(fetchMock, { 'POST /auth/verify-otp': VERIFIED(false) });
    const nav = navigation();
    const tree = await render(screenElement(OtpScreen, nav, params()));
    await enterCode(tree);

    expect(verifyBody()).toEqual({ phone_number: PHONE, otp_code: '123456' });
    expect(nav.replace).toHaveBeenCalledWith('ProfileSetup');
  });

  it('closes the sign-in for a returning user whose invite code was ignored', async () => {
    mockApi(fetchMock, { 'POST /auth/verify-otp': VERIFIED(false, false) });
    const nav = navigation();
    const tree = await render(
      screenElement(OtpScreen, nav, params({ referralCode: 'ABCD2345' })),
    );
    await enterCode(tree);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('lets the person carry on without the code when it does not exist, using the same SMS code', async () => {
    let calls = 0;
    mockApi(fetchMock, {
      'POST /auth/verify-otp': () =>
        ++calls === 1
          ? { status: 400, body: { code: 'INVALID_REFERRAL_CODE' } }
          : VERIFIED(false),
    });
    const nav = navigation();
    const tree = await render(
      screenElement(OtpScreen, nav, params({ referralCode: 'ZZZZ2222' })),
    );
    await enterCode(tree);

    // Not signed in, not a generic "wrong code" message: the invite code is what failed.
    expect(signIn).not.toHaveBeenCalled();
    const text = allText(tree.root);
    expect(text).toContain(prs.auth.referralInvalid);
    expect(text).not.toContain(prs.errors.invalidCode);

    await press(tree.root, prs.auth.continueWithoutReferral);
    await settle();
    expect(posts('/auth/verify-otp')).toHaveLength(2);
    expect(verifyBody(1)).toEqual({ phone_number: PHONE, otp_code: '123456' });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('ProfileSetup');
    expect(allText(tree.root)).not.toContain(prs.auth.referralInvalid);
  });

  it('still reports a wrong SMS code as a wrong SMS code', async () => {
    mockApi(fetchMock, { 'POST /auth/verify-otp': { status: 401, body: {} } });
    const tree = await render(
      screenElement(
        OtpScreen,
        navigation(),
        params({ referralCode: 'ABCD2345' }),
      ),
    );
    await enterCode(tree);
    const text = allText(tree.root);
    expect(text).toContain(prs.errors.invalidCode);
    expect(text).not.toContain(prs.auth.continueWithoutReferral);
  });
});

describe('ProfileSetupScreen', () => {
  it('welcomes a person who joined with an invite code', async () => {
    const tree = await render(
      screenElement(ProfileSetupScreen, navigation(), {
        referralApplied: true,
      }),
    );
    expect(allText(tree.root)).toContain(prs.auth.referralApplied);
  });

  it('shows nothing about invites otherwise', async () => {
    const tree = await render(screenElement(ProfileSetupScreen));
    expect(allText(tree.root)).not.toContain(prs.auth.referralApplied);
  });
});

describe('PromotionSheet free ladder tokens', () => {
  const property = {
    id: L1,
    title: 'خانه حویلی',
    is_featured: false,
    featured_until: null,
  };
  const open = () =>
    render(
      withQuery(<PromotionSheet property={property} onClose={jest.fn()} />),
    );
  const REDEEMED = (left: number) => ({
    body: {
      property_id: L1,
      laddered_at: '2026-10-13T10:00:00Z',
      ladder_tokens_available: left,
    },
  });

  it('offers a free ladder when I have one, and spends it on this listing', async () => {
    mockApi(fetchMock, {
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { body: summary() },
      'POST /rewards/ladder-tokens/redeem': REDEEMED(0),
    });
    const tree = await open();
    await settle();
    expect(allText(tree.root)).toContain(
      prs.promotion.freeTokens.replace('{{count}}', formatNumber(1, 0)),
    );

    await press(tree.root, prs.promotion.useFreeToken);
    await settle();
    expect(posts('/rewards/ladder-tokens/redeem')[0].body).toEqual({
      property_id: L1,
    });
    // No payment was started.
    expect(posts('/hesabpay/payments')).toHaveLength(0);
    expect(allText(tree.root)).toContain(
      prs.promotion.freeTokenDone.replace('{{count}}', formatNumber(0, 0)),
    );
    // Listing lists and the referral figures are refreshed.
    expect(
      callsTo(fetchMock).filter(c => c.path === '/referrals/me').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('does not offer it when I have none', async () => {
    mockApi(fetchMock, {
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': {
        body: summary({
          stats: { ...summary().stats, ladder_tokens_available: 0 },
        }),
      },
    });
    const tree = await open();
    await settle();
    const text = allText(tree.root);
    expect(text).not.toContain(prs.promotion.useFreeToken);
    expect(text).toContain(prs.checkout.pay); // the paid way is unchanged
  });

  it('does not offer it for a featured ad: a free ladder is only a ladder', async () => {
    mockApi(fetchMock, {
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { body: summary() },
    });
    const tree = await open();
    await settle();
    await press(tree.root, prs.checkout.featured);
    expect(allText(tree.root)).not.toContain(prs.promotion.useFreeToken);
    await press(tree.root, prs.checkout.ladder);
    expect(allText(tree.root)).toContain(prs.promotion.useFreeToken);
  });

  it('still lets me pay when the referral figures cannot be loaded', async () => {
    mockApi(fetchMock, {
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { status: 500, body: {} },
    });
    const tree = await open();
    await settle();
    expect(allText(tree.root)).not.toContain(prs.promotion.useFreeToken);
    expect(pressableWith(tree.root, prs.checkout.pay)).toBeTruthy();
  });

  it('explains when the token was already spent elsewhere', async () => {
    mockApi(fetchMock, {
      'GET /hesabpay/pricing': { body: PRICING },
      'GET /referrals/me': { body: summary() },
      'POST /rewards/ladder-tokens/redeem': {
        status: 409,
        body: { code: 'NO_LADDER_TOKEN' },
      },
    });
    const tree = await open();
    await settle();
    await press(tree.root, prs.promotion.useFreeToken);
    await settle();
    expect(allText(tree.root)).toContain(prs.referral.noToken);
    expect(allText(tree.root)).not.toContain(
      prs.promotion.freeTokenDone.slice(0, 10),
    );
  });
});
