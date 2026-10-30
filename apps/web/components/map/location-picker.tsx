'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import type { Market } from '@bongah/shared-types';
import { useT } from '@/i18n/provider';
import { useMarketT } from '@/i18n/use-labels';
import { useActiveMarket } from '@/hooks/use-active-market';
import { marketName } from '@/lib/market';
import { cn } from '@/lib/cn';
import { detailTheme, fallbackStyle, localizeLabels, MAPBOX_TOKEN, mapStyle, TILE_MAX_ZOOM } from '@/lib/map-config';
import { enhanceDetail } from '@/lib/map-detail';
import { countryView, DISTRICT_ZOOM, findDistrict, pinOf, provinceView, startView, toPicked, type PickedPosition } from '@/lib/location-picker';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapControlStack } from './map-controls';
import { ShareLocationButton } from './share-location-button';

/** How long the district box rests before the map goes looking for it (typing ten letters asks once, not ten times). */
const DISTRICT_WAIT_MS = 700;
const FLY_MS = 1600;

/** The province and district are the ones the pin itself gave the form: the map is already looking at them. */
const cameFromPin = (settled: { province: string; district: string } | null | undefined, province: string, district: string): boolean =>
  !!settled && settled.province === province && settled.district === district;

/** The pin: a green drop with a white dot, the one colour the listing forms use. Fixed markup, nothing typed is put into HTML. */
function pinElement(label: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:34px;height:42px;cursor:grab;touch-action:none;';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 30 38');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  const drop = document.createElementNS(ns, 'path');
  drop.setAttribute('d', 'M15 1.5C7.5 1.5 2 7.2 2 14.2 2 24 15 36.5 15 36.5S28 24 28 14.2C28 7.2 22.5 1.5 15 1.5Z');
  drop.setAttribute('fill', '#047857');
  drop.setAttribute('stroke', '#FFFFFF');
  drop.setAttribute('stroke-width', '2');
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', '15');
  dot.setAttribute('cy', '14.5');
  dot.setAttribute('r', '5');
  dot.setAttribute('fill', '#FFFFFF');
  svg.append(drop, dot);
  el.append(svg);
  return el;
}

export interface LocationPickerProps {
  /** The form's two coordinate fields, as text ("34.5281"); both empty while there is no pin. */
  lat: string;
  lng: string;
  /** The form's province (Dari name, as the province select stores it) and district (free text). The map follows both. */
  province: string;
  district: string;
  /** Called with the new position when the pin is placed or dragged, and with null when it is cleared. */
  onChange: (position: PickedPosition | null) => void;
  /** The office's own pin, offered as a one-press start when there is one. */
  officePin?: PickedPosition | null;
  /** How the address lookup for the pin is going, and the line it found (shown under the map). */
  lookup?: { state: 'idle' | 'finding' | 'filled' | 'failed'; text: string; guessedProvince?: boolean };
  /**
   * The province and district the form was just given from the pin itself: the map is already there, so it does not
   * fly off to them (it would carry the pin out of view).
   */
  settled?: { province: string; district: string } | null;
  /** What the share message calls the place, and its address line. */
  shareTitle?: string;
  shareAddress?: string;
  /** The listing's market: the pin must be inside its country and the map opens on it. Without one, the account's market. */
  market?: Market;
  invalid?: boolean;
  id?: string;
  className?: string;
}

/**
 * A Mapbox map on which the person puts the listing's pin: press where it is, or drag the pin there. The two coordinate
 * fields of the form are filled from it, and the map in turn follows the form: choosing a province flies to its capital,
 * and typing a district (once the typing rests) flies to that district.
 *
 * Mapbox bills a map by the number of times it is loaded, so the map is only made when the picker comes into view, and
 * it is kept (pin cleared, not rebuilt) while the form is reused for the next listing.
 */
export function LocationPicker({ lat, lng, province, district, onChange, officePin, lookup, settled, shareTitle, shareAddress, market: marketProp, invalid, id, className }: LocationPickerProps) {
  const t = useT();
  const tm = useMarketT();
  const accountMarket = useActiveMarket();
  const market = marketProp ?? accountMarket;
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const mapboxRef = useRef<typeof import('mapbox-gl').default | null>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [outside, setOutside] = useState(false);
  const [mapObject, setMapObject] = useState<MapboxMap | null>(null);
  const [expanded, setExpanded] = useState(false);

  const pin = pinOf(lat, lng, market);
  const pinKey = pin ? `${pin.lat},${pin.lng}` : '';

  // What the map's long-lived handlers need to see: the latest props.
  const live = useRef({ lat, lng, province, district, onChange, settled, market, label: t('form.picker.pin') });
  live.current = { lat, lng, province, district, onChange, settled, market, label: t('form.picker.pin') };
  /** The position this picker itself last reported: the form handing it back is not news to the map. */
  const reported = useRef('');
  /** What the map has already been sent to look at, so only a change flies. */
  const looked = useRef({ province: '', districtKey: '' });

  // ── come into view ──
  useEffect(() => {
    const el = wrapper.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '240px' },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [near]);

  /** Puts the marker where the form's fields say (or takes it away). `ease`: the position came from outside the map. */
  const applyPin = useCallback((ease: boolean) => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;
    const at = pinOf(live.current.lat, live.current.lng, live.current.market);
    if (!at) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = new mapboxgl.Marker({ element: pinElement(live.current.label), draggable: true, anchor: 'bottom' }).setLngLat([at.lng, at.lat]).addTo(map);
      marker.on('dragend', () => {
        const to = marker.getLngLat();
        commit(to.lat, to.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([at.lng, at.lat]);
    }
    if (ease) {
      const bounds = map.getBounds();
      if (!bounds || !bounds.contains([at.lng, at.lat]) || map.getZoom() < 13) map.easeTo({ center: [at.lng, at.lat], zoom: Math.max(map.getZoom(), 15), duration: 900 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `commit` only reads refs and the stable state setter
  }, []);

  /** A place the person chose on the map: reported when it is inside the listing's country, otherwise the pin goes back where it was. */
  function commit(latitude: number, longitude: number) {
    const picked = toPicked(latitude, longitude, live.current.market);
    if (!picked) {
      setOutside(true);
      applyPin(false);
      return;
    }
    setOutside(false);
    reported.current = `${picked.lat},${picked.lng}`;
    live.current.onChange(picked);
  }

  // ── the map ──
  useEffect(() => {
    if (!near || !MAPBOX_TOKEN || !canvas.current) return;
    let cancelled = false;
    let map: MapboxMap | null = null;
    let sizeWatcher: ResizeObserver | null = null;
    void (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (cancelled || !canvas.current) return;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const start = startView(pinOf(live.current.lat, live.current.lng, live.current.market), live.current.province, live.current.market);
      looked.current = { province: live.current.province, districtKey: `${live.current.province}|${live.current.district}` };
      map = new mapboxgl.Map({
        container: canvas.current,
        style: mapStyle(),
        center: start.center,
        zoom: start.zoom,
        maxZoom: TILE_MAX_ZOOM,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        // The picker sits in a page that scrolls: the wheel and a one-finger drag scroll the page, not the map.
        cooperativeGestures: true,
        locale: {
          'ScrollZoomBlocker.CtrlMessage': t('form.picker.ctrlScroll'),
          'ScrollZoomBlocker.CmdMessage': t('form.picker.cmdScroll'),
          'TouchPanBlocker.Message': t('form.picker.twoFingers'),
        },
      });
      map.touchZoomRotate.disableRotation();
      map.getCanvas().style.cursor = 'crosshair';
      mapRef.current = map;
      setMapObject(map);
      // The map fills whatever box it is in, also when the box changes (fullscreen on and off).
      if (typeof ResizeObserver !== 'undefined') {
        sizeWatcher = new ResizeObserver(() => map?.resize());
        sizeWatcher.observe(canvas.current);
      }

      // The same safety net as the main map: a style that cannot be had (Mapbox down, the token refused) or tiles that
      // keep failing switch the map, once, to plain OpenStreetMap tiles.
      let styleLoaded = false;
      let tileErrors = 0;
      let usingFallback = false;
      const current = map;
      current.once('style.load', () => {
        styleLoaded = true;
      });
      current.on('style.load', () => {
        if (!usingFallback) {
          localizeLabels(current);
          // Footprints and street names from earlier zooms, and the buildings as blocks when the map is tilted (3D button).
          enhanceDetail(current, { theme: detailTheme() });
        }
      });
      const fallBack = () => {
        if (usingFallback) return;
        usingFallback = true;
        current.setStyle(fallbackStyle());
      };
      current.on('error', (e) => {
        if (usingFallback) return;
        if (!styleLoaded) {
          fallBack();
          return;
        }
        const sourceId = (e as { sourceId?: string }).sourceId;
        if (!sourceId) return;
        tileErrors += 1;
        if (tileErrors >= 3) fallBack();
      });

      current.on('click', (e) => {
        const target = e.originalEvent?.target;
        // A press on the pin itself (it is a part of the map's element) is not a new place.
        if (target instanceof Node && markerRef.current?.getElement().contains(target)) return;
        commit(e.lngLat.lat, e.lngLat.lng);
      });

      setReady(true);
    })();
    return () => {
      cancelled = true;
      sizeWatcher?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
      setMapObject(null);
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- made once; later props reach it through `live`
  }, [near]);

  // ── the pin follows the form's fields (a press on the map, the office button, "save and add next" clearing it) ──
  useEffect(() => {
    if (!ready) return;
    const mine = reported.current === pinKey;
    reported.current = '';
    applyPin(!mine && pinKey !== '');
  }, [ready, pinKey, applyPin]);

  // ── …and the country: switching the listing to the other market shows that country while nothing narrower is chosen ──
  const lookedMarket = useRef(market);
  useEffect(() => {
    const map = mapRef.current;
    if (lookedMarket.current === market) return;
    lookedMarket.current = market;
    if (!ready || !map || pinKey || province.trim()) return;
    const view = countryView(market);
    map.flyTo({ center: view.center, zoom: view.zoom, duration: FLY_MS, essential: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of market moves the map this way
  }, [market, ready]);

  // ── the map follows the province ──
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (province === looked.current.province) return;
    looked.current.province = province;
    if (cameFromPin(live.current.settled, province, live.current.district)) return;
    const view = provinceView(province);
    if (view) map.flyTo({ center: view.center, zoom: view.zoom, duration: FLY_MS, essential: false });
  }, [ready, province]);

  // ── …and the district, once the typing rests ──
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const key = `${province}|${district}`;
    if (key === looked.current.districtKey) return;
    looked.current.districtKey = key;
    if (!district.trim() || !province.trim()) return;
    if (cameFromPin(live.current.settled, province, district)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void findDistrict(district, province, MAPBOX_TOKEN, controller.signal, undefined, live.current.market).then((at) => {
        if (at && !controller.signal.aborted && mapRef.current) mapRef.current.flyTo({ center: at, zoom: DISTRICT_ZOOM, duration: FLY_MS - 200, essential: false });
      });
    }, DISTRICT_WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      // A search cut short by a further keystroke or a province change must be started again by the next run.
      looked.current.districtKey = '';
    };
  }, [ready, province, district]);

  // ── fullscreen: the picker fills the window; the page behind stays put, Esc comes back ──
  useEffect(() => {
    // In a page that scrolls the wheel and one finger belong to the page; fullscreen there is nothing to scroll.
    mapRef.current?.setCooperativeGestures(!expanded);
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [expanded, ready]);

  const shared = pin ? { lat: pin.lat, lng: pin.lng, title: shareTitle, address: shareAddress } : null;

  return (
    <div
      className={cn(expanded ? 'fixed inset-0 z-[70] flex flex-col gap-2 bg-surface p-3' : 'space-y-2', className)}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? t('form.picker.aria') : undefined}
    >
      <div
        ref={wrapper}
        className={cn(
          'relative overflow-hidden rounded-xl border bg-soft',
          expanded ? 'min-h-0 flex-1' : 'h-64 sm:h-80',
          invalid ? 'border-danger' : 'border-line-strong',
        )}
      >
        <div ref={canvas} id={id} role="group" aria-label={t('form.picker.aria')} className="h-full w-full" />
        <MapControlStack
          map={mapObject}
          className="absolute end-2 top-2 z-[5]"
          fullscreen={{ active: expanded, onToggle: () => setExpanded((on) => !on) }}
        />
        {!MAPBOX_TOKEN ? (
          <div role="alert" className="absolute inset-0 z-[4] flex items-center justify-center bg-soft p-6 text-center text-sm font-semibold text-ink-2">
            {t('map.unavailable')}
          </div>
        ) : null}
        {MAPBOX_TOKEN && !ready ? <Skeleton className="pointer-events-none absolute inset-0 z-[4] rounded-none opacity-60" /> : null}
        {outside ? (
          <div role="alert" className="absolute inset-x-3 bottom-3 z-[5] rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-xs font-semibold text-danger">
            {t('map.outside', { market: marketName(market) })}
          </div>
        ) : null}
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-2 text-[13px]">
        {pin ? (
          <span className="ltr rounded-lg bg-soft px-2.5 py-1.5 font-mono text-xs text-ink-2" data-testid="picked-position">
            {lat}, {lng}
          </span>
        ) : (
          <span className="text-muted">{t('form.mapHint')}</span>
        )}
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {officePin ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => onChange(officePin)} title={t('form.officePin')}>
              <MapPin aria-hidden className="h-4 w-4" />
              {t('form.officePin')}
            </Button>
          ) : null}
          <ShareLocationButton place={shared} />
          {pin ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X aria-hidden className="h-4 w-4" />
              {t('form.picker.clear')}
            </Button>
          ) : null}
        </span>
      </div>
      {pin && lookup && lookup.state !== 'idle' ? (
        <p role="status" data-testid="address-lookup" data-state={lookup.state} className={cn('flex items-start gap-1.5 text-xs', lookup.state === 'failed' ? 'text-muted' : 'text-ink-2')}>
          {lookup.state === 'finding' ? <Loader2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" /> : <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
          <span>
            {lookup.state === 'finding'
              ? t('form.picker.finding')
              : lookup.state === 'filled'
                ? t('form.picker.found', { address: lookup.text })
                : t('form.picker.notFound')}
            {lookup.state === 'filled' && lookup.guessedProvince ? ` ${tm('form.picker.provinceGuessed')}` : ''}
          </span>
        </p>
      ) : null}
    </div>
  );
}
