import i18next from 'i18next';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';

declare const __dirname: string;

const fs = require('node:fs') as {
  readdirSync(
    p: string,
    o: { withFileTypes: true },
  ): { name: string; isDirectory(): boolean }[];
  readFileSync(p: string, e: 'utf8'): string;
};
const path = require('node:path') as {
  join(...p: string[]): string;
  relative(a: string, b: string): string;
  sep: string;
};

const SRC = path.join(__dirname, '..', 'src');
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
const sources = walk(SRC).filter(
  file => !file.includes(`${path.sep}i18n${path.sep}locales`),
);
const rel = (file: string) =>
  path.relative(SRC, file).split(path.sep).join('/');

const lookup = (tree: Record<string, unknown>, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );

beforeAll(async () => {
  await initI18n();
});

describe('the ladder (نردبان) is earned and spent, never bought', () => {
  // Round 15 took the paid "ladder" (a 50 AFN bump up the list) out of the app. Round 16 brought the word back for the
  // referral currency (seven earned ladders buy a listing or a frame); the paid bump must stay gone.
  const ASKS = (file: string) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([\w.]+)'/g)].map(
      m => m[1],
    );

  it('is not a payment purpose, a price or a package anywhere in the app', () => {
    const offenders = sources
      .filter(file =>
        /'LADDER'|LADDER_PRICE|ladderPrice|ladder-token|ladderToken|ladder_bump|useRedeemLadderToken/.test(
          fs.readFileSync(file, 'utf8'),
        ),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('has no text offering to buy a ladder, in either language', () => {
    const asked = new Set<string>();
    for (const file of sources) for (const key of ASKS(file)) asked.add(key);
    expect(asked.size).toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const key of asked) {
      for (const [lang, tree] of [
        ['prs', prs],
        ['ps', ps],
      ] as const) {
        const value = lookup(tree as Record<string, unknown>, key);
        if (
          typeof value === 'string' &&
          value.includes('نردبان') &&
          /خرید|افغانی/.test(value)
        ) {
          offenders.push(`${lang}: ${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no way left to redeem a free ladder token, only to spend seven', () => {
    const endpoints = fs.readFileSync(
      path.join(SRC, 'api', 'endpoints.ts'),
      'utf8',
    );
    expect(endpoints).not.toContain('ladder-tokens');
    expect(endpoints).toContain('/rewards/ladders/spend');
    const hooks = fs.readFileSync(path.join(SRC, 'api', 'hooks.ts'), 'utf8');
    expect(hooks).not.toContain('useRedeemLadderToken');
  });
});

describe('the payment screen is for featured frames only', () => {
  it('is opened with no tab anywhere in the app: subscriptions are bought on the upgrade screen', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/navigate\(\s*'Checkout'[^)]*\)/g)) {
        if (match[0].includes('tab'))
          offenders.push(`${rel(file)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    const types = fs.readFileSync(
      path.join(SRC, 'navigation', 'types.ts'),
      'utf8',
    );
    expect(types).toMatch(/Checkout: undefined;/);
  });

  it('does not use the tab switcher or the subscription plans', () => {
    const checkout = fs.readFileSync(
      path.join(SRC, 'screens', 'payments', 'CheckoutScreen.tsx'),
      'utf8',
    );
    expect(checkout).not.toContain('SegmentedControl');
    expect(checkout).not.toContain('SUBSCRIPTION_PACKAGES');
    expect(checkout).not.toContain("'SUBSCRIPTION'");
  });
});

describe('the featured frame text', () => {
  it('says, in Dari, exactly: «۷ روز با نشان و کادر ویژه به بالای فهرست نمایش داده می‌شود»', () => {
    expect(i18next.t('frame.topOfList', { days: '۷' })).toBe(
      '۷ روز با نشان و کادر ویژه به بالای فهرست نمایش داده می‌شود',
    );
  });

  it('has a Pashto text too, with the same placeholder', () => {
    expect(ps.frame.topOfList).toContain('{{days}}');
    expect(ps.frame.topOfList).not.toBe(prs.frame.topOfList);
  });
});

describe('the new texts exist in both languages', () => {
  const NEW = [
    'frame.topOfList',
    'add.descriptionLabel',
    'add.upgradeAccount',
    'account.balanceTitle',
    'account.balanceQuota',
    'account.balanceQuotaUnlimited',
    'account.balanceFrames',
    'account.inviteReward',
    'account.inviteRewardHint',
    'auth.referralHintReward',
    'auth.referralAppliedReward',
    'referral.introReward',
    'referral.statRewarded',
  ];
  it.each(NEW)('%s', key => {
    for (const tree of [prs, ps]) {
      const value = lookup(tree as Record<string, unknown>, key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('keeps the old description label as it was (additive keys only)', () => {
    expect(prs.add.descriptionField).toBe('توضیحات (اختیاری)');
  });
});
