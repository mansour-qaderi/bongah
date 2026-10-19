import {
  editGroupedNumber,
  groupNumber,
  toRawNumber,
} from '../src/i18n/numberInput';

describe('toRawNumber', () => {
  it('gives plain digits, a "." decimal point and no separators', () => {
    expect(toRawNumber('۱,۳۰۰,۰۰۰')).toBe('1300000');
    expect(toRawNumber('۱٬۲۳۴٫۵')).toBe('1234.5');
    expect(toRawNumber('١٢٣ ٤٥٦')).toBe('123456');
    expect(toRawNumber('1,300,000')).toBe('1300000');
    expect(toRawNumber('')).toBe('');
  });
});

describe('groupNumber', () => {
  it('writes Persian digits grouped in thousands', () => {
    expect(groupNumber('')).toBe('');
    expect(groupNumber('999')).toBe('۹۹۹');
    expect(groupNumber('1000')).toBe('۱,۰۰۰');
    expect(groupNumber('1300000')).toBe('۱,۳۰۰,۰۰۰');
    expect(groupNumber('1234567.891')).toBe('۱,۲۳۴,۵۶۷٫۸۹۱');
  });

  it('keeps a trailing decimal point while it is being typed', () => {
    expect(groupNumber('1200.')).toBe('۱,۲۰۰٫');
  });

  it('does not regroup text that is not a plain number', () => {
    expect(groupNumber('12ab3456')).toBe('۱۲ab۳۴۵۶');
  });
});

describe('editGroupedNumber', () => {
  const state = (shown: string, start = shown.length, end = start) => ({
    shown,
    start,
    end,
  });

  it('types at the end: regroups and leaves the caret to the keyboard', () => {
    expect(editGroupedNumber('۱,۲۳۴۵', state('۱,۲۳۴'))).toEqual({
      raw: '12345',
      shown: '۱۲,۳۴۵',
      caret: null,
    });
  });

  it('accepts Western digits from the keyboard', () => {
    expect(editGroupedNumber('۱۲۳4', state('۱۲۳')).raw).toBe('1234');
  });

  it('keeps the caret beside the same digit when a separator appears in front of it', () => {
    const edit = editGroupedNumber('۱۹۲۳,۴۵۶', state('۱۲۳,۴۵۶', 1));
    expect(edit.shown).toBe('۱,۹۲۳,۴۵۶');
    expect(edit.caret).toBe(3);
  });

  it('keeps the caret beside the same digit when a separator disappears in front of it', () => {
    // ۱,۲۳۴ with the 2 deleted (caret was after it at 3): "۱,۳۴" -> ۱۳۴
    const edit = editGroupedNumber('۱,۳۴', state('۱,۲۳۴', 3));
    expect(edit.shown).toBe('۱۳۴');
    expect(edit.caret).toBe(1);
  });

  it('deletes the digit before a separator when only the separator was deleted', () => {
    // ۱۲,۳۴۵ with the comma deleted (caret was right after it at 3): the digit before it goes instead.
    const edit = editGroupedNumber('۱۲۳۴۵', state('۱۲,۳۴۵', 3));
    expect(edit.raw).toBe('1345');
    expect(edit.shown).toBe('۱,۳۴۵');
  });

  it('handles pasting over a selection', () => {
    const edit = editGroupedNumber('9999', state('۱۲,۳۴۵', 0, 6));
    expect(edit.raw).toBe('9999');
    expect(edit.shown).toBe('۹,۹۹۹');
    expect(edit.caret).toBeNull();
  });

  it('empties out', () => {
    expect(editGroupedNumber('', state('۱', 1))).toEqual({
      raw: '',
      shown: '',
      caret: null,
    });
  });
});
