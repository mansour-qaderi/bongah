import React from 'react';
import { MAP_STYLE_URL, SATELLITE_STYLE_URL } from '../src/config';
import * as config from '../src/config';
import { AFGHANISTAN_CAMERA } from '../src/map/geo';
import BaseMap, { SATELLITE_TILE_ERRORS } from '../src/map/BaseMap';
import { resetMapStyleForTests, setMapStyle } from '../src/map/mapStyleStore';
import { FALLBACK_MAP_STYLE, SATELLITE_MAP_STYLE, type StyleSpecification } from '../src/map/style';
import { mapParts, render } from '../test-utils';
import ReactTestRenderer from 'react-test-renderer';

// useStreetStyle and useSatelliteStyle are stand-ins here (jest.setup.js); each test says what they answer.
const mocked = () => jest.requireMock('../src/map/streetStyle') as { useStreetStyle: jest.Mock; useSatelliteStyle: jest.Mock };
const hook = () => mocked().useStreetStyle;
const satelliteHook = () => mocked().useSatelliteStyle;
const localized: StyleSpecification = { version: 8, name: 'local labels', sources: {}, layers: [] };

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const drawn = async () => {
  const tree = await render(<BaseMap camera={AFGHANISTAN_CAMERA} testID="m" />);
  mounted.push(tree);
  return tree;
};
// A map left on screen keeps listening to the map-style choice, and the next test's choice would update it unobserved.
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});
const mapOf = (tree: ReactTestRenderer.ReactTestRenderer) => mapParts(tree.root, 'Map')[0];

describe('BaseMap: which style it draws', () => {
  beforeEach(() => {
    resetMapStyleForTests();
    hook().mockReturnValue({ status: 'unavailable' });
    satelliteHook().mockReturnValue({ status: 'unavailable' });
  });

  it('draws Mapbox Streets by address when the label-adjusted copy is not available', async () => {
    const tree = await drawn();
    expect(mapOf(tree).props.mapStyle).toBe(MAP_STYLE_URL);
    expect(hook()).toHaveBeenLastCalledWith(true);
  });

  it('draws the label-adjusted copy once it is ready', async () => {
    hook().mockReturnValue({ status: 'ready', style: localized });
    const tree = await drawn();
    expect(mapOf(tree).props.mapStyle).toBe(localized);
  });

  it('draws no map while the adjusted style is on its way, only a quiet placeholder with the same test id', async () => {
    hook().mockReturnValue({ status: 'loading' });
    const tree = await drawn();
    expect(mapParts(tree.root, 'Map')).toHaveLength(0);
    expect(tree.root.findAll(n => n.props.testID === 'm').length).toBeGreaterThan(0);
  });

  it('draws no Mapbox logo and no credit button (removed on request)', async () => {
    const tree = await drawn();
    expect(mapOf(tree).props.logo).toBe(false);
    expect(mapOf(tree).props.attribution).toBe(false);
  });

  it('uses the plain OpenStreetMap tiles, and downloads nothing, when the app has no Mapbox token', async () => {
    const token = jest.replaceProperty(config, 'MAPBOX_ACCESS_TOKEN', '');
    try {
      const tree = await drawn();
      expect(mapOf(tree).props.mapStyle).toBe(FALLBACK_MAP_STYLE);
      expect(hook()).toHaveBeenLastCalledWith(false);
    } finally {
      token.restore();
    }
  });

  it('switches to the plain tiles when Mapbox cannot be reached, and tries Mapbox again for the next map', async () => {
    const tree = await drawn();
    await ReactTestRenderer.act(async () => {
      mapOf(tree).props.onDidFailLoadingMap();
    });
    expect(mapOf(tree).props.mapStyle).toBe(FALLBACK_MAP_STYLE);
    expect(hook()).toHaveBeenLastCalledWith(false);
    const next = await drawn();
    expect(mapOf(next).props.mapStyle).toBe(MAP_STYLE_URL);
  });

  describe('the satellite view', () => {
    beforeEach(async () => {
      await setMapStyle('satellite');
    });

    it('draws Mapbox Satellite Streets by address when the label-adjusted copy is not available, asking for it and not for the street one', async () => {
      const tree = await drawn();
      expect(mapOf(tree).props.mapStyle).toBe(SATELLITE_STYLE_URL);
      expect(SATELLITE_MAP_STYLE).toBe(SATELLITE_STYLE_URL);
      expect(satelliteHook()).toHaveBeenLastCalledWith(true);
      expect(hook()).toHaveBeenLastCalledWith(false);
    });

    it('draws the label-adjusted satellite copy once it is ready (never the street one)', async () => {
      satelliteHook().mockReturnValue({ status: 'ready', style: localized });
      hook().mockReturnValue({ status: 'ready', style: { ...localized, name: 'street' } });
      const tree = await drawn();
      expect(mapOf(tree).props.mapStyle).toBe(localized);
    });

    it('draws no map while the adjusted satellite style is on its way', async () => {
      satelliteHook().mockReturnValue({ status: 'loading' });
      const tree = await drawn();
      expect(mapParts(tree.root, 'Map')).toHaveLength(0);
    });

    it('falls back to the plain street tiles, downloading nothing, when the app has no Mapbox token', async () => {
      const token = jest.replaceProperty(config, 'MAPBOX_ACCESS_TOKEN', '');
      try {
        const tree = await drawn();
        expect(mapOf(tree).props.mapStyle).toBe(FALLBACK_MAP_STYLE);
        expect(satelliteHook()).toHaveBeenLastCalledWith(false);
      } finally {
        token.restore();
      }
    });

    it('goes back to the bright street map (streets-v12), not to a blank canvas, when the satellite style cannot be loaded', async () => {
      const tree = await drawn();
      await ReactTestRenderer.act(async () => {
        mapOf(tree).props.onDidFailLoadingMap();
        await new Promise<void>(done => setTimeout(done, 0)); // the choice is stored, then announced
      });
      expect(mapOf(tree).props.mapStyle).toBe(MAP_STYLE_URL);
      expect(MAP_STYLE_URL).toBe('mapbox://styles/mapbox/streets-v12');
      // The choice itself went back to the street map, so the style button shows what is on screen and the next
      // map (and the next start) opens on the street map.
      const next = await drawn();
      expect(mapOf(next).props.mapStyle).toBe(MAP_STYLE_URL);
      expect(hook()).toHaveBeenLastCalledWith(true);
    });

    it('gives up on the satellite photographs after a few lost tiles, and never on the street map for that', async () => {
      const tree = await drawn();
      expect(mapOf(tree).props.failAfterTileErrors).toBe(SATELLITE_TILE_ERRORS);
      await setMapStyle('street');
      const street = await drawn();
      expect(mapOf(street).props.failAfterTileErrors).toBeUndefined();
    });
  });
});
