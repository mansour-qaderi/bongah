import React from 'react';
import { Share, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { launchImageLibrary } from 'react-native-image-picker';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import {
  allText,
  inputLabelled,
  mockApi,
  render as renderTree,
} from '../test-utils';

const fetchMock = jest.fn();
const mockUpdateUser = jest.fn();
let mockUser: Record<string, unknown> | null = null;

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, updateUser: mockUpdateUser }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the components pick it up.
import Button from '../src/components/Button';
import EditProfileSheet from '../src/components/EditProfileSheet';
import ListingCard from '../src/components/ListingCard';
import OtpInput, { cleanOtp } from '../src/components/OtpInput';
import PropertyCard from '../src/components/PropertyCard';

declare const __dirname: string;

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه سه اتاقه در شهر زرنج',
  description: '',
  type: 'HOUSE_HAWILI',
  deal_type: 'SALE',
  price: 1200000,
  currency: 'AFGHANI',
  area_sqm: 253,
  bedrooms: 3,
  bathrooms: 2,
  province: 'nimroz',
  district: 'زرنج',
  neighborhood: null,
  address: '',
  lat: null,
  lng: null,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  ...overrides,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const styleOf = (node: ReactTestRenderer.ReactTestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const hosts = (
  root: ReactTestRenderer.ReactTestInstance,
  match: (node: ReactTestRenderer.ReactTestInstance) => boolean,
) => root.findAll(node => typeof node.type === 'string' && match(node));
/** The (host) button whose text is exactly `label`, or whose accessibility label starts with it. */
const buttonNamed = (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) => {
  const found = hosts(
    root,
    n =>
      n.props.accessibilityRole === 'button' &&
      (String(n.props.accessibilityLabel ?? '').startsWith(label) ||
        allText(n).trim() === label),
  )[0];
  if (!found) throw new Error(`No button "${label}"`);
  return found;
};
const tap = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  ReactTestRenderer.act(async () => {
    buttonNamed(root, label).props.onPress?.();
    // The host view of a Pressable forwards presses through onClick in the test renderer.
    if (!buttonNamed(root, label).props.onPress) {
      buttonNamed(root, label).props.onClick?.();
    }
  });
const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  mockUpdateUser.mockReset();
  (launchImageLibrary as jest.Mock).mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(async () => {
  jest.restoreAllMocks();
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

// ───────────────────────────────── OtpInput ─────────────────────────────────

describe('OtpInput', () => {
  const otp = (value: string, onChange = jest.fn(), invalid = false) =>
    show(
      <OtpInput
        label={prs.auth.otpLabel}
        length={6}
        value={value}
        onChange={onChange}
        invalid={invalid}
      />,
    ).then(tree => ({ tree, onChange }));
  const boxes = (tree: ReactTestRenderer.ReactTestRenderer) =>
    hosts(tree.root, n => /^otp-box-\d$/.test(String(n.props.testID ?? '')));

  it('draws one box per digit and shows what has been typed, in Persian digits', async () => {
    const { tree } = await otp('123');
    expect(boxes(tree)).toHaveLength(6);
    expect(allText(tree.root)).toBe('۱ ۲ ۳');
  });

  it('keeps the digits of whatever arrives: a pasted code with spaces, Persian digits or text around it', () => {
    expect(cleanOtp('123456', 6)).toBe('123456');
    expect(cleanOtp('123 456', 6)).toBe('123456');
    expect(cleanOtp('۱۲۳۴۵۶', 6)).toBe('123456');
    expect(cleanOtp('٤٥٦١٢٣', 6)).toBe('456123');
    expect(cleanOtp('کد شما: 482913', 6)).toBe('482913');
    expect(cleanOtp('12-34', 6)).toBe('1234');
    expect(cleanOtp('1234567890', 6)).toBe('123456');
    expect(cleanOtp('abc', 6)).toBe('');
  });

  it('fills every box from one paste', async () => {
    const { tree, onChange } = await otp('');
    await ReactTestRenderer.act(async () => {
      inputLabelled(tree.root, prs.auth.otpLabel).props.onChangeText(
        '  ۴۸۲ ۹۱۳ ',
      );
    });
    expect(onChange).toHaveBeenCalledWith('482913');
  });

  it('is one input that takes the system one-time-code, and focuses itself', async () => {
    const { tree } = await otp('');
    const input = inputLabelled(tree.root, prs.auth.otpLabel);
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(input.props.autoComplete).toBe('sms-otp');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.autoFocus).toBe(true);
  });

  it('marks the box being filled once the field has focus, and the error state on every box', async () => {
    const { tree } = await otp('12');
    expect(boxes(tree).map(b => styleOf(b).borderWidth)).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
    await ReactTestRenderer.act(async () => {
      inputLabelled(tree.root, prs.auth.otpLabel).props.onFocus();
    });
    expect(boxes(tree).map(b => styleOf(b).borderWidth)).toEqual([
      1, 1, 2, 1, 1, 1,
    ]);
    expect(styleOf(boxes(tree)[2]).borderColor).toBe('#047857');

    const bad = await otp('12', jest.fn(), true);
    expect(
      boxes(bad.tree).every(b => styleOf(b).borderColor === '#C0392B'),
    ).toBe(true);
  });

  it('lays the row out left-to-right so the digits are never mirrored', async () => {
    const { tree } = await otp('');
    const row = hosts(
      tree.root,
      n => styleOf(n).direction === 'ltr' && styleOf(n).flexDirection === 'row',
    );
    expect(row.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────── Button ─────────────────────────────────

describe('Button', () => {
  const look = async (
    variant: 'primary' | 'secondary' | 'outline' | 'danger',
  ) => {
    const tree = await show(
      <Button title="دکمه" variant={variant} onPress={jest.fn()} />,
    );
    return styleOf(buttonNamed(tree.root, 'دکمه'));
  };

  it('has no pale-coloured buttons: secondary is a quiet white outline, danger a red outline', async () => {
    expect(await look('primary')).toMatchObject({ backgroundColor: '#047857' });
    expect(await look('secondary')).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
    });
    expect(await look('danger')).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#C0392B',
    });
  });

  it('has no shadow, not even on the primary button', async () => {
    const primary = await look('primary');
    expect(primary.shadowOpacity).toBeUndefined();
    expect(primary.elevation).toBeUndefined();
  });
});

// ─────────────────────────────── PropertyCard ───────────────────────────────

describe('PropertyCard (the Home list)', () => {
  const card = (p: Property, onPress = jest.fn()) =>
    show(<PropertyCard property={p} onPress={onPress} />).then(tree => ({
      tree,
      onPress,
    }));

  it('is flat: white, a 1 px border, no shadow', async () => {
    const { tree } = await card(property());
    const outer = hosts(tree.root, n => styleOf(n).borderRadius === 16)[0];
    expect(styleOf(outer)).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    });
    expect(styleOf(outer).shadowOpacity).toBeUndefined();
    expect(styleOf(outer).elevation).toBeUndefined();
  });

  it('shows the price with the Afghani sign, the title, the kind, the area and the place', async () => {
    const { tree } = await card(property());
    const text = allText(tree.root);
    expect(text).toContain('۱,۲۰۰,۰۰۰');
    expect(text).toContain('؋');
    expect(text).toContain('خانه سه اتاقه در شهر زرنج');
    expect(text).toContain(prs.propertyType.HOUSE_HAWILI);
    expect(text).toContain('۲۵۳');
    expect(text).toContain('زرنج');
    expect(text).not.toContain('📍');
  });

  it("puts a grey media container with the kind's line icon where there is no picture, not an emoji", async () => {
    const { tree } = await card(property());
    const placeholder = hosts(
      tree.root,
      n => n.props.testID === 'listing-placeholder',
    )[0];
    expect(styleOf(placeholder).backgroundColor).toBe('#F3F4F6');
    expect(allText(tree.root)).not.toContain('🏠');
  });

  it('shows the first picture when there is one', async () => {
    const { tree } = await card(
      property({ images: ['https://img.example/a.jpg'] }),
    );
    expect(
      tree.root.findAll(
        n => n.props.source?.uri === 'https://img.example/a.jpg',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      hosts(tree.root, n => n.props.testID === 'listing-placeholder'),
    ).toHaveLength(0);
  });

  it.each([
    ['SALE', '#047857', '#FFFFFF'],
    ['RENT', '#2563EB', '#FFFFFF'],
    ['MORTGAGE_GROWI', '#D97706', '#111827'],
  ] as const)(
    'wears the %s deal as a solid %s badge',
    async (deal, fill, _ink) => {
      const { tree } = await card(property({ deal_type: deal }));
      const label = prs.dealType[deal];
      const badge = hosts(
        tree.root,
        n => styleOf(n).backgroundColor === fill && allText(n).includes(label),
      );
      expect(badge.length).toBeGreaterThan(0);
    },
  );

  it('marks a featured listing with a gold badge', async () => {
    const { tree } = await card(property({ is_featured: true }));
    expect(allText(tree.root)).toContain(prs.property.featured);
    expect(
      hosts(
        tree.root,
        n =>
          styleOf(n).backgroundColor === '#F59E0B' &&
          allText(n).includes(prs.property.featured),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('opens the listing when the card is tapped', async () => {
    const { tree, onPress } = await card(property());
    await tap(tree.root, 'خانه سه اتاقه در شهر زرنج');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shares the listing through the phone's share sheet, without opening it", async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    const { tree, onPress } = await card(property());
    await tap(tree.root, prs.property.share);
    expect(share).toHaveBeenCalledTimes(1);
    const [content, options] = share.mock.calls[0];
    // A one-line summary (title, price, place), the invitation, and the listing's link (its unique id).
    expect(content.message).toContain('bongah://listing/p1');
    expect(content.message).toContain('🏠 خانه سه اتاقه در شهر زرنج');
    expect(content.message).toContain('💰 ۱,۲۰۰,۰۰۰ ؋');
    expect(content.message).toContain('📍');
    expect(content.message).toContain(prs.property.shareInvite);
    expect(options).toMatchObject({
      dialogTitle: prs.property.shareDialogTitle,
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not break when the share sheet cannot be opened', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no activity'));
    const { tree } = await card(property());
    await expect(tap(tree.root, prs.property.share)).resolves.not.toThrow();
  });
});

// ───────────────────────── ListingCard (My Listings) ─────────────────────────

describe('ListingCard (My Listings)', () => {
  const card = (
    p: Property,
    actions: React.ComponentProps<typeof ListingCard>['actions'] = [],
  ) => show(<ListingCard property={p} onPress={jest.fn()} actions={actions} />);

  it('calls an inactive listing "غیرفعال" and never "بایگانی"', async () => {
    const tree = await card(property({ status: 'ARCHIVED' }));
    expect(allText(tree.root)).toContain('غیرفعال');
    expect(allText(tree.root)).not.toContain('بایگانی');
    expect(JSON.stringify([prs.status, prs.my])).not.toContain('بایگانی');
    expect(JSON.stringify([ps.status, ps.my])).not.toContain('آرشیف');
  });

  it('shows the status as a quiet white pill, never a solid green one', async () => {
    const tree = await card(property({ status: 'ACTIVE' }));
    const badge = hosts(
      tree.root,
      n =>
        styleOf(n).backgroundColor === '#FFFFFF' &&
        styleOf(n).borderColor === '#E5E7EB' &&
        allText(n).trim() === prs.status.ACTIVE,
    );
    expect(badge.length).toBeGreaterThan(0);
    const solid = hosts(
      tree.root,
      n =>
        styleOf(n).backgroundColor === '#047857' &&
        allText(n).includes(prs.status.ACTIVE),
    );
    expect(solid).toHaveLength(0);
  });

  it('shows the deal as the solid green pill', async () => {
    const tree = await card(property({ status: 'ACTIVE', deal_type: 'SALE' }));
    const deal = hosts(
      tree.root,
      n =>
        styleOf(n).backgroundColor === '#047857' &&
        allText(n).trim() === prs.dealType.SALE,
    );
    expect(deal.length).toBeGreaterThan(0);
  });

  it('gives the actions flat looks: promote solid emerald, edit white with an edge, deactivate white with a red edge', async () => {
    const tree = await card(property(), [
      { label: prs.my.promote, tone: 'brand', onPress: jest.fn() },
      { label: prs.my.edit, onPress: jest.fn() },
      { label: prs.my.archive, tone: 'danger', onPress: jest.fn() },
    ]);
    expect(styleOf(buttonNamed(tree.root, prs.my.promote))).toMatchObject({
      backgroundColor: '#047857',
    });
    expect(styleOf(buttonNamed(tree.root, prs.my.edit))).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
    });
    expect(styleOf(buttonNamed(tree.root, prs.my.archive))).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#C0392B',
    });
    expect(prs.my.archive).toBe('غیرفعال کردن');
  });

  it('is a flat card: white, 1 px border, no shadow', async () => {
    const tree = await card(property());
    const outer = hosts(tree.root, n => styleOf(n).borderRadius === 16)[0];
    expect(styleOf(outer)).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
    });
    expect(styleOf(outer).shadowOpacity).toBeUndefined();
  });
});

// ────────────────────────────── EditProfileSheet ──────────────────────────────

describe('EditProfileSheet', () => {
  const baseUser = {
    id: 'u1',
    role: 'USER',
    phone_number: '+93701234567',
    full_name: 'احمد',
    avatar: null,
  };
  const calls = (method: string, path: string) =>
    fetchMock.mock.calls.filter(
      ([url, init]: [string, RequestInit?]) =>
        (init?.method ?? 'GET') === method &&
        !String(url).startsWith('file:') &&
        new URL(url).pathname === path,
    );
  const api = (routes: Parameters<typeof mockApi>[1]) => {
    mockApi(fetchMock, routes);
    const routed = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      String(url).startsWith('file:')
        ? { blob: async () => new Blob(['pixels']) }
        : routed(url, init),
    );
  };
  const open = async (user: Record<string, unknown> = baseUser) => {
    mockUser = user;
    const onClose = jest.fn();
    const tree = await show(<EditProfileSheet visible onClose={onClose} />);
    return { tree, onClose };
  };
  const type = (root: ReactTestRenderer.ReactTestInstance, value: string) =>
    ReactTestRenderer.act(async () => {
      inputLabelled(root, prs.auth.fullName).props.onChangeText(value);
    });
  const registered = { ...baseUser, full_name: 'علی رضا' };

  it('starts from the saved name', async () => {
    const { tree } = await open();
    expect(inputLabelled(tree.root, prs.auth.fullName).props.value).toContain(
      'احمد',
    );
  });

  it('saves a new name through POST /users/register, updates the signed-in user and closes', async () => {
    api({ 'POST /users/register': { body: registered } });
    const { tree, onClose } = await open();
    await type(tree.root, 'علی رضا');
    await tap(tree.root, prs.common.save);
    await settle();
    const [[, init]] = calls('POST', '/users/register');
    expect(JSON.parse(init.body as string)).toEqual({ full_name: 'علی رضا' });
    expect(mockUpdateUser).toHaveBeenCalledWith(registered);
    expect(onClose).toHaveBeenCalled();
  });

  it('uploads a chosen photo first, then saves its URL together with the name', async () => {
    api({
      'POST /property-images': {
        status: 201,
        body: { id: 'i1', url: 'https://api.example/property-images/i1' },
      },
      'POST /users/register': {
        body: {
          ...registered,
          avatar: 'https://api.example/property-images/i1',
        },
      },
    });
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [
        { uri: 'file:///photo.jpg', type: 'image/jpeg', fileSize: 90000 },
      ],
    });
    const { tree, onClose } = await open();
    await tap(tree.root, prs.account.addPhoto);
    await tap(tree.root, prs.common.save);
    await settle();

    const [[, upload]] = calls('POST', '/property-images');
    expect((upload.headers as Record<string, string>)['Content-Type']).toBe(
      'image/jpeg',
    );
    const [[, register]] = calls('POST', '/users/register');
    expect(JSON.parse(register.body as string)).toEqual({
      full_name: 'احمد',
      avatar: 'https://api.example/property-images/i1',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('removes the picture by sending avatar: null', async () => {
    api({ 'POST /users/register': { body: baseUser } });
    const { tree } = await open({
      ...baseUser,
      avatar: 'https://api.example/a.jpg',
    });
    await tap(tree.root, prs.account.removePhoto);
    await tap(tree.root, prs.common.save);
    await settle();
    const [[, init]] = calls('POST', '/users/register');
    expect(JSON.parse(init.body as string)).toEqual({
      full_name: 'احمد',
      avatar: null,
    });
  });

  it('refuses a picture type the server would refuse, before uploading anything', async () => {
    api({});
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [{ uri: 'file:///anim.gif', type: 'image/gif' }],
    });
    const { tree } = await open();
    await tap(tree.root, prs.account.addPhoto);
    await settle();
    expect(allText(tree.root)).toContain(prs.account.photoUnsupported);
    expect(calls('POST', '/property-images')).toHaveLength(0);
  });

  it('does nothing when the picker is cancelled', async () => {
    api({});
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      didCancel: true,
    });
    const { tree } = await open();
    await tap(tree.root, prs.account.addPhoto);
    await settle();
    expect(allText(tree.root)).not.toContain(prs.account.photoFailed);
  });

  it('rejects a too-short name without sending anything', async () => {
    api({});
    const { tree, onClose } = await open();
    await type(tree.root, 'ا');
    await tap(tree.root, prs.common.save);
    await settle();
    expect(allText(tree.root)).toContain(prs.auth.invalidName);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('changes nothing if the upload fails: no register call, the user is not updated, the sheet stays open', async () => {
    api({
      'POST /property-images': { status: 500, body: { message: 'boom' } },
    });
    (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
      assets: [{ uri: 'file:///photo.jpg', type: 'image/jpeg' }],
    });
    const { tree, onClose } = await open();
    await tap(tree.root, prs.account.addPhoto);
    await tap(tree.root, prs.common.save);
    await settle();
    expect(calls('POST', '/users/register')).toHaveLength(0);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ──────────────────────────── the flat look, enforced ────────────────────────────

describe('no shadows or pale greens anywhere in the app', () => {
  const fs = require('node:fs') as {
    readdirSync(
      p: string,
      o: { withFileTypes: true },
    ): { name: string; isDirectory(): boolean }[];
    readFileSync(p: string, e: 'utf8'): string;
  };
  const path = require('node:path') as { join(...p: string[]): string };
  const sources = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  const files = sources(path.join(__dirname, '..', 'src')).map(file => ({
    file,
    code: fs
      .readFileSync(file, 'utf8')
      // Comments may talk about shadows ("no shadow"); only code counts.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1'),
  }));

  // The floating tab bar is deliberately left as it was, and so are the few theme tokens that only it uses
  // (`shadow`, `primaryTint`, `surfaceGlass`). Everything else is held to the flat look.
  const isTabBar = (file: string) => file.endsWith('FloatingTabBar.tsx');
  const isTheme = (file: string) => file.endsWith('theme/index.ts');
  const withoutTabBarTokens = (code: string) =>
    code
      .replace(
        /export const shadow = StyleSheet\.create\(\{[\s\S]*?\n\}\);/,
        '',
      )
      .replace(/^\s*(primaryTint|surfaceGlass):.*$/gm, '');
  const held = files
    .filter(({ file }) => !isTabBar(file))
    .map(({ file, code }) => ({
      file,
      code: isTheme(file) ? withoutTabBarTokens(code) : code,
    }));

  const offenders = (pattern: RegExp) =>
    held.filter(({ code }) => pattern.test(code)).map(({ file }) => file);

  it('declares no shadow or elevation style and spreads no shadow token', () => {
    expect(
      offenders(
        /shadow(Color|Opacity|Radius|Offset)|\belevation\s*:|\bshadow\.\w+/,
      ),
    ).toEqual([]);
  });

  it('uses no pale-green token or hex, and no gradient background', () => {
    expect(
      offenders(
        /primarySoft|primaryTint|successSoft|surfaceGlass|gradients\.|backgroundImage|#E6F4EA|#D1FAE5|#E3F4EA|#ECFDF5|#DCFCE7/i,
      ),
    ).toEqual([]);
  });

  it("lets only the tab bar use the tab bar's own tokens", () => {
    const users = files
      .filter(({ file }) => !isTabBar(file) && !isTheme(file))
      .filter(({ code }) => /\bshadow\b\.|primaryTint|surfaceGlass/.test(code))
      .map(({ file }) => file);
    expect(users).toEqual([]);
  });
});
