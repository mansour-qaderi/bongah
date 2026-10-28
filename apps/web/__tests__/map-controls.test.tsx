// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { MapControlStack } from '@/components/map/map-controls';
import { TILT_PITCH, TILT_ZOOM, isTilted, toggleTilt } from '@/components/map/three-d-control';

/** A map with just what the buttons use. */
function fakeMap(start: { zoom?: number; pitch?: number; min?: number; max?: number } = {}) {
  const state = { zoom: start.zoom ?? 12, pitch: start.pitch ?? 0 };
  const handlers = new Map<string, Set<() => void>>();
  const map = {
    getZoom: () => state.zoom,
    getPitch: () => state.pitch,
    getMinZoom: () => start.min ?? 0,
    getMaxZoom: () => start.max ?? 20,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    easeTo: vi.fn((o: { pitch: number; zoom?: number }) => {
      state.pitch = o.pitch;
      if (o.zoom !== undefined) state.zoom = o.zoom;
    }),
    on: (name: string, fn: () => void) => handlers.set(name, (handlers.get(name) ?? new Set()).add(fn)),
    off: (name: string, fn: () => void) => handlers.get(name)?.delete(fn),
  };
  return { map, state, fire: (name: string) => handlers.get(name)?.forEach((fn) => fn()) };
}

const word = (key: Parameters<typeof translate>[1]) => translate('prs', key);
const show = (map: unknown, props: Partial<React.ComponentProps<typeof MapControlStack>> = {}) =>
  render(
    <LanguageProvider initialLanguage="prs">
      <MapControlStack map={map as MapboxMap} {...props} />
    </LanguageProvider>,
  );

afterEach(() => cleanup());

describe('the tilt', () => {
  it('tilts the map and comes no further out than where buildings rise', () => {
    const { map } = fakeMap({ zoom: 12 });
    expect(toggleTilt(map)).toBe(true);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: TILT_PITCH, zoom: TILT_ZOOM, duration: 900 });
  });

  it('keeps a closer zoom, and flattens on the second press', () => {
    const { map } = fakeMap({ zoom: 18 });
    toggleTilt(map);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: TILT_PITCH, zoom: 18, duration: 900 });
    expect(isTilted(map)).toBe(true);
    expect(toggleTilt(map)).toBe(false);
    expect(map.easeTo).toHaveBeenLastCalledWith({ pitch: 0, duration: 700 });
  });
});

describe('the control buttons', () => {
  it('draw nothing until there is a map', () => {
    show(null);
    expect(screen.queryByTestId('map-controls')).toBeNull();
  });

  it('zoom in and out, named in the language shown', () => {
    const { map } = fakeMap();
    show(map);
    fireEvent.click(screen.getByRole('button', { name: word('map.zoomIn') }));
    fireEvent.click(screen.getByRole('button', { name: word('map.zoomOut') }));
    expect(map.zoomIn).toHaveBeenCalledTimes(1);
    expect(map.zoomOut).toHaveBeenCalledTimes(1);
  });

  it('switch off the zoom button that cannot go further', () => {
    const { map } = fakeMap({ zoom: 20, max: 20 });
    show(map);
    expect((screen.getByTestId('zoom-in') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('zoom-out') as HTMLButtonElement).disabled).toBe(false);
  });

  it('show the 3D button pressed while the map is tilted, and follow the map when something else tilts it', () => {
    const { map, state, fire } = fakeMap();
    show(map);
    const button = screen.getByTestId('view-3d');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    state.pitch = 0; // "show all" flattens the map
    act(() => fire('pitchend'));
    expect(screen.getByTestId('view-3d').getAttribute('aria-pressed')).toBe('false');
  });

  it('leave out 3D and fullscreen unless asked for', () => {
    const { map } = fakeMap();
    show(map, { tilt: false });
    expect(screen.queryByTestId('view-3d')).toBeNull();
    expect(screen.queryByTestId('fullscreen')).toBeNull();
  });

  it('toggle fullscreen and say what the next press does', () => {
    const { map } = fakeMap();
    const onToggle = vi.fn();
    const { rerender } = show(map, { fullscreen: { active: false, onToggle } });
    fireEvent.click(screen.getByRole('button', { name: word('map.fullscreen') }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(
      <LanguageProvider initialLanguage="prs">
        <MapControlStack map={map as unknown as MapboxMap} fullscreen={{ active: true, onToggle }} />
      </LanguageProvider>,
    );
    expect(screen.getByRole('button', { name: word('map.fullscreenExit') })).toBeTruthy();
  });

  it('stop listening to the map when they go away', () => {
    const { map } = fakeMap();
    const off = vi.spyOn(map, 'off');
    const view = show(map);
    view.unmount();
    expect(off).toHaveBeenCalledWith('zoom', expect.any(Function));
    expect(off).toHaveBeenCalledWith('pitchend', expect.any(Function));
  });
});
