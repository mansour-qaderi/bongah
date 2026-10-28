'use client';

import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { BuildingsIcon, CollapseIcon, ExpandIcon, ZoomInIcon, ZoomOutIcon } from './map-icons';
import { isTilted, toggleTilt } from './three-d-control';

export interface MapControlStackProps {
  /** The Mapbox map these buttons drive; nothing is drawn until there is one. */
  map: MapboxMap | null;
  /** Show the 3D (tilt) button. Default true. */
  tilt?: boolean;
  /** Show a fullscreen button: whether the map is fullscreen now, and what to do when it is pressed. */
  fullscreen?: { active: boolean; onToggle: () => void } | null;
  className?: string;
}

/** The look every control on the map shares: a flat white square with a thin border, green when it is switched on. */
export const CONTROL_BUTTON =
  'flex h-10 w-10 items-center justify-center text-ink-2 transition-colors duration-150 hover:bg-soft hover:text-primary ' +
  'focus-visible:relative focus-visible:z-[1] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-2 ' +
  'aria-pressed:bg-primary aria-pressed:text-white aria-pressed:hover:bg-primary-dark aria-pressed:hover:text-white';

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {children}
    </div>
  );
}

/**
 * The map's buttons, drawn in the panel's own style instead of Mapbox's stock ones: zoom in and out, the 3D view, and
 * fullscreen. They are ordinary page elements laid over the map, so they follow the panel's language and direction,
 * and a screen reader reads them like any other button.
 */
export function MapControlStack({ map, tilt = true, fullscreen = null, className }: MapControlStackProps) {
  const t = useT();
  const [tilted, setTilted] = useState(false);
  const [limits, setLimits] = useState({ min: false, max: false });

  useEffect(() => {
    if (!map) return;
    const sync = () => {
      setTilted(isTilted(map));
      const zoom = map.getZoom();
      setLimits({ min: zoom <= map.getMinZoom() + 0.01, max: zoom >= map.getMaxZoom() - 0.01 });
    };
    sync();
    map.on('zoom', sync);
    map.on('pitchend', sync);
    map.on('moveend', sync);
    return () => {
      map.off('zoom', sync);
      map.off('pitchend', sync);
      map.off('moveend', sync);
    };
  }, [map]);

  if (!map) return null;
  const hasSecond = tilt || !!fullscreen;
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="map-controls">
      <Group label={t('map.zoom')}>
        <button type="button" data-testid="zoom-in" className={CONTROL_BUTTON} onClick={() => map.zoomIn({ duration: 300 })} disabled={limits.max} aria-label={t('map.zoomIn')} title={t('map.zoomIn')}>
          <ZoomInIcon />
        </button>
        <button type="button" data-testid="zoom-out" className={CONTROL_BUTTON} onClick={() => map.zoomOut({ duration: 300 })} disabled={limits.min} aria-label={t('map.zoomOut')} title={t('map.zoomOut')}>
          <ZoomOutIcon />
        </button>
      </Group>
      {hasSecond ? (
        <Group label={t('map.view')}>
          {tilt ? (
            <button
              type="button"
              data-testid="view-3d"
              className={CONTROL_BUTTON}
              aria-pressed={tilted}
              aria-label={t('map.view3d')}
              title={t('map.view3d')}
              onClick={() => setTilted(toggleTilt(map))}
            >
              <BuildingsIcon />
            </button>
          ) : null}
          {fullscreen ? (
            <button
              type="button"
              data-testid="fullscreen"
              className={CONTROL_BUTTON}
              aria-label={fullscreen.active ? t('map.fullscreenExit') : t('map.fullscreen')}
              title={fullscreen.active ? t('map.fullscreenExit') : t('map.fullscreen')}
              onClick={fullscreen.onToggle}
            >
              {fullscreen.active ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          ) : null}
        </Group>
      ) : null}
    </div>
  );
}
