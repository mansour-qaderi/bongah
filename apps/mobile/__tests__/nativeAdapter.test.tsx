import React from 'react';
import { Platform, Text, View } from 'react-native';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { render } from '../test-utils';

// The adapter is the one file that talks to the Mapbox SDK, so here (and only here) it is the real file, run against
// a stand-in for the SDK itself. Every other test uses the stand-in for the adapter (jest.setup.js).
jest.unmock('../src/map/native');
jest.mock('@rnmapbox/maps', () => {
  const react = require('react');
  const { View: NativeView } = require('react-native');
  const part = (name: string) => {
    const Component = ({ children, ...props }: Record<string, unknown>) =>
      react.createElement(NativeView, { ...props, mockName: name }, children);
    Component.displayName = name;
    return Component;
  };
  const camera = { setCamera: jest.fn() };
  const Camera = react.forwardRef((props: object, ref: unknown) => {
    react.useImperativeHandle(ref, () => camera);
    return react.createElement(NativeView, { ...props, mockName: 'Camera' });
  });
  const listeners = new Set();
  return {
    __esModule: true,
    default: { setAccessToken: jest.fn(() => Promise.resolve(null)) },
    MapView: part('MapView'),
    Camera,
    MarkerView: part('MarkerView'),
    PointAnnotation: part('PointAnnotation'),
    ShapeSource: part('ShapeSource'),
    FillLayer: part('FillLayer'),
    LineLayer: part('LineLayer'),
    CircleLayer: part('CircleLayer'),
    SymbolLayer: part('SymbolLayer'),
    locationManager: {
      addListener: jest.fn((listener: unknown) => listeners.add(listener)),
      removeListener: jest.fn((listener: unknown) => listeners.delete(listener)),
      setMinDisplacement: jest.fn(),
    },
    requestAndroidLocationPermissions: jest.fn(async () => true),
    __camera: camera,
    __listeners: listeners,
  };
});

const sdk = jest.requireMock('@rnmapbox/maps') as {
  default: { setAccessToken: jest.Mock };
  locationManager: { addListener: jest.Mock; removeListener: jest.Mock; setMinDisplacement: jest.Mock };
  requestAndroidLocationPermissions: jest.Mock;
  __camera: { setCamera: jest.Mock };
  __listeners: Set<(fix: unknown) => void>;
};
// Loaded after the stand-in above is in place; the token was set by jest.setup.js before this file loaded.
const native = require('../src/map/native') as typeof import('../src/map/native');

const named = (root: ReactTestInstance, name: string) =>
  root.findAll(node => node.props?.mockName === name && typeof node.type === 'string');
const one = (root: ReactTestInstance, name: string) => {
  const found = named(root, name);
  if (found.length !== 1) throw new Error(`Expected one ${name}, found ${found.length}`);
  return found[0];
};

const idle = (overrides: Record<string, unknown> = {}) => ({
  properties: {
    center: [69.18, 34.56],
    bounds: { ne: [69.2, 34.6], sw: [69.1, 34.5] },
    zoom: 12.5,
    heading: 0,
    pitch: 0,
  },
  gestures: { isGestureActive: false },
  ...overrides,
});

// The adapter writes every load error to the log (on purpose); the tests read that log instead of printing it.
let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('map SDK adapter: setup', () => {
  it('gives the SDK the access token once, when the file loads', () => {
    expect(sdk.default.setAccessToken).toHaveBeenCalledTimes(1);
    expect(sdk.default.setAccessToken).toHaveBeenCalledWith('pk.jest-test-token');
  });
});

describe('map SDK adapter: styles', () => {
  it('turns kebab-case style properties into the SDK\'s camelCase ones, layout and paint together', () => {
    expect(
      native.layerStyle(
        { 'line-join': 'round', 'line-cap': 'round' },
        { 'line-color': '#2563EB', 'line-width': 4, 'line-dasharray': [1.5, 1.5], 'fill-opacity': 0.2 },
      ),
    ).toEqual({
      lineJoin: 'round',
      lineCap: 'round',
      lineColor: '#2563EB',
      lineWidth: 4,
      lineDasharray: [1.5, 1.5],
      fillOpacity: 0.2,
    });
    expect(native.layerStyle()).toEqual({});
  });

  it('draws each layer type with the SDK layer of that kind, with the zoom limits and style', async () => {
    const tree = await render(
      <>
        <native.Layer id="a" type="fill" minzoom={12} paint={{ 'fill-color': '#047857' }} />
        <native.Layer id="b" type="line" layout={{ 'line-join': 'round' }} paint={{ 'line-width': 3 }} />
        <native.Layer id="c" type="circle" paint={{ 'circle-radius': 5 }} />
        <native.Layer id="d" type="symbol" maxzoom={9} />
      </>,
    );
    expect(one(tree.root, 'FillLayer').props).toMatchObject({
      id: 'a',
      minZoomLevel: 12,
      style: { fillColor: '#047857' },
    });
    expect(one(tree.root, 'LineLayer').props.style).toEqual({ lineJoin: 'round', lineWidth: 3 });
    expect(one(tree.root, 'CircleLayer').props.style).toEqual({ circleRadius: 5 });
    expect(one(tree.root, 'SymbolLayer').props).toMatchObject({ id: 'd', maxZoomLevel: 9 });
  });

  it('draws a source with the shapes it is given', async () => {
    const data = { type: 'FeatureCollection' as const, features: [] };
    const tree = await render(
      <native.GeoJSONSource id="route" data={data}>
        <native.Layer id="route-line" type="line" />
      </native.GeoJSONSource>,
    );
    expect(one(tree.root, 'ShapeSource').props).toMatchObject({ id: 'route', shape: data });
    expect(named(tree.root, 'LineLayer')).toHaveLength(1);
  });
});

describe('map SDK adapter: the map', () => {
  it('reads a style given by address from that address, and one given in full as text', async () => {
    const byAddress = await render(<native.Map mapStyle="mapbox://styles/mapbox/streets-v12" />);
    expect(one(byAddress.root, 'MapView').props.styleURL).toBe('mapbox://styles/mapbox/streets-v12');
    expect(one(byAddress.root, 'MapView').props.styleJSON).toBeUndefined();

    const style = { version: 8, sources: {}, layers: [] };
    const inFull = await render(<native.Map mapStyle={style} />);
    expect(one(inFull.root, 'MapView').props.styleURL).toBeUndefined();
    expect(JSON.parse(one(inFull.root, 'MapView').props.styleJSON)).toEqual(style);
  });

  it('turns the style into text once per style object, not on every render', async () => {
    const style = { version: 8, sources: {}, layers: [] };
    const tree = await render(<native.Map mapStyle={style} />);
    const first = one(tree.root, 'MapView').props.styleJSON;
    await ReactTestRenderer.act(async () => {
      tree.update(<native.Map mapStyle={style} testID="again" />);
    });
    expect(one(tree.root, 'MapView').props.styleJSON).toBe(first);
  });

  it('shows no Mapbox logo, no credit button, no compass and no scale bar by default, and the logo / credit only when asked for', async () => {
    const tree = await render(<native.Map mapStyle="x" />);
    expect(one(tree.root, 'MapView').props).toMatchObject({
      logoEnabled: false,
      attributionEnabled: false,
      compassEnabled: false,
      scaleBarEnabled: false,
    });
    const asked = await render(<native.Map mapStyle="x" logo attribution />);
    expect(one(asked.root, 'MapView').props).toMatchObject({ logoEnabled: true, attributionEnabled: true });
  });

  it('maps the gesture switches, and the Android view kind', async () => {
    const frozen = await render(
      <native.Map
        mapStyle="x"
        androidView="texture"
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        doubleTapHoldZoom={false}
        touchRotate={false}
        touchPitch={false}
      />,
    );
    expect(one(frozen.root, 'MapView').props).toMatchObject({
      surfaceView: false,
      scrollEnabled: false,
      zoomEnabled: false,
      rotateEnabled: false,
      pitchEnabled: false,
      gestureSettings: {
        doubleTapToZoomInEnabled: false,
        doubleTouchToZoomOutEnabled: false,
        quickZoomEnabled: false,
      },
    });
    const free = await render(<native.Map mapStyle="x" />);
    expect(one(free.root, 'MapView').props).toMatchObject({ surfaceView: true, scrollEnabled: true });
  });

  it('says the map failed only when the style or a source could not be had', async () => {
    const failed = jest.fn();
    const tree = await render(<native.Map mapStyle="x" onDidFailLoadingMap={failed} />);
    const report = one(tree.root, 'MapView').props.onMapLoadingError;
    report({ error: 'no sprite', type: 'sprite' });
    report({ error: 'no glyphs', type: 'glyphs' });
    report({ error: 'tile 403', type: 'tile' });
    expect(failed).not.toHaveBeenCalled();
    report({ error: 'Unauthorized', type: 'style' });
    report({ error: 'source', type: 'source' });
    report(undefined);
    expect(failed).toHaveBeenCalledTimes(3);
    expect(native.isFatalLoadError({ type: 'style' })).toBe(true);
    expect(native.isFatalLoadError({ type: 'tile' })).toBe(false);
  });

  it('counts a refused token (HTTP 401 / 403) as a failed map whatever the request was for', async () => {
    const failed = jest.fn();
    const tree = await render(<native.Map mapStyle="x" onDidFailLoadingMap={failed} />);
    const report = one(tree.root, 'MapView').props.onMapLoadingError;
    report({ error: 'Request failed with status code 403', type: 'tile' });
    report({ error: 'Unauthorized', type: 'glyphs' });
    expect(failed).toHaveBeenCalledTimes(2);
    expect(native.isFatalLoadError({ type: 'sprite', error: 'HTTP status code: 401' })).toBe(true);
    expect(native.isFatalLoadError({ type: 'tile', error: 'tile 4031' })).toBe(false);
  });

  it('gives up after a number of lost tiles when asked to (the satellite photographs), counting again for a new style', async () => {
    const failed = jest.fn();
    const tree = await render(<native.Map mapStyle="a" failAfterTileErrors={3} onDidFailLoadingMap={failed} />);
    const report = () => one(tree.root, 'MapView').props.onMapLoadingError;
    report()({ error: 'timeout', type: 'tile' });
    report()({ error: 'timeout', type: 'tile' });
    report()({ error: 'a sprite', type: 'sprite' }); // not a tile: not counted
    expect(failed).not.toHaveBeenCalled();
    report()({ error: 'timeout', type: 'tile' });
    expect(failed).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      tree.update(<native.Map mapStyle="b" failAfterTileErrors={3} onDidFailLoadingMap={failed} />);
    });
    report()({ error: 'timeout', type: 'tile' });
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('writes the exact load error to the log, once for each distinct problem', async () => {
    const tree = await render(<native.Map mapStyle="x" />);
    const report = one(tree.root, 'MapView').props.onMapLoadingError;
    const payload = { error: 'Unauthorized (401) for logs-test', type: 'style', sourceId: 'composite' };
    report(payload);
    report(payload);
    const lines = warn.mock.calls.map(call => String(call[0])).filter(line => line.includes('logs-test'));
    expect(lines).toEqual(['[map] load failed (style, source composite: Unauthorized (401) for logs-test)']);
    expect(native.describeLoadError({ type: 'tile', tileId: 'x:1 y:2 z:3', error: 'timeout' })).toBe(
      'tile, tile x:1 y:2 z:3: timeout',
    );
    expect(native.describeLoadError(undefined)).toBe('no details from the SDK');
  });

  it('reports where the map settled: centre, zoom and [west, south, east, north]', async () => {
    const changed = jest.fn();
    const tree = await render(<native.Map mapStyle="x" onRegionDidChange={changed} />);
    one(tree.root, 'MapView').props.onMapIdle(idle());
    expect(changed).toHaveBeenCalledWith({
      nativeEvent: {
        center: [69.18, 34.56],
        zoom: 12.5,
        bounds: [69.1, 34.5, 69.2, 34.6],
        userInteraction: false,
      },
    });
  });

  it('tells a finger\'s move from a fly-to: a gesture seen before the map settled counts, once', async () => {
    const changed = jest.fn();
    const tree = await render(<native.Map mapStyle="x" onRegionDidChange={changed} />);
    const props = one(tree.root, 'MapView').props;
    props.onCameraChanged(idle({ gestures: { isGestureActive: true } }));
    props.onCameraChanged(idle({ gestures: { isGestureActive: false } }));
    props.onMapIdle(idle());
    props.onMapIdle(idle()); // the next settle (a fly-to the app asked for) is not the finger's
    expect(changed.mock.calls.map(call => call[0].nativeEvent.userInteraction)).toEqual([true, false]);
  });

  it('turns a tap into the tapped [longitude, latitude]', async () => {
    const pressed = jest.fn();
    const tree = await render(<native.Map mapStyle="x" onPress={pressed} />);
    one(tree.root, 'MapView').props.onPress({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [61.86, 30.96] },
      properties: { screenPointX: 120, screenPointY: 340 },
    });
    expect(pressed).toHaveBeenCalledWith({ nativeEvent: { lngLat: [61.86, 30.96], point: [120, 340] } });
  });

  it('does not listen for taps nobody handles', async () => {
    const tree = await render(<native.Map mapStyle="x" />);
    expect(one(tree.root, 'MapView').props.onPress).toBeUndefined();
  });
});

describe('map SDK adapter: the camera', () => {
  beforeEach(() => sdk.__camera.setCamera.mockClear());

  it('starts at the given view and does not pin the centre afterwards', async () => {
    const tree = await render(
      <native.Camera initialViewState={{ center: [69.17, 34.52], zoom: 12, padding: { bottom: 240 } }} />,
    );
    const props = one(tree.root, 'Camera').props;
    expect(props.defaultSettings).toEqual({
      centerCoordinate: [69.17, 34.52],
      zoomLevel: 12,
      padding: { paddingBottom: 240 },
    });
    expect(props.centerCoordinate).toBeUndefined();
    expect(props.zoomLevel).toBeUndefined();
  });

  it('glides to a place with the asked zoom, bottom padding and duration', async () => {
    const ref = React.createRef<import("../src/map/native").CameraRef>();
    await render(<native.Camera ref={ref} initialViewState={{ center: [0, 0], zoom: 3 }} />);
    ref.current!.flyTo({ center: [62.2, 34.34], zoom: 9, padding: { bottom: 120 }, duration: 600 });
    expect(sdk.__camera.setCamera).toHaveBeenCalledWith({
      centerCoordinate: [62.2, 34.34],
      zoomLevel: 9,
      padding: { paddingBottom: 120 },
      animationDuration: 600,
      animationMode: 'flyTo',
    });
    ref.current!.flyTo({ center: [1, 2], zoom: 5 });
    expect(sdk.__camera.setCamera).toHaveBeenLastCalledWith(
      expect.objectContaining({ centerCoordinate: [1, 2], padding: undefined }),
    );
  });
});

describe('map SDK adapter: tilting', () => {
  it('eases the pitch (and the zoom, when asked) without moving the centre', async () => {
    const ref = React.createRef<import("../src/map/native").CameraRef>();
    await render(<native.Camera ref={ref} initialViewState={{ center: [0, 0], zoom: 3 }} />);
    sdk.__camera.setCamera.mockClear();
    ref.current!.tilt({ pitch: 55, zoom: 16, duration: 900 });
    expect(sdk.__camera.setCamera).toHaveBeenCalledWith({
      pitch: 55,
      zoomLevel: 16,
      animationDuration: 900,
      animationMode: 'easeTo',
    });
    ref.current!.tilt({ pitch: 0, duration: 700 });
    const flat = sdk.__camera.setCamera.mock.calls.at(-1)![0];
    expect(flat).toMatchObject({ pitch: 0, animationDuration: 700, animationMode: 'easeTo' });
    expect(flat.centerCoordinate).toBeUndefined();
  });
});

describe('map SDK adapter: markers', () => {
  it('puts the marker\'s anchor point on the place: bottom for pins, centre for dots', () => {
    expect(native.anchorPoint()).toEqual({ x: 0.5, y: 0.5 });
    expect(native.anchorPoint('center')).toEqual({ x: 0.5, y: 0.5 });
    expect(native.anchorPoint('bottom')).toEqual({ x: 0.5, y: 1 });
    expect(native.anchorPoint('top-left')).toEqual({ x: 0, y: 0 });
    expect(native.anchorPoint('bottom-right')).toEqual({ x: 1, y: 1 });
    expect(native.anchorPoint('left')).toEqual({ x: 0, y: 0.5 });
  });

  it('draws every marker (the app groups close ones itself) and passes taps through when asked', async () => {
    const tapped = jest.fn();
    const tree = await render(
      <>
        <native.Marker id="a" lngLat={[69.1, 34.5]} anchor="bottom" onPress={tapped}>
          <Text>a</Text>
        </native.Marker>
        <native.Marker id="b" lngLat={[69.2, 34.6]}>
          <Text>b</Text>
        </native.Marker>
      </>,
    );
    const [first, second] = named(tree.root, 'MarkerView');
    expect(first.props).toMatchObject({ coordinate: [69.1, 34.5], anchor: { x: 0.5, y: 1 }, allowOverlap: true });
    expect(second.props).toMatchObject({ coordinate: [69.2, 34.6], anchor: { x: 0.5, y: 0.5 } });
    const press = first.findAll(node => typeof node.props?.onPress === 'function')[0];
    press.props.onPress();
    expect(tapped).toHaveBeenCalledTimes(1);
    expect(second.findAll(node => typeof node.props?.onPress === 'function')).toHaveLength(0);
  });

  it('a pin that cannot be dragged is a plain marker', async () => {
    const tree = await render(
      <native.ViewAnnotation id="chosen" lngLat={[1, 2]}>
        <View />
      </native.ViewAnnotation>,
    );
    expect(named(tree.root, 'MarkerView')).toHaveLength(1);
    expect(named(tree.root, 'PointAnnotation')).toHaveLength(0);
  });

  it('a draggable pin reports where it was dropped as [longitude, latitude]', async () => {
    const dropped = jest.fn();
    const tree = await render(
      <native.ViewAnnotation id="chosen" lngLat={[69.1, 34.5]} anchor="bottom" draggable onDragEnd={dropped}>
        <View />
      </native.ViewAnnotation>,
    );
    const pin = one(tree.root, 'PointAnnotation');
    expect(pin.props).toMatchObject({ id: 'chosen', coordinate: [69.1, 34.5], draggable: true, anchor: { x: 0.5, y: 1 } });
    pin.props.onDragEnd({ type: 'Feature', geometry: { type: 'Point', coordinates: [69.15, 34.55] }, properties: {} });
    expect(dropped).toHaveBeenCalledWith({ nativeEvent: { lngLat: [69.15, 34.55] } });
  });
});

describe('map SDK adapter: the phone\'s position', () => {
  const fixAt = (age: number | undefined, latitude = 34.5) => ({
    coords: { latitude, longitude: 69.1, accuracy: 8 },
    timestamp: age === undefined ? undefined : Date.now() - age,
  });
  const lastListener = () => [...sdk.__listeners].at(-1)!;

  beforeEach(() => {
    jest.useFakeTimers();
    sdk.__listeners.clear();
    sdk.locationManager.addListener.mockClear();
    sdk.locationManager.removeListener.mockClear();
    sdk.requestAndroidLocationPermissions.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('asks Android for permission with its own prompt, and lets iOS start (its prompt comes with the module)', async () => {
    expect(await native.LocationManager.requestPermissions()).toBe(true);
    expect(sdk.requestAndroidLocationPermissions).not.toHaveBeenCalled();

    const android = jest.replaceProperty(Platform, 'OS', 'android');
    expect(await native.LocationManager.requestPermissions()).toBe(true);
    sdk.requestAndroidLocationPermissions.mockResolvedValueOnce(false);
    expect(await native.LocationManager.requestPermissions()).toBe(false);
    sdk.requestAndroidLocationPermissions.mockRejectedValueOnce(new Error('boom'));
    expect(await native.LocationManager.requestPermissions()).toBe(false);
    android.restore();
  });

  it('gives the first fresh position, with a timestamp, and stops listening', async () => {
    const position = native.LocationManager.getCurrentPosition();
    expect(sdk.__listeners.size).toBe(1);
    lastListener()(fixAt(1_000));
    const fix = await position;
    expect(fix?.coords.latitude).toBe(34.5);
    expect(typeof fix?.timestamp).toBe('number');
    expect(sdk.__listeners.size).toBe(0);
  });

  it('ignores the old position the SDK hands over first and waits for a fresh one', async () => {
    const position = native.LocationManager.getCurrentPosition();
    const listener = lastListener();
    listener(fixAt(3 * 60 * 60 * 1000, 10)); // three hours old
    expect(sdk.__listeners.size).toBe(1);
    listener(fixAt(500, 34.7));
    expect((await position)?.coords.latitude).toBe(34.7);
  });

  it('stamps a position that comes without a time', async () => {
    const position = native.LocationManager.getCurrentPosition();
    lastListener()(fixAt(undefined));
    expect(typeof (await position)?.timestamp).toBe('number');
  });

  it('gives up with nothing, and stops listening, when no position comes', async () => {
    const position = native.LocationManager.getCurrentPosition();
    jest.advanceTimersByTime(16_000);
    expect(await position).toBeUndefined();
    expect(sdk.__listeners.size).toBe(0);
  });

  it('gives nothing, never an error, when the module refuses to start', async () => {
    sdk.locationManager.addListener.mockImplementationOnce(() => {
      throw new Error('no permission');
    });
    expect(await native.LocationManager.getCurrentPosition()).toBeUndefined();
  });

  it('streams positions to a listener until it is removed, each with a timestamp', () => {
    const heard: unknown[] = [];
    const listener = (fix: unknown) => heard.push(fix);
    native.LocationManager.addListener(listener);
    native.LocationManager.addListener(listener); // twice is still once
    expect(sdk.__listeners.size).toBe(1);
    lastListener()(fixAt(undefined, 34.9));
    expect(heard).toHaveLength(1);
    expect((heard[0] as { timestamp: number }).timestamp).toEqual(expect.any(Number));
    native.LocationManager.removeListener(listener);
    expect(sdk.__listeners.size).toBe(0);
    native.LocationManager.removeListener(listener); // removing what is not there is harmless
    native.LocationManager.setMinDisplacement(5);
    expect(sdk.locationManager.setMinDisplacement).toHaveBeenCalledWith(5);
  });
});
