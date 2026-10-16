import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const path = prefix + key;
      return typeof value === 'string'
        ? { ...acc, [path]: value }
        : { ...acc, ...leaves(value, `${path}.`) };
    },
    {},
  );
}

const placeholders = (text: string) =>
  (text.match(/{{\s*\w+\s*}}/g) ?? []).sort().join(',');

describe('translations', () => {
  const dari = leaves(prs);
  const pashto = leaves(ps);

  it('Dari and Pashto have exactly the same keys', () => {
    expect(Object.keys(pashto).sort()).toEqual(Object.keys(dari).sort());
  });

  it('has no empty strings', () => {
    for (const [key, value] of [
      ...Object.entries(dari),
      ...Object.entries(pashto),
    ]) {
      expect({ key, empty: value.trim() === '' }).toEqual({
        key,
        empty: false,
      });
    }
  });

  it('uses the same {{placeholders}} in both languages', () => {
    for (const key of Object.keys(dari)) {
      expect({ key, p: placeholders(pashto[key]) }).toEqual({
        key,
        p: placeholders(dari[key]),
      });
    }
  });

  it('is written in Arabic script (no stray Latin sentences)', () => {
    // An example the form shows in an empty box may name a place the way its sign does ("شفاخانه ABC").
    const examples = new Set(['add.addressPlaceholder']);
    for (const [key, value] of Object.entries({ ...dari })) {
      if (examples.has(key)) continue;
      // URLs/https hints are the only Latin allowed.
      const withoutAllowed = value
        .replace(/https?:\/\/…?/g, '')
        .replace(/{{\s*\w+\s*}}/g, '');
      expect({ key, latin: /[A-Za-z]{2,}/.test(withoutAllowed) }).toEqual({
        key,
        latin: false,
      });
    }
  });

  it('covers every enum value the API can send', () => {
    const {
      PROPERTY_TYPES,
      DEAL_TYPES,
      CURRENCIES,
      PROPERTY_STATUSES,
      ROLES,
      SUBSCRIPTION_PACKAGES,
    } = jest.requireActual('@bongah/shared-types');
    const expected = [
      ...PROPERTY_TYPES.map((v: string) => `propertyType.${v}`),
      ...DEAL_TYPES.map((v: string) => `dealType.${v}`),
      ...CURRENCIES.map((v: string) => `currency.${v}`),
      ...PROPERTY_STATUSES.map((v: string) => `status.${v}`),
      ...ROLES.map((v: string) => `role.${v}`),
      ...SUBSCRIPTION_PACKAGES.map((v: string) => `package.${v}`),
    ];
    for (const key of expected) {
      expect({ key, present: key in dari && key in pashto }).toEqual({
        key,
        present: true,
      });
    }
  });
});
