import i18n, { changeLanguage, currentLanguage, initI18n } from '../src/i18n';
import { KV_KEYS, kv } from '../src/storage/kv';

const stored = () => kv.get(KV_KEYS.language);
/** What a fresh app launch would start in. */
const restart = () => initI18n();

describe('language persistence', () => {
  beforeEach(async () => {
    await kv.remove(KV_KEYS.language);
    await restart();
  });

  it('starts in Dari when nothing was ever chosen', async () => {
    expect(await restart()).toBe('prs');
    expect(currentLanguage()).toBe('prs');
  });

  it('remembers a choice across a restart, in both directions', async () => {
    await changeLanguage('ps');
    expect(currentLanguage()).toBe('ps');
    expect(await stored()).toBe('ps');
    expect(await restart()).toBe('ps');
    expect(i18n.t('common.close')).not.toBe('بستن');

    await changeLanguage('prs');
    expect(await stored()).toBe('prs');
    expect(await restart()).toBe('prs');
    expect(i18n.t('common.close')).toBe('بستن');
  });

  it('ignores a saved value that is not a supported language', async () => {
    for (const junk of ['en', '', 'PS', 'null', '{"a":1}']) {
      await kv.set(KV_KEYS.language, junk);
      expect(await restart()).toBe('prs');
    }
  });

  it('refuses to switch to, or save, an unsupported language', async () => {
    await changeLanguage('ps');
    await changeLanguage('en' as never);
    await changeLanguage(undefined as never);
    expect(currentLanguage()).toBe('ps');
    expect(await stored()).toBe('ps');
  });

  it('ends on the last choice, in the screen and in storage, when taps come quickly', async () => {
    const taps = [
      changeLanguage('ps'),
      changeLanguage('prs'),
      changeLanguage('ps'),
      changeLanguage('prs'),
    ];
    await Promise.all(taps);
    expect(currentLanguage()).toBe('prs');
    expect(await stored()).toBe('prs');

    await Promise.all([changeLanguage('prs'), changeLanguage('ps')]);
    expect(currentLanguage()).toBe('ps');
    expect(await stored()).toBe('ps');
  });

  it('does not let a slow earlier save overwrite a later choice', async () => {
    const real = kv.set.bind(kv);
    let calls = 0;
    const set = jest.spyOn(kv, 'set').mockImplementation(async (k, v) => {
      calls += 1;
      // The first write is slow, the second quick: unordered, the slow one would land last.
      await new Promise<void>(r => setTimeout(() => r(), calls === 1 ? 40 : 0));
      await real(k, v);
    });
    await Promise.all([changeLanguage('ps'), changeLanguage('prs')]);
    set.mockRestore();
    expect(await stored()).toBe('prs');
    expect(currentLanguage()).toBe('prs');
  });

  it('saves before it switches, so a crash in between restarts in the new language', async () => {
    const order: string[] = [];
    const set = jest.spyOn(kv, 'set').mockImplementation(async () => {
      order.push('saved');
    });
    const change = jest
      .spyOn(i18n, 'changeLanguage')
      .mockImplementation((async () => {
        order.push('switched');
      }) as never);
    await changeLanguage('ps');
    expect(order).toEqual(['saved', 'switched']);
    set.mockRestore();
    change.mockRestore();
  });

  it('keeps working after one switch fails', async () => {
    const change = jest
      .spyOn(i18n, 'changeLanguage')
      .mockRejectedValueOnce(new Error('boom'));
    await expect(changeLanguage('ps')).rejects.toThrow('boom');
    await changeLanguage('ps');
    expect(currentLanguage()).toBe('ps');
    expect(await stored()).toBe('ps');
    change.mockRestore();
  });
});
