import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { initI18n } from '../src/i18n';
import { allText, render } from '../test-utils';
import AppText from '../src/components/AppText';
import { fonts } from '../src/theme';
import TextField from '../src/components/TextField';
import { ScrollScreen } from '../src/components/Screen';
import {
  KEYBOARD_MARGIN,
  KeyboardAvoider,
  KeyboardAwareScrollView,
  keyboardTopEdge,
  overlapWith,
} from '../src/components/KeyboardAware';

const act = ReactTestRenderer.act;

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------------------------------------------
// Persian digits
// ---------------------------------------------------------------------------------------------------------------

describe('AppText digits', () => {
  it('shows Persian digits whatever it is given: strings, numbers, and the pieces of a template', async () => {
    const tree = await render(
      <View>
        <AppText>{'قیمت 1200 و ٣٤'}</AppText>
        <AppText>{4500}</AppText>
        <AppText>
          {'تعداد '}
          {7}
          {' اتاق'}
        </AppText>
        <AppText>
          {'داخل '}
          <AppText>{'3 تا'}</AppText>
        </AppText>
      </View>,
    );
    const text = allText(tree.root);
    expect(text).toContain('قیمت ۱۲۰۰ و ۳۴');
    expect(text).toContain('۴۵۰۰');
    expect(text).toContain('تعداد');
    expect(text).toContain('۷');
    expect(text).not.toMatch(/[0-9٠-٩]/);
  });

  it('leaves the digits alone when asked (codes and links that are typed back)', async () => {
    const tree = await render(<AppText latinDigits>{'AB12CD34'}</AppText>);
    expect(allText(tree.root)).toBe('AB12CD34');
  });
});

describe('TextField digits', () => {
  const field = (props: Partial<React.ComponentProps<typeof TextField>> = {}) =>
    render(
      <TextField label="قیمت" value="" onChangeText={() => {}} {...props} />,
    );
  const input = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findByType(TextInput);

  it('shows what is typed with Persian digits, and hands the screen plain 0-9', async () => {
    const seen: string[] = [];
    const tree = await field({
      value: '1200000',
      onChangeText: v => seen.push(v),
    });
    expect(input(tree).props.value).toBe('۱۲۰۰۰۰۰');
    // The keyboard adds a Western digit to text that already shows Persian ones.
    await act(async () => input(tree).props.onChangeText('۱۲۰۰۰۰۰5'));
    await act(async () => input(tree).props.onChangeText('٣٤'));
    expect(seen).toEqual(['12000005', '34']);
  });

  it('writes the placeholder in Persian digits too', async () => {
    const tree = await field({ placeholder: 'مثلاً 0701234567' });
    expect(input(tree).props.placeholder).toBe('مثلاً ۰۷۰۱۲۳۴۵۶۷');
  });

  it('keeps links and codes exactly as typed when told to', async () => {
    const seen: string[] = [];
    const tree = await field({
      digits: 'keep',
      value: 'https://x.af/1',
      placeholder: 'https://x.af/2',
      onChangeText: v => seen.push(v),
    });
    expect(input(tree).props.value).toBe('https://x.af/1');
    expect(input(tree).props.placeholder).toBe('https://x.af/2');
    await act(async () => input(tree).props.onChangeText('https://x.af/۳'));
    expect(seen).toEqual(['https://x.af/۳']);
  });

  it('shows a helper line under the field (the amount as money), and the error instead of it when there is one', async () => {
    const tree = await field({ helper: '۱٬۲۰۰٬۰۰۰ ؋' });
    expect(allText(tree.root)).toContain('۱٬۲۰۰٬۰۰۰ ؋');
    await act(async () => {
      tree.update(
        <TextField
          label="قیمت"
          value=""
          onChangeText={() => {}}
          helper="۱٬۲۰۰٬۰۰۰ ؋"
          error="نامعتبر"
        />,
      );
    });
    expect(allText(tree.root)).toContain('نامعتبر');
    expect(allText(tree.root)).not.toContain('۱٬۲۰۰٬۰۰۰ ؋');
  });

  describe('no Latin digit is ever on screen', () => {
    const flat = (node: ReactTestRenderer.ReactTestInstance) =>
      StyleSheet.flatten(node.props.style) as Record<string, unknown>;
    const fs = require('node:fs') as {
      readFileSync(p: string): {
        toString(e: 'latin1'): string;
        length: number;
      };
    };
    const path = require('node:path') as { join(...p: string[]): string };

    it('sets every Persian-digit field in the digits font, whatever its keyboard', async () => {
      for (const props of [
        { value: '1200000', keyboardType: 'number-pad' as const },
        {
          value: '1300000',
          keyboardType: 'decimal-pad' as const,
          thousands: true,
        },
        { value: '0701234567', keyboardType: 'phone-pad' as const, ltr: true },
        { value: 'خانه 3 اتاقه' },
        { value: '12', multiline: true },
      ]) {
        const tree = await field(props);
        expect(flat(input(tree)).fontFamily).toBe(fonts.digits);
      }
    });

    it('keeps the ordinary font where digits are kept as typed (links, codes)', async () => {
      const tree = await field({ value: 'https://a.b/1', digits: 'keep' });
      expect(flat(input(tree)).fontFamily).toBe(fonts.regular);
    });

    it('lets a screen choose its own font for a field', async () => {
      const tree = await field({
        value: '12',
        style: { fontFamily: fonts.bold },
      });
      expect(flat(input(tree)).fontFamily).toBe(fonts.bold);
    });

    it('draws nothing on top of the input, and never hides its text (no second copy of the value)', async () => {
      const tree = await field({
        value: '1200000',
        keyboardType: 'number-pad',
      });
      expect(
        tree.root.findAll(node => node.props.testID === 'digits-overlay'),
      ).toHaveLength(0);
      expect(flat(input(tree)).color).not.toBe('transparent');
      expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    });

    it('hands the input the Persian digits of what the screen holds', async () => {
      const tree = await field({
        value: '1300000',
        keyboardType: 'decimal-pad',
        thousands: true,
      });
      expect(input(tree).props.value).toBe('۱,۳۰۰,۰۰۰');
    });

    it('ships a font file whose 0-9 are the Persian glyphs, so the native input draws them itself', () => {
      const file = path.join(
        __dirname,
        '..',
        'assets',
        'fonts',
        `${fonts.digits}.ttf`,
      );
      const bytes = fs.readFileSync(file) as unknown as Uint8Array;
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const u16 = (o: number) => view.getUint16(o);
      const u32 = (o: number) => view.getUint32(o);
      // Find the cmap table, then its format-4 subtable, and read the glyph each code point maps to.
      const tables = u16(4);
      let cmap = -1;
      for (let i = 0; i < tables; i++) {
        const entry = 12 + i * 16;
        const tag = String.fromCharCode(
          ...[0, 1, 2, 3].map(k => view.getUint8(entry + k)),
        );
        if (tag === 'cmap') cmap = u32(entry + 8);
      }
      expect(cmap).toBeGreaterThan(0);
      let sub = -1;
      for (let i = 0; i < u16(cmap + 2); i++) {
        const rec = cmap + 4 + i * 8;
        const offset = cmap + u32(rec + 4);
        if (u16(offset) === 4) sub = offset;
      }
      expect(sub).toBeGreaterThan(0);
      const segCount = u16(sub + 6) / 2;
      const glyphOf = (code: number) => {
        for (let i = 0; i < segCount; i++) {
          const end = u16(sub + 14 + i * 2);
          const start = u16(sub + 16 + segCount * 2 + i * 2);
          if (code > end || code < start) continue;
          const delta = u16(sub + 16 + segCount * 4 + i * 2);
          const rangeAt = sub + 16 + segCount * 6 + i * 2;
          const range = u16(rangeAt);
          if (range === 0) return (code + delta) & 0xffff;
          const g = u16(rangeAt + range + (code - start) * 2);
          return g === 0 ? 0 : (g + delta) & 0xffff;
        }
        return 0;
      };
      for (let digit = 0; digit < 10; digit++) {
        const latin = glyphOf(0x30 + digit);
        expect(latin).toBeGreaterThan(0);
        expect(latin).toBe(glyphOf(0x6f0 + digit));
      }
    });
  });

  describe('while it is being typed in', () => {
    /** A parent that keeps the value in state, like every screen does. */
    function Controlled({ seen }: { seen: string[] }) {
      const [value, setValue] = React.useState('');
      return (
        <TextField
          label="قیمت"
          value={value}
          onChangeText={v => {
            seen.push(v);
            setValue(v);
          }}
        />
      );
    }
    const typeInto = (
      tree: ReactTestRenderer.ReactTestRenderer,
      text: string,
    ) => act(async () => input(tree).props.onChangeText(text));
    const shown = (tree: ReactTestRenderer.ReactTestRenderer) =>
      input(tree).props.value as string;

    it('shows Western digits as Persian ones the moment they are typed, and hands the screen plain 0-9', async () => {
      const seen: string[] = [];
      const tree = await render(<Controlled seen={seen} />);
      await act(async () => input(tree).props.onFocus({}));
      for (const text of ['1', '12', '120', '1200']) {
        await typeInto(tree, text);
      }
      expect(shown(tree)).toBe('۱۲۰۰');
      expect(seen).toEqual(['1', '12', '120', '1200']);
    });

    it('does the same for a Persian or Arabic keyboard', async () => {
      const seen: string[] = [];
      const tree = await render(<Controlled seen={seen} />);
      await act(async () => input(tree).props.onFocus({}));
      await typeInto(tree, '۱۲');
      expect(shown(tree)).toBe('۱۲');
      await typeInto(tree, '۱۲٣');
      expect(shown(tree)).toBe('۱۲۳');
      expect(seen).toEqual(['12', '123']);
    });

    it('keeps showing Persian digits when the person leaves the field and comes back', async () => {
      const tree = await render(<Controlled seen={[]} />);
      await act(async () => input(tree).props.onFocus({}));
      await typeInto(tree, '1200');
      await act(async () => input(tree).props.onBlur({}));
      expect(shown(tree)).toBe('۱۲۰۰');
      await act(async () => input(tree).props.onFocus({}));
      expect(shown(tree)).toBe('۱۲۰۰');
    });

    it('lets the screen change the text under it (a slider, a clear button) without fuss', async () => {
      const tree = await render(
        <TextField label="x" value="1200" onChangeText={() => {}} />,
      );
      await act(async () => input(tree).props.onFocus({}));
      await act(async () => {
        tree.update(
          <TextField label="x" value="5000" onChangeText={() => {}} />,
        );
      });
      expect(shown(tree)).toBe('۵۰۰۰');
    });

    describe('an amount (thousands)', () => {
      function Amount({ seen }: { seen: string[] }) {
        const [value, setValue] = React.useState('');
        return (
          <TextField
            label="قیمت"
            thousands
            value={value}
            onChangeText={v => {
              seen.push(v);
              setValue(v);
            }}
          />
        );
      }

      it('groups the digits in thousands inside the field as they are typed, and hands the screen plain digits', async () => {
        const seen: string[] = [];
        const tree = await render(<Amount seen={seen} />);
        await act(async () => input(tree).props.onFocus({}));
        let typed = '';
        for (const digit of '1300000') {
          // The keyboard adds one character to the text the field is showing.
          typed = shown(tree) + digit;
          await typeInto(tree, typed);
        }
        expect(shown(tree)).toBe('۱,۳۰۰,۰۰۰');
        expect(seen[seen.length - 1]).toBe('1300000');
        expect(seen.some(v => v.includes(',') || /[۰-۹]/.test(v))).toBe(false);
      });

      describe('the field keeps its own grouped text, so a big screen never sits between a keystroke and it', () => {
        const Held = ({ value }: { value: string }) => (
          <TextField
            label="x"
            thousands
            value={value}
            onChangeText={() => {}}
          />
        );

        it('shows the grouped text in the render the keystroke causes, before the screen has handed the value back', async () => {
          // The screen has not caught up (its value is still empty), as while it re-renders a long form.
          const tree = await render(<Held value="" />);
          await act(async () => input(tree).props.onFocus({}));
          await typeInto(tree, '۹۹۹۹');
          expect(shown(tree)).toBe('۹,۹۹۹');
        });

        it('is not pulled back by a stale value arriving after newer typing', async () => {
          const tree = await render(<Held value="" />);
          await typeInto(tree, '۱');
          await typeInto(tree, '۱۲');
          await typeInto(tree, '۱۲۳');
          await typeInto(tree, '۱,۲۳۴');
          expect(shown(tree)).toBe('۱,۲۳۴');
          // The screen answers the older keystrokes first.
          await act(async () => tree.update(<Held value="1" />));
          await act(async () => tree.update(<Held value="12" />));
          expect(shown(tree)).toBe('۱,۲۳۴');
          await act(async () => tree.update(<Held value="1234" />));
          expect(shown(tree)).toBe('۱,۲۳۴');
        });

        it('follows a value the screen sets on its own (a reset, a restored draft)', async () => {
          const tree = await render(<Held value="" />);
          await typeInto(tree, '۵۰۰');
          expect(shown(tree)).toBe('۵۰۰');
          await act(async () => tree.update(<Held value="2500000" />));
          expect(shown(tree)).toBe('۲,۵۰۰,۰۰۰');
          await act(async () => tree.update(<Held value="" />));
          expect(shown(tree)).toBe('');
        });
      });

      it('shows a stored amount grouped, with Persian digits', async () => {
        const tree = await render(
          <TextField
            label="x"
            thousands
            value="2500000"
            onChangeText={() => {}}
          />,
        );
        expect(shown(tree)).toBe('۲,۵۰۰,۰۰۰');
      });

      it('keeps a decimal point, grouping only the whole part', async () => {
        const tree = await render(
          <TextField
            label="x"
            thousands
            value="1234567.5"
            onChangeText={() => {}}
          />,
        );
        expect(shown(tree)).toBe('۱,۲۳۴,۵۶۷٫۵');
      });

      it('puts the caret back beside the same digit when grouping changes the text in front of it', async () => {
        const tree = await render(
          <TextField
            label="x"
            thousands
            value="123456"
            onChangeText={() => {}}
          />,
        );
        expect(shown(tree)).toBe('۱۲۳,۴۵۶');
        await act(async () => input(tree).props.onFocus({}));
        // The caret is after the first digit...
        await act(async () =>
          input(tree).props.onSelectionChange({
            nativeEvent: { selection: { start: 1, end: 1 } },
          }),
        );
        // ...and a 9 is typed there. The number regroups as ۱,۹۲۳,۴۵۶: a comma has appeared in front of
        // the caret's digit, so the caret has to move one place along to stay after the 9.
        await act(async () => input(tree).props.onChangeText('۱۹۲۳,۴۵۶'));
        expect(input(tree).props.selection).toEqual({ start: 3, end: 3 });
      });
    });

    it('passes focus and blur on to the screen', async () => {
      const onFocus = jest.fn();
      const onBlur = jest.fn();
      const tree = await field({ onFocus, onBlur });
      await act(async () => input(tree).props.onFocus({}));
      await act(async () => input(tree).props.onBlur({}));
      expect(onFocus).toHaveBeenCalledTimes(1);
      expect(onBlur).toHaveBeenCalledTimes(1);
    });
  });

  it('works without a value or a change handler (an uncontrolled field)', async () => {
    const tree = await render(<TextField label="x" />);
    expect(input(tree).props.value).toBeUndefined();
    expect(input(tree).props.onChangeText).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------------------------------------------

/** Where the form's box sits on screen. The renderer cannot lay anything out, so the test says. */
interface Geometry {
  boxTop: number;
  boxBottom: number;
}
/** Jest mocks View as a class whose measureInWindow does nothing; give it the geometry instead. */
const placeBox = (geometry: Geometry) =>
  jest
    .spyOn(
      View.prototype as unknown as { measureInWindow: unknown },
      'measureInWindow' as never,
    )
    .mockImplementation(((
      cb: (x: number, y: number, w: number, h: number) => void,
    ) =>
      cb(
        0,
        geometry.boxTop,
        360,
        geometry.boxBottom - geometry.boxTop,
      )) as never);

/** Captures the keyboard listeners the components register, so a test can "show the keyboard". */
function fakeKeyboard() {
  const handlers: Record<string, (event: unknown) => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((
    name: string,
    handler: (event: unknown) => void,
  ) => {
    handlers[name] = handler;
    return { remove: jest.fn() };
  }) as never);
  const event = (screenY: number, height = 300) => ({
    endCoordinates: { screenY, height, width: 360, screenX: 0 },
  });
  return {
    show: (top: number) =>
      handlers.keyboardDidShow?.(event(top)) ??
      handlers.keyboardWillChangeFrame?.(event(top)),
    hide: () =>
      handlers.keyboardDidHide?.({}) ?? handlers.keyboardWillHide?.({}),
  };
}

const settleTimers = async () => {
  // The components wait for the layout to settle before measuring, then measure through promises.
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
  }
};

describe('overlapWith', () => {
  it('is how far the keyboard covers the bottom of a box', () => {
    expect(overlapWith({ top: 0, bottom: 800 }, 500)).toBe(300);
    expect(overlapWith({ top: 0, bottom: 480 }, 500)).toBe(0); // the window already shrank
    expect(overlapWith({ top: 0, bottom: 800 }, Infinity)).toBe(0); // no keyboard
    expect(overlapWith(null, 500)).toBe(0); // cannot be measured
  });
});

describe('KeyboardAvoider', () => {
  const mount = async (geometry: Geometry) => {
    placeBox(geometry);
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <KeyboardAvoider>
          <View testID="inside" />
        </KeyboardAvoider>,
      );
    });
    return tree;
  };
  const padding = (tree: ReactTestRenderer.ReactTestRenderer) => {
    const outer = tree.root.findAllByType(View)[0];
    return (
      (StyleSheet.flatten(outer.props.style) as { paddingBottom?: number })
        .paddingBottom ?? 0
    );
  };

  it('pads its foot by the part of it the keyboard covers, and lets go when the keyboard goes', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    const tree = await mount({ boxTop: 0, boxBottom: 800 });
    expect(padding(tree)).toBe(0);
    await act(async () => keyboard.show(500));
    await settleTimers();
    expect(padding(tree)).toBe(300);
    await act(async () => keyboard.hide());
    await settleTimers();
    expect(padding(tree)).toBe(0);
  });

  it('adds nothing when the window itself already shrank to sit above the keyboard', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    const tree = await mount({ boxTop: 0, boxBottom: 480 });
    await act(async () => keyboard.show(500));
    await settleTimers();
    expect(padding(tree)).toBe(0);
  });
});

describe('where the keyboard is on screen', () => {
  it('is worked out from its height on Android, where the reported position is not the keyboard top', () => {
    // 800 tall window, 300 tall keyboard, 24 of navigation bar under it: the keys start at 800 - 300 - 24.
    expect(
      keyboardTopEdge({ screenY: 123, height: 300 }, 800, 24, 'android'),
    ).toBe(476);
  });

  it('is the position iOS reports', () => {
    expect(keyboardTopEdge({ screenY: 500, height: 300 }, 800, 34, 'ios')).toBe(
      500,
    );
  });
});

describe('KeyboardAvoider on Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 360, height: 800, scale: 1, fontScale: 1 });
  });

  it('lifts its foot by the keyboard height even when the reported position is far off (the sheet floating above the keys)', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    placeBox({ boxTop: 0, boxBottom: 800 });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <KeyboardAvoider>
          <View />
        </KeyboardAvoider>,
      );
    });
    // The platform says the keyboard starts at 90 (as the activity window's frame did for a sheet); it is 300 tall.
    await act(async () => keyboard.show(90));
    await settleTimers();
    const outer = tree.root.findAllByType(View)[0];
    expect(
      (StyleSheet.flatten(outer.props.style) as { paddingBottom?: number })
        .paddingBottom,
    ).toBe(300);
  });
});

describe('KeyboardAwareScrollView', () => {
  /** A form whose first field is shown; the keyboard comes up over the bottom of the screen. */
  const mount = async (geometry: Geometry) => {
    placeBox(geometry);
    const ref = React.createRef<ScrollViewLike>();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <KeyboardAwareScrollView ref={ref as never}>
          <TextField label="a" value="" onChangeText={() => {}} />
        </KeyboardAwareScrollView>,
      );
    });
    return { tree, ref };
  };
  type ScrollViewLike = { scrollTo: jest.Mock };

  /** Pretends this input is the focused one, at this place on screen. */
  const focusOn = (top: number, height = 48) =>
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void,
      ) => cb(0, top, 300, height),
    } as never);

  const scrolls = (tree: ReactTestRenderer.ReactTestRenderer) => {
    return tree.root.findByType(ScrollView);
  };

  it('scrolls a field that the keyboard would cover up above it, with a margin', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    focusOn(620); // bottom at 668, but the keyboard starts at 500
    const { tree, ref } = await mount({ boxTop: 0, boxBottom: 800 });
    const scrollTo = jest.fn();
    // The scroll view's own methods are native; give the test's copy one it can watch.
    (ref.current as unknown as ScrollViewLike).scrollTo = scrollTo;
    await act(async () => keyboard.show(500));
    await settleTimers();
    // 668 + margin must end at 500: 192 further down the page.
    expect(scrollTo).toHaveBeenCalledWith({
      y: 668 + KEYBOARD_MARGIN - 500,
      animated: true,
    });
    expect(scrolls(tree)).toBeDefined();
  });

  it('does not move the page when the field is already above the keyboard', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    focusOn(200); // bottom 248, well clear
    const { ref } = await mount({ boxTop: 0, boxBottom: 800 });
    const scrollTo = jest.fn();
    (ref.current as unknown as ScrollViewLike).scrollTo = scrollTo;
    await act(async () => keyboard.show(500));
    await settleTimers();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('follows the focus from one field to the next while the keyboard stays up', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    const first = focusOn(200);
    const { tree, ref } = await mount({ boxTop: 0, boxBottom: 800 });
    const scrollTo = jest.fn();
    (ref.current as unknown as ScrollViewLike).scrollTo = scrollTo;
    await act(async () => keyboard.show(500));
    await settleTimers();
    expect(scrollTo).not.toHaveBeenCalled();

    // Tapping a lower field: no keyboard event comes, only the field's own focus.
    first.mockReturnValue({
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void,
      ) => cb(0, 700, 300, 48),
    } as never);
    await act(async () => {
      tree.root.findByType(TextInput).props.onFocus({});
    });
    await settleTimers();
    expect(scrollTo).toHaveBeenCalledWith({
      y: 748 + KEYBOARD_MARGIN - 500,
      animated: true,
    });
  });

  it('scrolls back up to a field that sits above the top of the screen', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    focusOn(-30); // partly scrolled out of view at the top
    const { ref } = await mount({ boxTop: 0, boxBottom: 800 });
    const scrollTo = jest.fn();
    (ref.current as unknown as ScrollViewLike).scrollTo = scrollTo;
    await act(async () => keyboard.show(500));
    await settleTimers();
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it('gives the page room under its content while the keyboard covers part of it', async () => {
    jest.useFakeTimers();
    const keyboard = fakeKeyboard();
    focusOn(200);
    const { tree } = await mount({ boxTop: 0, boxBottom: 800 });
    const spacer = () =>
      tree.root
        .findAllByType(View)
        .filter(
          n =>
            (
              StyleSheet.flatten(n.props.style) as
                | { height?: number }
                | undefined
            )?.height ===
            300 + KEYBOARD_MARGIN,
        );
    expect(spacer()).toHaveLength(0);
    await act(async () => keyboard.show(500));
    await settleTimers();
    expect(spacer().length).toBeGreaterThan(0);
    await act(async () => keyboard.hide());
    await settleTimers();
    expect(spacer()).toHaveLength(0);
  });

  it('lets taps through while the keyboard is open, and dismisses it when the page is dragged', async () => {
    const { tree } = await mount({ boxTop: 0, boxBottom: 800 });
    const scroller = scrolls(tree);
    expect(scroller.props.keyboardShouldPersistTaps).toBe('handled');
    expect(['on-drag', 'interactive']).toContain(
      scroller.props.keyboardDismissMode,
    );
  });
});

describe('ScrollScreen', () => {
  it('is keyboard-aware, so every form built on it keeps its fields above the keyboard', async () => {
    const tree = await render(
      <ScrollScreen>
        <TextField label="a" value="" onChangeText={() => {}} />
      </ScrollScreen>,
    );
    expect(tree.root.findAllByType(KeyboardAwareScrollView)).toHaveLength(1);
  });
});
