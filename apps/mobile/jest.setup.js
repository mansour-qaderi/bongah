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
  // The phone's position. A test sets `grant` (what the permission prompt answers) and `position`
  // (undefined = no fix, the default), and reads `requests` / `fixes` to see whether the app asked.
  const location = {
    grant: true,
    position: undefined,
    requests: 0,
    fixes: 0,
  };
  const LocationManager = {
    requestPermissions: async () => {
      location.requests += 1;
      return location.grant;
    },
    getCurrentPosition: async () => {
      location.fixes += 1;
      return location.position;
    },
  };
  return {
    Map: passthrough('Map'),
    Camera,
    GeoJSONSource: passthrough('GeoJSONSource'),
    Layer: passthrough('Layer'),
    Marker: passthrough('Marker'),
    LocationManager,
    __flyTo: mockFlyTo,
    __location: location,
  };
});

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// The chat socket and the picture picker are native / networked: stand-ins the tests can drive.
jest.mock('socket.io-client', () => require('./test-utils/mockSocket'));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
  launchCamera: jest.fn(async () => ({ didCancel: true })),
}));

// Firebase Cloud Messaging is native. The stand-in answers like a phone that allows notifications and has a token;
// a test changes `__state` (permission, token, what the prompt answers) or calls `__emitTokenRefresh`.
jest.mock('@react-native-firebase/messaging', () => {
  const AuthorizationStatus = {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  };
  const state = {
    token: 'fcm-token-1',
    permission: AuthorizationStatus.AUTHORIZED,
    // What the permission prompt answers; null: the same as the current permission.
    promptAnswer: null,
  };
  const refreshListeners = new Set();
  return {
    __esModule: true,
    AuthorizationStatus,
    getMessaging: jest.fn(() => ({})),
    getToken: jest.fn(async () => state.token),
    hasPermission: jest.fn(async () => state.permission),
    requestPermission: jest.fn(async () => {
      if (state.promptAnswer !== null) state.permission = state.promptAnswer;
      return state.permission;
    }),
    onTokenRefresh: jest.fn((_messaging, listener) => {
      refreshListeners.add(listener);
      return () => refreshListeners.delete(listener);
    }),
    __state: state,
    __emitTokenRefresh: token =>
      refreshListeners.forEach(listener => listener(token)),
  };
});
