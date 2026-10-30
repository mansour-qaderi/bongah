'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap, type Marker } from 'mapbox-gl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Crosshair, List, LocateFixed, MapPinOff, Search, X } from 'lucide-react';
import { DEAL_TYPES, type AgencyListingPin, type DealType } from '@bongah/shared-types';
import { insideMarket } from '@/lib/area-name';
import { activeMarket, dealsFor, marketName } from '@/lib/market';
import { useActiveMarket } from '@/hooks/use-active-market';
import { normalizePlaceName } from '@bongah/validation';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { DEAL_COLOR } from '@/lib/labels';
import { listingPrice } from '@/lib/price';
import { tNow } from '@/i18n/active';
import { useLanguage, useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { refreshListingData, updateListing } from '@/lib/listing-actions';
import { defaultCenter, detailTheme, fallbackStyle, localizeLabels, MAPBOX_TOKEN, mapStyle, TILE_MAX_ZOOM } from '@/lib/map-config';
import { enhanceDetail } from '@/lib/map-detail';
import { useDashboard, useMapListings, useOfficePin } from '@/hooks/use-api';
import { useAreaName, type AreaView } from '@/hooks/use-area-name';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Checkbox, Input } from '@/components/ui/field';
import { CardListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { AreaTitle } from './area-title';
import { clusterElement, meElement, officeElement, pinElement } from './pin';
import { MapControlStack } from './map-controls';
import { GpsIcon } from './map-icons';
import { MapListingCard } from './listing-card';
import { ShareLocationButton } from './share-location-button';

const SOURCE = 'listings';
const MAX_MARKERS = 200;
type Pos = { lat: number; lng: number };

/** Room to leave on the map's right (the side panel covers it from the sm breakpoint up) so pins are not hidden. */
const fitPadding = () => ({ top: 80, bottom: 80, left: 80, right: typeof window !== 'undefined' && window.innerWidth >= 640 ? 80 + 352 : 80 });

/** Listings farther than this (in degrees, about 35 km) from the office are left out of the first view; "show all" has them. */
const NEAR_OFFICE_DEGREES = 0.35;


/** Listings with their position as the screen shows it: the saved one, or the one just dragged and being saved. */
interface Item extends AgencyListingPin {
  placed: boolean;
}

export function OfficeMap() {
  const t = useT();
  const { language } = useLanguage();
  const labels = useLabels();
  const params = useSearchParams();
  const { data, error, mutate } = useMapListings();
  const { data: dashboard } = useDashboard();
  const { data: officePins } = useOfficePin(dashboard?.agency.id);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const officeMarker = useRef<Marker | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [mapObject, setMapObject] = useState<MapboxMap | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const [overrides, setOverrides] = useState<ReadonlyMap<string, Pos>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(params.get('focus'));
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deals, setDeals] = useState<ReadonlySet<DealType>>(new Set());
  const [showSold, setShowSold] = useState(true);
  const [tab, setTab] = useState<'placed' | 'unplaced'>('placed');
  const [panelOpen, setPanelOpen] = useState(false);
  const [capped, setCapped] = useState(false);
  const [limit, setLimit] = useState(60);
  const [me, setMe] = useState<Pos | null>(null);
  const [locating, setLocating] = useState(false);
  const [view, setView] = useState<AreaView | null>(null);
  const areaName = useAreaName(view, language);

  // ── data ──
  const items = useMemo<Item[]>(
    () =>
      (data?.data ?? []).map((p) => {
        const o = overrides.get(p.id);
        const lat = o?.lat ?? p.lat;
        const lng = o?.lng ?? p.lng;
        return { ...p, lat, lng, placed: lat !== null && lng !== null };
      }),
    [data, overrides],
  );
  // The deals of the market being worked in, plus any a listing on this map already has (an old one, say).
  const market = useActiveMarket();
  const dealChoices = useMemo(
    () => DEAL_TYPES.filter((d) => dealsFor(market).includes(d) || items.some((p) => p.deal_type === d)),
    [market, items],
  );

  const filtered = useMemo(() => {
    const q = normalizePlaceName(search).toLowerCase();
    return items.filter((p) => {
      if (deals.size && !deals.has(p.deal_type)) return false;
      if (!showSold && p.status === 'SOLD') return false;
      if (!q) return true;
      return [p.title, p.address, p.district, p.province].some((s) => normalizePlaceName(s).toLowerCase().includes(q));
    });
  }, [items, search, deals, showSold]);

  const placed = useMemo(() => filtered.filter((p) => p.placed), [filtered]);
  const unplaced = useMemo(() => filtered.filter((p) => !p.placed), [filtered]);
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  // Latest values for the map's long-lived event handlers.
  const live = useRef({ placed, selectedId, placingId, byId });
  live.current = { placed, selectedId, placingId, byId };

  /** Where the office is: its own pin from the API (also set while the office is unverified), else the public map's. */
  const office = useMemo<Pos | null>(() => {
    if (data?.office) return data.office;
    const mine = officePins?.find((p) => p.id === dashboard?.agency.id);
    return mine ? { lat: mine.lat, lng: mine.lng } : null;
  }, [data?.office, officePins, dashboard?.agency.id]);
  const officeRef = useRef(office);
  officeRef.current = office;

  // ── saving a position ──
  const savePosition = useCallback(
    async (id: string, to: Pos, from: Pos | null, label: string) => {
      if (!insideMarket(to.lat, to.lng)) {
        toast.error(tNow('map.outside', { market: marketName(activeMarket()) }));
        setOverrides((o) => {
          const n = new Map(o);
          if (from) n.set(id, from);
          else n.delete(id);
          return n;
        });
        return;
      }
      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      const next = { lat: round(to.lat), lng: round(to.lng) };
      setOverrides((o) => new Map(o).set(id, next));
      try {
        await updateListing(id, next);
        void mutate();
        void refreshListingData();
        toast.success(tNow('map.saved', { label }), {
          action: from
            ? {
                label: tNow('map.undo'),
                onClick: () => void savePosition(id, from, to, label),
              }
            : undefined,
        });
      } catch (e) {
        toast.error(errorMessage(e));
        setOverrides((o) => {
          const n = new Map(o);
          if (from) n.set(id, from);
          else n.delete(id);
          return n;
        });
      }
    },
    [mutate],
  );
  const saveRef = useRef(savePosition);
  saveRef.current = savePosition;

  // ── the map itself ──
  useEffect(() => {
    if (!container.current) return;
    if (!MAPBOX_TOKEN) {
      console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not set: the map cannot be drawn.');
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: mapStyle(),
      center: defaultCenter(activeMarket()),
      zoom: 11,
      maxZoom: TILE_MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    setMapObject(map);
    // The map fills whatever box it is in, also when the box changes (fullscreen on and off).
    const sizeWatcher = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.resize()) : null;
    sizeWatcher?.observe(container.current);

    // The (invisible) layers that feed the markers. Safe to call again: a style swapped in later starts without them.
    const addListingLayers = () => {
      if (map.getSource(SOURCE)) return;
      map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 48, clusterMaxZoom: 16 });
      // Nothing is drawn by these layers (the markers are HTML); a source only loads its tiles while a layer uses it.
      map.addLayer({ id: 'listings-clusters', type: 'circle', source: SOURCE, filter: ['has', 'point_count'], paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
      map.addLayer({ id: 'listings-points', type: 'circle', source: SOURCE, filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
      setReady(true);
    };

    // If the main style cannot be loaded (Mapbox down, the token refused), or its tiles keep failing, the whole style is
    // swapped for plain raster tiles, once. (Not setTiles on a failed source: that breaks the raster renderer.)
    let styleLoaded = false;
    let tileErrors = 0;
    let usingFallback = false;
    map.once('style.load', () => {
      styleLoaded = true;
    });
    // Place names in their own language first (Persian / Pashto script), English only where the map has no local name.
    map.on('style.load', () => {
      if (!usingFallback) {
        localizeLabels(map);
        // Building footprints and street / neighbourhood names from earlier zooms, and buildings as blocks when tilted (3D button).
        enhanceDetail(map, { theme: detailTheme() });
      }
    });
    const fallBack = () => {
      if (usingFallback) return;
      usingFallback = true;
      setReady(false); // the listing layers go with the old style, and come back (and are filled again) with the new one
      map.once('style.load', addListingLayers);
      map.setStyle(fallbackStyle());
    };
    map.on('error', (e) => {
      if (usingFallback) return;
      const sourceId = (e as { sourceId?: string }).sourceId;
      // Before the style is up, any error is the style itself (its address, or a refusal): there is nothing to wait for.
      if (!styleLoaded) {
        fallBack();
        return;
      }
      // After: only tiles count (a missing font range or icon is not a reason to give up the map).
      if (!sourceId || sourceId === SOURCE) return;
      tileErrors += 1;
      if (tileErrors >= 3) fallBack();
    });

    map.on('load', () => {
      addListingLayers();
    });

    const sync = () => syncMarkers(map);
    map.on('moveend', sync);
    // The name bar follows the middle of what can be seen (the map minus the list beside it), once the map comes to rest.
    const report = () => {
      const box = container.current;
      if (!box) return;
      const w = box.clientWidth;
      const panel = w >= 640 ? 352 : 0;
      const rtl = getComputedStyle(box).direction === 'rtl';
      const at = map.unproject([rtl ? (w - panel) / 2 : panel + (w - panel) / 2, box.clientHeight / 2]);
      setView({ lat: at.lat, lng: at.lng, zoom: map.getZoom() });
    };
    map.on('moveend', report);
    map.on('load', report);
    map.on('sourcedata', (e) => {
      if (e.sourceId === SOURCE && e.isSourceLoaded) sync();
    });
    map.on('click', (e) => {
      const id = live.current.placingId;
      if (id) {
        const item = live.current.byId.get(id);
        setPlacingId(null);
        setSelectedId(id);
        void saveRef.current(id, { lat: e.lngLat.lat, lng: e.lngLat.lng }, null, item?.title ?? '');
      }
    });

    const markerStore = markers.current;
    return () => {
      markerStore.forEach((m) => m.remove());
      markerStore.clear();
      officeMarker.current?.remove();
      meMarker.current?.remove();
      meMarker.current = null;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      sizeWatcher?.disconnect();
      map.remove();
      mapRef.current = null;
      setMapObject(null);
      setReady(false);
    };
  }, []);

  /** Draws what the map currently shows as HTML markers: a count for each cluster, a draggable pin for each listing. */
  function syncMarkers(map: MapboxMap) {
    if (!map.getSource(SOURCE)) return;
    const bounds = map.getBounds();
    const wanted = new Map<string, { kind: 'cluster'; id: number; count: number; lngLat: [number, number] } | { kind: 'pin'; id: string; lngLat: [number, number] }>();
    // (mapbox-gl types its features without the GeoJSON members they do have.)
    for (const f of map.querySourceFeatures(SOURCE) as unknown as Array<{ geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> | null }>) {
      if (f.geometry.type !== 'Point') continue;
      const lngLat = f.geometry.coordinates as [number, number];
      if (!bounds.contains(lngLat)) continue;
      const props = f.properties as Record<string, unknown>;
      if (props.cluster) wanted.set(`c${props.cluster_id}`, { kind: 'cluster', id: Number(props.cluster_id), count: Number(props.point_count), lngLat });
      else wanted.set(`p${props.id}`, { kind: 'pin', id: String(props.id), lngLat });
    }

    // The pins that fit; the rest stay out of the DOM (zoom in or filter to see them).
    let pinCount = 0;
    let over = false;
    const keep = new Set<string>();
    for (const [key, w] of wanted) {
      if (w.kind === 'pin') {
        if (pinCount >= MAX_MARKERS) {
          over = true;
          continue;
        }
        pinCount += 1;
      }
      keep.add(key);
    }
    setCapped(over);

    const { byId: all, selectedId: sel } = live.current;
    for (const [key, marker] of markers.current) {
      const base = key.split('|')[0]!;
      const stillThere = keep.has(base);
      const stale = key.startsWith('p') && (() => {
        const id = base.slice(1);
        const item = all.get(id);
        const sig = item ? `${item.deal_type}${item.status}${item.is_featured}${id === sel}` : '';
        return key !== `${base}|${sig}`;
      })();
      if (!stillThere || stale) {
        marker.remove();
        markers.current.delete(key);
      }
    }
    for (const base of keep) {
      const w = wanted.get(base)!;
      if (w.kind === 'cluster') {
        const key = `${base}|${w.count}`;
        const old = [...markers.current.keys()].find((k) => k.startsWith(`${base}|`));
        if (old && old !== key) {
          markers.current.get(old)!.remove();
          markers.current.delete(old);
        }
        if (markers.current.has(key)) continue;
        const el = clusterElement(w.count);
        el.addEventListener('click', () => {
          const src = map.getSource(SOURCE) as GeoJSONSource;
          src.getClusterExpansionZoom(w.id, (error, zoom) => {
            if (error || zoom == null) return;
            map.easeTo({ center: w.lngLat, zoom: Math.min(zoom + 0.5, TILE_MAX_ZOOM) });
          });
        });
        markers.current.set(key, new mapboxgl.Marker({ element: el }).setLngLat(w.lngLat).addTo(map));
      } else {
        const item = all.get(w.id);
        if (!item) continue;
        const key = `${base}|${item.deal_type}${item.status}${item.is_featured}${w.id === sel}`;
        if (markers.current.has(key)) continue;
        const el = pinElement(item, w.id === sel);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setSelectedId(w.id);
        });
        const marker = new mapboxgl.Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat(w.lngLat).addTo(map);
        marker.on('dragstart', () => {
          el.style.cursor = 'grabbing';
          setSelectedId(w.id);
        });
        marker.on('dragend', () => {
          el.style.cursor = 'grab';
          const now = marker.getLngLat();
          const from = { lat: w.lngLat[1], lng: w.lngLat[0] };
          const latest = live.current.byId.get(w.id);
          void saveRef.current(w.id, { lat: now.lat, lng: now.lng }, from, latest?.title ?? '');
        });
        markers.current.set(key, marker);
      }
    }
  }

  // Feed the source whenever the visible set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: placed.map((p) => ({
        type: 'Feature',
        id: undefined,
        properties: { id: p.id },
        geometry: { type: 'Point', coordinates: [p.lng!, p.lat!] },
      })),
    });
    // Markers of listings that left the set go at once; the source's own reload redraws the rest.
    markers.current.forEach((m, key) => {
      if (key.startsWith('p') && !placed.some((p) => `p${p.id}` === key.split('|')[0])) {
        m.remove();
        markers.current.delete(key);
      }
    });
  }, [placed, ready]);

  // A change of selection recolours the two pins concerned.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) syncMarkers(map);
  }, [selectedId, ready, items]);

  // First view: the office, close up, with the listings around it (once); or the focused listing.
  const fitted = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || fitted.current || !data) return;
    fitted.current = true;
    const focus = params.get('focus');
    const target = focus ? items.find((p) => p.id === focus && p.placed) : undefined;
    if (target) {
      map.jumpTo({ center: [target.lng!, target.lat!], zoom: 16 });
      return;
    }
    const home = officeRef.current;
    const all = items.filter((p) => p.placed);
    // With an office pin the view is centred on it, with the listings near it; far-off ones are one tap away ("show all").
    const pts = home ? all.filter((p) => Math.abs(p.lat! - home.lat) <= NEAR_OFFICE_DEGREES && Math.abs(p.lng! - home.lng) <= NEAR_OFFICE_DEGREES) : all;
    if (pts.length === 0 && !home) return;
    const b = new mapboxgl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng!, p.lat!]));
    if (home) b.extend([home.lng, home.lat]);
    map.fitBounds(b, { padding: fitPadding(), maxZoom: home ? 16 : 15, duration: 0 });
  }, [ready, data, items, params]);

  // The office pin can arrive after the first view was drawn (an older API, or a slow dashboard call): centre on it once.
  const centredOnOffice = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !office || centredOnOffice.current) return;
    centredOnOffice.current = true;
    if (!fitted.current && !data) return; // the first view above will include it
    if (params.get('focus')) return;
    if (!map.getBounds().contains([office.lng, office.lat])) map.easeTo({ center: [office.lng, office.lat], zoom: Math.max(map.getZoom(), 14), duration: 0 });
  }, [office, ready, data, params]);

  // The office's own pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    officeMarker.current?.remove();
    officeMarker.current = null;
    if (office) officeMarker.current = new mapboxgl.Marker({ element: officeElement() }).setLngLat([office.lng, office.lat]).addTo(map);
  }, [office, ready]);

  // "You are here": one blue dot that follows the phone (or the computer) once the person has asked for it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    if (meMarker.current) meMarker.current.setLngLat([me.lng, me.lat]);
    else meMarker.current = new mapboxgl.Marker({ element: meElement(tNow('map.you')) }).setLngLat([me.lng, me.lat]).addTo(map);
  }, [me, ready]);

  /** Flies to where the person is, and keeps the dot following them. Never moves the map outside the countries served. */
  const locateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      toast.error(tNow('map.locate.unsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!insideMarket(here.lat, here.lng)) {
          toast.info(tNow('map.locate.outside', { market: marketName(activeMarket()) }));
          return;
        }
        setMe(here);
        mapRef.current?.flyTo({ center: [here.lng, here.lat], zoom: Math.max(mapRef.current.getZoom(), 16), padding: fitPadding(), essential: true });
        if (watchId.current === null) {
          watchId.current = navigator.geolocation.watchPosition(
            (p) => {
              const next = { lat: p.coords.latitude, lng: p.coords.longitude };
              if (insideMarket(next.lat, next.lng)) setMe(next);
            },
            () => undefined, // the dot simply stays where it was
            { enableHighAccuracy: true, maximumAge: 5_000 },
          );
        }
      },
      (error) => {
        setLocating(false);
        toast.error(tNow(error.code === error.PERMISSION_DENIED ? 'map.locate.denied' : 'map.locate.unavailable'));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  }, []);

  // Crosshair cursor while placing a listing.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = placingId ? 'crosshair' : '';
  }, [placingId]);
  useEffect(() => {
    if (!placingId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlacingId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placingId]);

  // Fullscreen: the map takes the whole window, the page behind stays put, Esc comes back (unless a menu or a placing is open).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !live.current.placingId) setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);

  const flyTo = useCallback((p: Item) => {
    setSelectedId(p.id);
    setPanelOpen(false);
    const map = mapRef.current;
    if (map && p.placed) map.flyTo({ center: [p.lng!, p.lat!], zoom: Math.max(map.getZoom(), 16), essential: true });
  }, []);

  const startPlacing = (p: Item) => {
    setPlacingId(p.id);
    setSelectedId(p.id);
    setPanelOpen(false);
    toast.info(tNow('map.placeHint'));
  };

  const fitAll = () => {
    const map = mapRef.current;
    const pts = placed;
    if (!map || pts.length === 0) return;
    const b = new mapboxgl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng!, p.lat!]));
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 15 });
  };

  const list = tab === 'placed' ? placed : unplaced;
  const total = data?.data.length ?? 0;

  return (
    <div
      className={cn(
        'overflow-hidden',
        fullscreen ? 'fixed inset-0 z-[60] h-dvh bg-surface' : 'relative -mx-4 -my-6 h-[calc(100dvh-4rem)] sm:-mx-6',
      )}
    >
      <div className="absolute inset-0">
        {/* Mapbox GL sets its own position on this element, so it only gets a size here. */}
        <div ref={container} className="h-full w-full" aria-label={t('map.aria.map')} />
      </div>

      {/* Side panel */}
      <aside
        aria-label={t('map.aria.list')}
        className={cn(
          'absolute inset-y-0 start-0 z-10 flex w-full max-w-sm flex-col border-e border-line bg-surface transition-transform duration-200 sm:w-[22rem]',
          panelOpen ? 'translate-x-0' : 'translate-x-full sm:translate-x-0',
        )}
      >
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex items-center justify-between sm:hidden">
            <span className="text-sm font-bold">{t('map.listings')}</span>
            <button onClick={() => setPanelOpen(false)} aria-label={t('map.closeList')} className="rounded-lg p-1.5 hover:bg-soft">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('map.searchPlaceholder')} aria-label={t('common.search')} className="ps-9" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {dealChoices.map((d) => {
              const on = deals.has(d);
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() =>
                    setDeals((prev) => {
                      const n = new Set(prev);
                      if (on) n.delete(d);
                      else n.add(d);
                      return n;
                    })
                  }
                  className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', on ? 'border-ink bg-ink text-white' : 'border-line-strong text-ink-2')}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: DEAL_COLOR[d].main }} />
                  {labels.deal[d]}
                </button>
              );
            })}
            <Checkbox checked={showSold} onChange={setShowSold} label={t('map.showSold')} className="ms-auto text-xs">
              {t('map.showSold')}
            </Checkbox>
          </div>
          <div role="tablist" className="flex rounded-xl bg-soft p-1">
            {(
              [
                ['placed', t('map.tab.placed', { n: formatNumber(placed.length) })],
                ['unplaced', t('map.tab.unplaced', { n: formatNumber(unplaced.length) })],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => {
                  setTab(k);
                  setLimit(60);
                }}
                className={cn('flex-1 rounded-lg py-1.5 text-[13px] font-semibold', tab === k ? 'bg-surface text-primary ring-1 ring-line' : 'text-ink-2')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {!data && !error ? (
            <div className="p-3">
              <CardListSkeleton rows={6} />
            </div>
          ) : error && !data ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
          ) : total === 0 ? (
            <EmptyState
              compact
              icon={MapPinOff}
              title={t('map.empty.title')}
              description={t('map.empty.text')}
              action={
                <Link href="/dashboard/listings/quick-add">
                  <Button size="sm">{t('map.empty.add')}</Button>
                </Link>
              }
            />
          ) : list.length === 0 ? (
            <EmptyState
              compact
              icon={tab === 'placed' ? MapPinOff : LocateFixed}
              title={tab === 'placed' ? t('map.none.placed') : t('map.none.unplaced')}
              description={tab === 'placed' ? t('map.none.placedText') : t('map.none.unplacedText')}
            />
          ) : (
            <ul className="space-y-2.5 p-3">
              {list.slice(0, limit).map((p) => (
                <li key={p.id}>
                  <MapListingCard
                    listing={p}
                    placed={p.placed}
                    selected={selectedId === p.id}
                    onSelect={() => (p.placed ? flyTo(p) : setSelectedId(p.id))}
                    onPlace={() => startPlacing(p)}
                  />
                </li>
              ))}
            </ul>
          )}
          {list.length > limit ? (
            <div className="p-3">
              <Button variant="secondary" className="w-full justify-center" onClick={() => setLimit((l) => l + 60)}>
                {t('map.more', { n: formatNumber(list.length - limit) })}
              </Button>
            </div>
          ) : null}
        </div>
        {data?.truncated ? (
          <p className="border-t border-line bg-accent-tint px-3 py-2 text-xs text-accent-text">
            {t('map.truncated', { n: formatNumber(data.limit) })}
          </p>
        ) : null}
      </aside>

      {/* Map overlays */}
      <button
        onClick={() => setPanelOpen(true)}
        className="absolute end-3 top-3 z-[5] flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-semibold sm:hidden"
      >
        <List aria-hidden className="h-4 w-4" />
        {t('map.openList', { n: formatNumber(total) })}
      </button>
      <div className="absolute end-3 top-3 z-[5] hidden gap-2 sm:flex">
        <Button variant="secondary" size="sm" onClick={fitAll} disabled={placed.length === 0} className="gap-1.5 bg-surface">
          <LocateFixed aria-hidden className="h-4 w-4" />
          {t('map.fitAll')}
        </Button>
      </div>

      {placingId ? null : <AreaTitle name={areaName} label={t('map.areaAria')} />}

      <MapControlStack
        map={mapObject}
        className="absolute end-3 top-[6.5rem] z-[5] sm:top-14"
        fullscreen={{ active: fullscreen, onToggle: () => setFullscreen((on) => !on) }}
      />

      <button
        type="button"
        data-testid="locate"
        onClick={locateMe}
        disabled={locating}
        aria-label={t('map.locate')}
        title={t('map.locate')}
        className={cn(
          'absolute bottom-8 end-3 z-[5] flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-primary transition-colors hover:bg-soft disabled:opacity-70',
          selected && 'max-sm:hidden',
        )}
      >
        <GpsIcon className={cn('h-6 w-6', locating && 'animate-pulse')} />
      </button>

      {placingId ? (
        <div role="status" className="absolute inset-x-0 top-3 z-[6] mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-xl border border-primary bg-surface px-4 py-2.5 text-[13px] font-semibold text-primary">
          <Crosshair aria-hidden className="h-4 w-4" />
          {t('map.placing', { title: byId.get(placingId)?.title ?? '' })}
          <button onClick={() => setPlacingId(null)} className="rounded-md px-2 py-0.5 text-xs text-ink-2 hover:bg-soft">
            {t('common.cancel')}
          </button>
        </div>
      ) : null}

      {capped ? (
        <div role="status" className="absolute bottom-3 end-3 z-[5] max-w-xs rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-2">
          {t('map.capped')}
        </div>
      ) : null}

      {!MAPBOX_TOKEN ? (
        <div role="alert" className="absolute inset-0 z-[4] flex items-center justify-center bg-soft p-6 text-center text-sm font-semibold text-ink-2">
          {t('map.unavailable')}
        </div>
      ) : null}

      {MAPBOX_TOKEN && (!ready || (!data && !error)) ? (
        <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
          <Skeleton className="absolute inset-0 rounded-none opacity-60" />
        </div>
      ) : null}

      {selected ? (
        <div className="reveal absolute bottom-4 end-3 z-[7] w-[min(22rem,calc(100%-1.5rem))] rounded-2xl border border-line bg-surface p-4 sm:end-auto sm:start-[23.5rem]" role="dialog" aria-label={t('map.details')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-ink">{selected.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <Badge tone={selected.deal_type === 'SALE' ? 'primary' : selected.deal_type === 'RENT' || selected.deal_type === 'MORTGAGE_RENT' ? 'info' : 'gold'}>{labels.deal[selected.deal_type]}</Badge>
                <span>{labels.type[selected.type]}</span>
                <Badge tone={selected.status === 'ACTIVE' ? 'primary' : 'neutral'}>{labels.status[selected.status]}</Badge>
                {selected.is_featured ? <Badge tone="gold">{t('list.col.featured')}</Badge> : null}
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} aria-label={t('common.close')} className="rounded-lg p-1 text-muted hover:bg-soft">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="tabular mt-2 text-sm font-semibold text-ink-2">{listingPrice(selected)}</div>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{selected.address}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.placed ? (
              <p className="w-full text-xs text-muted">{t('map.dragHint')}</p>
            ) : (
              <Button size="sm" onClick={() => startPlacing(selected)} className="gap-1.5">
                <Crosshair aria-hidden className="h-4 w-4" />
                {t('map.place')}
              </Button>
            )}
            <Link href={`/dashboard/listings?q=${encodeURIComponent(selected.title)}&tab=ALL`}>
              <Button size="sm" variant="secondary">
                {t('map.inList')}
              </Button>
            </Link>
            {selected.placed ? (
              <ShareLocationButton
                place={{ lat: selected.lat!, lng: selected.lng!, title: selected.title, address: selected.address, listingId: selected.id }}
                menuClassName="z-[90]"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
