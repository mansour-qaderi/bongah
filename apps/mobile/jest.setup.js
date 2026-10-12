/* eslint-env jest */

// Native modules that do not exist under Jest are replaced by simple in-memory stand-ins.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  const storage = {
    getItem: async key => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => {
      store.set(key, value);
    },
    removeItem: async key => {
      store.delete(key);
    },
  };
  return { createAsyncStorage: () => storage };
});

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));

// MapLibre is native code. The stand-ins render plain views that keep the props a test needs to
// inspect (testID, onPress, data), so a test can "tap the map" by calling the map's onPress.
const mockFlyTo = jest.fn();
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = name => {
    const Component = ({ children, ...props }) =>
      React.createElement(View, { ...props, mockName: name }, children);
    Component.displayName = name;
    return Component;
  };
  const Camera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      flyTo: mockFlyTo,
    }));
    return React.createElement(View, { ...props, mockName: 'Camera' });
  });
  return {
    Map: passthrough('Map'),
    Camera,
    GeoJSONSource: passthrough('GeoJSONSource'),
    Layer: passthrough('Layer'),
    Marker: passthrough('Marker'),
    __flyTo: mockFlyTo,
  };
});

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
