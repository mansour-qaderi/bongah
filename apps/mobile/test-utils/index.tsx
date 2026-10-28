import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

/** Renders and waits for the first effects (async i18n/storage, fetches) to settle. */
export async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

export const flush = () => ReactTestRenderer.act(async () => {});

/** All visible text in the tree, joined. */
export function allText(root: ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .filter(child => typeof child === 'string' || typeof child === 'number')
    .join(' ');
}

/**
 * The outermost element with an onPress handler whose text contains `label`. (Pressable is a
 * memo wrapper, so it cannot be found by type; the handler prop is what a tap would call.)
 */
export function pressableWith(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        allText(node).includes(label),
    )
    .shift();
  if (!match) throw new Error(`No button with text "${label}"`);
  return match;
}

export function inputAt(
  root: ReactTestInstance,
  index: number,
): ReactTestInstance {
  return root.findAllByType(TextInput)[index];
}

export function jsonResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

/** The text field with this accessibility label (TextField sets it from its label). */
export function inputLabelled(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance {
  const match = root
    .findAllByType(TextInput)
    .find(node => node.props.accessibilityLabel === label);
  if (!match) throw new Error(`No input labelled "${label}"`);
  return match;
}

type Reply = { status?: number; body?: unknown };

/**
 * Answers fetch by "METHOD /path" (query string ignored) and records every call. Anything not
 * listed is a 404, so a screen that calls an endpoint the test did not expect fails loudly.
 */
export function mockApi(
  fetchMock: jest.Mock,
  routes: Record<string, Reply | ((init: RequestInit) => Reply)>,
) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const key = `${init.method ?? 'GET'} ${path}`;
    const route = routes[key];
    if (!route) return jsonResponse(404, { message: `no route for ${key}` });
    const reply = typeof route === 'function' ? route(init) : route;
    return jsonResponse(reply.status ?? 200, reply.body);
  });
}

/** Every request made so far as { method, path, query, body }. */
export function callsTo(fetchMock: jest.Mock) {
  return fetchMock.mock.calls.map(([url, init]: [string, RequestInit?]) => {
    const parsed = new URL(url);
    return {
      method: init?.method ?? 'GET',
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
  });
}

/** A press on the (mock) map at [longitude, latitude]. */
export function tapMap(
  root: ReactTestInstance,
  testID: string,
  lngLat: [number, number],
) {
  // The map stand-in itself (not our BaseMap/LocationPicker wrappers, which share the testID
  // but take an already-decoded coordinate).
  const map = root.findAll(
    node =>
      node.props.mockName === 'Map' &&
      node.props.testID === testID &&
      typeof node.type === 'string' &&
      typeof node.props.onPress === 'function',
  )[0];
  if (!map) throw new Error(`No map with testID "${testID}"`);
  map.props.onPress({ nativeEvent: { lngLat, point: [0, 0] } });
}

/** Elements of the (mock) map component with this name, e.g. 'Marker'. */
export const mapParts = (root: ReactTestInstance, name: string) =>
  root.findAll(
    node => node.props.mockName === name && typeof node.type === 'string',
  );

/**
 * Chooses a property type on the listing form, which has it as a dropdown: opens the box, then taps the row.
 * `value` is the type's code ("LAND", "GARAGE"), not its Dari name.
 */
export async function chooseType(root: ReactTestInstance, value: string) {
  await ReactTestRenderer.act(async () => {
    root
      .find(n => n.props.testID === 'type-select' && typeof n.props.onPress === 'function')
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    root
      .find(
        n =>
          n.props.testID === `type-select-option-${value}` &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress();
  });
}

/** Opens the property-type dropdown and returns its rows in the order they are listed ({ value: "LAND", label: "زمین" }). */
export async function typeOptions(root: ReactTestInstance) {
  await ReactTestRenderer.act(async () => {
    root
      .find(n => n.props.testID === 'type-select' && typeof n.props.onPress === 'function')
      .props.onPress();
  });
  return root
    .findAll(
      n =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('type-select-option-') &&
        typeof n.props.onPress === 'function',
    )
    .map(n => ({
      value: (n.props.testID as string).replace('type-select-option-', ''),
      label: allText(n),
    }));
}
