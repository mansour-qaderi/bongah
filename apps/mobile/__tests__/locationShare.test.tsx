import React from 'react';
import { Linking, Share } from 'react-native';
import i18next from 'i18next';
import ReactTestRenderer from 'react-test-renderer';
import BaseMap, { TILT_PITCH, TILT_ZOOM } from '../src/map/BaseMap';
import { AFGHANISTAN_CAMERA } from '../src/map/geo';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import ActionMenuSheet from '../src/components/ActionMenuSheet';
import ShareLocationSheet from '../src/components/ShareLocationSheet';
import {
  buildLocationShare,
  coordinateText,
  mapLink,
  shareWordsFrom,
  telegramShareUrl,
  whatsappShareUrl,
  type ShareWords,
} from '../src/share/locationShare';
import { mapParts, render } from '../test-utils';

const act = ReactTestRenderer.act;
const words: ShareWords = {
  heading: title => (title ? `📍 ${title}` : '📍'),
  mapLine: 'MAP:',
  coordinates: coords => `COORDS ${coords}`,
  listingLine: 'LISTING:',
};
const here = { latitude: 34.5281, longitude: 69.1761 };

describe('the location message', () => {
  it('writes the coordinates with six decimals and Latin digits, and links them to a map', () => {
    expect(coordinateText(34.5281, 69.1761)).toBe('34.528100, 69.176100');
    expect(mapLink(34.5281, 69.1761)).toBe(
      'https://www.google.com/maps/search/?api=1&query=34.528100%2C69.176100',
    );
  });

  it('puts the heading, the address, the map link, the coordinates and the listing link in that order', () => {
    const share = buildLocationShare(
      { ...here, title: ' خانه  در   شهر نو ', address: 'کابل، شهر نو', listingId: 'abc 1' },
      words,
    )!;
    expect(share.text.split('\n')).toEqual([
      '📍 خانه در شهر نو',
      'کابل، شهر نو',
      'MAP:',
      share.link,
      'COORDS 34.528100, 69.176100',
      'LISTING:',
      'https://bongah.app/listing/abc%201',
    ]);
    // Telegram gets the link separately, so the message must not repeat it.
    expect(share.textWithoutLink).not.toContain(share.link);
    expect(share.textWithoutLink).not.toContain('MAP:');
  });

  it('leaves out what it does not have: no title, no address, no listing', () => {
    const share = buildLocationShare(here, words)!;
    expect(share.text.split('\n')).toEqual(['📍', 'MAP:', share.link, 'COORDS 34.528100, 69.176100']);
  });

  it('refuses a position that is not one', () => {
    expect(buildLocationShare({ latitude: NaN, longitude: 69 }, words)).toBeNull();
    expect(buildLocationShare({ latitude: 91, longitude: 69 }, words)).toBeNull();
    expect(buildLocationShare({ latitude: 34, longitude: 181 }, words)).toBeNull();
  });

  it('builds the WhatsApp and Telegram addresses with everything encoded', () => {
    const text = 'a b\n&c';
    expect(whatsappShareUrl(text)).toBe('https://wa.me/?text=a%20b%0A%26c');
    expect(telegramShareUrl('https://x.test/?q=1&r=2', text)).toBe(
      'https://t.me/share/url?url=https%3A%2F%2Fx.test%2F%3Fq%3D1%26r%3D2&text=a%20b%0A%26c',
    );
  });

  it('has the same strings in Dari and Pashto', () => {
    expect(Object.keys(prs.shareLocation).sort()).toEqual(Object.keys(ps.shareLocation).sort());
    expect(prs.map.view3d).toBeTruthy();
    expect(ps.map.view3d).toBeTruthy();
  });
});

describe('the share sheet', () => {
  beforeAll(async () => {
    await initI18n();
  });
  afterEach(() => jest.restoreAllMocks());

  const open = async (place: React.ComponentProps<typeof ShareLocationSheet>['place']) => {
    const tree = await render(<ShareLocationSheet visible onClose={() => undefined} place={place} />);
    const actions = () => tree.root.findByType(ActionMenuSheet).props.actions as { label: string; onPress: () => void }[];
    return { tree, actions };
  };
  const place = { ...here, title: 'خانه', address: 'کابل', listingId: 'id-1' };

  it('offers WhatsApp, Telegram, copy and the phone\'s own share sheet', async () => {
    const { actions } = await open(place);
    expect(actions().map(a => a.label)).toEqual([
      prs.shareLocation.whatsapp,
      prs.shareLocation.telegram,
      prs.shareLocation.copy,
      prs.shareLocation.more,
    ]);
  });

  it('opens WhatsApp with the whole message and Telegram with the link and the message', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const { actions } = await open(place);
    const content = buildLocationShare(place, shareWordsFrom(i18next.t.bind(i18next) as never))!;
    actions()[0].onPress();
    expect(openURL).toHaveBeenLastCalledWith(whatsappShareUrl(content.text));
    actions()[1].onPress();
    expect(openURL).toHaveBeenLastCalledWith(telegramShareUrl(content.link, content.textWithoutLink));
    expect(content.text).toContain(content.link);
    expect(content.text).toContain('https://bongah.app/listing/id-1');
  });

  it('hands the message to the system share sheet, and does not mind it being closed', async () => {
    const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('dismissed'));
    const { actions } = await open(place);
    await act(async () => actions()[3].onPress());
    expect(share).toHaveBeenCalledTimes(1);
    expect((share.mock.calls[0][0] as { message: string }).message).toContain('34.528100, 69.176100');
  });

  it('offers nothing without a position', async () => {
    const { tree } = await open(null);
    expect(tree.root.findByType(ActionMenuSheet).props.visible).toBe(false);
  });
});

describe('BaseMap: the 3D view', () => {
  const tilt = () => (jest.requireMock('../src/map/native') as { __tilt: jest.Mock }).__tilt;
  beforeEach(() => tilt().mockClear());

  it('does nothing while the map is flat', async () => {
    await render(<BaseMap camera={AFGHANISTAN_CAMERA} />);
    expect(tilt()).not.toHaveBeenCalled();
  });

  it('leans back and comes close enough to see buildings, then lies flat again', async () => {
    const tree = await render(<BaseMap camera={AFGHANISTAN_CAMERA} tilted={false} />);
    await act(async () => tree.update(<BaseMap camera={AFGHANISTAN_CAMERA} tilted />));
    expect(tilt()).toHaveBeenLastCalledWith({ pitch: TILT_PITCH, zoom: TILT_ZOOM, duration: 900 });
    await act(async () => tree.update(<BaseMap camera={AFGHANISTAN_CAMERA} tilted={false} />));
    expect(tilt()).toHaveBeenLastCalledWith({ pitch: 0, duration: 700 });
    expect(tilt()).toHaveBeenCalledTimes(2);
  });

  it('never moves further out than the map already is', async () => {
    const tree = await render(<BaseMap camera={AFGHANISTAN_CAMERA} testID="m" />);
    const map = mapParts(tree.root, 'Map')[0];
    await act(async () => {
      map.props.onRegionDidChange({
        nativeEvent: { zoom: 18.2, bounds: [69, 34, 69.1, 34.1], userInteraction: true },
      });
    });
    await act(async () => tree.update(<BaseMap camera={AFGHANISTAN_CAMERA} testID="m" tilted />));
    expect(tilt()).toHaveBeenLastCalledWith({ pitch: TILT_PITCH, zoom: 18.2, duration: 900 });
  });

  it('keeps the finger from tilting the map: the button is the only way', async () => {
    const tree = await render(<BaseMap camera={AFGHANISTAN_CAMERA} tilted />);
    expect(mapParts(tree.root, 'Map')[0].props.touchPitch).toBe(false);
  });
});
