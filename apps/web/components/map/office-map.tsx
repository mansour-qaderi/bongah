'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Crosshair, List, LocateFixed, MapPinOff, Search, X } from 'lucide-react';
import { AFGHANISTAN_BOUNDS, DEAL_TYPES, type AgencyListingPin, type DealType } from '@bongah/shared-types';
import { normalizePlaceName } from '@bongah/validation';
import { errorMessage } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { DEAL_COLOR, DEAL_LABEL, STATUS_LABEL, TYPE_LABEL } from '@/lib/labels';
import { refreshListingData, updateListing } from '@/lib/listing-actions';
import { DEFAULT_CENTER, mapStyle, TILE_MAX_ZOOM } from '@/lib/map-config';
import { useDashboard, useMapListings, useOfficePin } from '@/hooks/use-api';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { CardListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { clusterElement, officeElement, pinColor, pinElement } from './pin';

const SOURCE = 'listings';
const MAX_MARKERS = 200;
type Pos = { lat: number; lng: number };

/** Room to leave on the map's right (the side panel covers it from the sm breakpoint up) so pins are not hidden. */
const fitPadding = () => ({ top: 80, bottom: 80, left: 80, right: typeof window !== 'undefined' && window.innerWidth >= 640 ? 80 + 352 : 80 });

const inAfghanistan = (lat: number, lng: number) =>
  lat >= AFGHANISTAN_BOUNDS.minLat && lat <= AFGHANISTAN_BOUNDS.maxLat && lng >= AFGHANISTAN_BOUNDS.minLng && lng <= AFGHANISTAN_BOUNDS.maxLng;

/** Listings with their position as the screen shows it: the saved one, or the one just dragged and being saved. */
interface Item extends AgencyListingPin {
  placed: boolean;
}

export function OfficeMap() {
  const params = useSearchParams();
  const { data, error, mutate } = useMapListings();
  const { data: dashboard } = useDashboard();
  const { data: officePins } = useOfficePin(dashboard?.agency.id);

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const officeMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

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

  // ── saving a position ──
  const savePosition = useCallback(
    async (id: string, to: Pos, from: Pos | null, label: string) => {
      if (!inAfghanistan(to.lat, to.lng)) {
        toast.error('موقعیت بیرون از افغانستان است.');
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
        toast.success(`موقعیت «${label}» ذخیره شد.`, {
          action: from
            ? {
                label: 'بازگرداندن',
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
    const map = new maplibregl.Map({
      container: container.current,
      style: mapStyle(),
      center: DEFAULT_CENTER,
      zoom: 11,
      maxZoom: TILE_MAX_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 48, clusterMaxZoom: 16 });
      // Nothing is drawn by these layers (the markers are HTML); a source only loads its tiles while a layer uses it.
      map.addLayer({ id: 'listings-clusters', type: 'circle', source: SOURCE, filter: ['has', 'point_count'], paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
      map.addLayer({ id: 'listings-points', type: 'circle', source: SOURCE, filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
      setReady(true);
    });

    const sync = () => syncMarkers(map);
    map.on('moveend', sync);
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
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  /** Draws what the map currently shows as HTML markers: a count for each cluster, a draggable pin for each listing. */
  function syncMarkers(map: MapLibreMap) {
    if (!map.getSource(SOURCE)) return;
    const bounds = map.getBounds();
    const wanted = new Map<string, { kind: 'cluster'; id: number; count: number; lngLat: [number, number] } | { kind: 'pin'; id: string; lngLat: [number, number] }>();
    for (const f of map.querySourceFeatures(SOURCE)) {
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
        el.addEventListener('click', async () => {
          const src = map.getSource(SOURCE) as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(w.id);
          map.easeTo({ center: w.lngLat, zoom: Math.min(zoom + 0.5, TILE_MAX_ZOOM) });
        });
        markers.current.set(key, new maplibregl.Marker({ element: el }).setLngLat(w.lngLat).addTo(map));
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
        const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat(w.lngLat).addTo(map);
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

  // First view: fit everything placed (once), or the focused listing.
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
    const pts = items.filter((p) => p.placed);
    if (pts.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng!, p.lat!]));
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 15, duration: 0 });
  }, [ready, data, items, params]);

  // The office's own pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    officeMarker.current?.remove();
    officeMarker.current = null;
    const mine = officePins?.find((p) => p.id === dashboard?.agency.id);
    if (mine) officeMarker.current = new maplibregl.Marker({ element: officeElement() }).setLngLat([mine.lng, mine.lat]).addTo(map);
  }, [officePins, dashboard?.agency.id, ready]);

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
    toast.info('روی نقشه کلیک کنید تا موقعیت آگهی ثبت شود (Esc = انصراف).');
  };

  const fitAll = () => {
    const map = mapRef.current;
    const pts = placed;
    if (!map || pts.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng!, p.lat!]));
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 15 });
  };

  const list = tab === 'placed' ? placed : unplaced;
  const total = data?.data.length ?? 0;

  return (
    <div className="relative -mx-4 -my-6 h-[calc(100dvh-4rem)] overflow-hidden sm:-mx-6">
      <div className="absolute inset-0">
        {/* MapLibre sets its own position on this element, so it only gets a size here. */}
        <div ref={container} className="h-full w-full" aria-label="نقشه آگهی‌های دفتر" />
      </div>

      {/* Side panel */}
      <aside
        aria-label="فهرست آگهی‌ها"
        className={cn(
          'absolute inset-y-0 start-0 z-10 flex w-full max-w-sm flex-col border-e border-line bg-surface transition-transform duration-200 sm:w-[22rem]',
          panelOpen ? 'translate-x-0' : 'translate-x-full sm:translate-x-0',
        )}
      >
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex items-center justify-between sm:hidden">
            <span className="text-sm font-bold">آگهی‌ها</span>
            <button onClick={() => setPanelOpen(false)} aria-label="بستن فهرست" className="rounded-lg p-1.5 hover:bg-soft">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجوی عنوان یا آدرس…" aria-label="جستجو" className="ps-9" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {DEAL_TYPES.map((d) => {
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
                  {DEAL_LABEL[d]}
                </button>
              );
            })}
            <label className="ms-auto flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} className="h-3.5 w-3.5 accent-[#047857]" />
              معامله‌شده‌ها
            </label>
          </div>
          <div role="tablist" className="flex rounded-xl bg-soft p-1">
            {(
              [
                ['placed', `روی نقشه (${formatNumber(placed.length)})`],
                ['unplaced', `بدون موقعیت (${formatNumber(unplaced.length)})`],
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
              title="آگهی‌ای ندارید"
              description="بعد از ثبت آگهی، اینجا روی نقشه می‌بینید و موقعیتش را با کشیدن اصلاح می‌کنید."
              action={
                <Link href="/dashboard/listings/quick-add">
                  <Button size="sm">ثبت آگهی</Button>
                </Link>
              }
            />
          ) : list.length === 0 ? (
            <EmptyState
              compact
              icon={tab === 'placed' ? MapPinOff : LocateFixed}
              title={tab === 'placed' ? 'آگهی‌ای با این فیلتر روی نقشه نیست' : 'همهٔ آگهی‌ها موقعیت دارند'}
              description={tab === 'placed' ? 'جستجو یا فیلترها را کم کنید.' : 'آگهی بدون موقعیت اینجا برای قرار دادن روی نقشه می‌آید.'}
            />
          ) : (
            <ul className="divide-y divide-line">
              {list.slice(0, limit).map((p) => (
                <li key={p.id}>
                  <div
                    className={cn('flex items-start gap-3 px-3 py-3 transition-colors', selectedId === p.id ? 'bg-primary-tint' : 'hover:bg-soft')}
                  >
                    <span aria-hidden className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: pinColor(p) }} />
                    <button onClick={() => (p.placed ? flyTo(p) : setSelectedId(p.id))} className="min-w-0 flex-1 text-start">
                      <div className="truncate text-[13px] font-semibold text-ink">{p.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">
                        {TYPE_LABEL[p.type]} · {p.district || p.province}
                      </div>
                      <div className="tabular mt-0.5 text-xs font-semibold text-ink-2">{formatMoney(p.price, p.currency)}</div>
                    </button>
                    {!p.placed ? (
                      <Button size="sm" variant="secondary" onClick={() => startPlacing(p)} className="gap-1">
                        <Crosshair aria-hidden className="h-3.5 w-3.5" />
                        بگذار روی نقشه
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {list.length > limit ? (
            <div className="p-3">
              <Button variant="secondary" className="w-full justify-center" onClick={() => setLimit((l) => l + 60)}>
                نمایش بیشتر ({formatNumber(list.length - limit)})
              </Button>
            </div>
          ) : null}
        </div>
        {data?.truncated ? (
          <p className="border-t border-line bg-accent-tint px-3 py-2 text-xs text-accent-text">
            فقط {formatNumber(data.limit)} آگهی تازه‌تر نشان داده می‌شود؛ بقیه را از «مدیریت آگهی‌ها» ببینید.
          </p>
        ) : null}
      </aside>

      {/* Map overlays */}
      <button
        onClick={() => setPanelOpen(true)}
        className="absolute end-3 top-3 z-[5] flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-semibold sm:hidden"
      >
        <List aria-hidden className="h-4 w-4" />
        فهرست ({formatNumber(total)})
      </button>
      <div className="absolute end-3 top-3 z-[5] hidden gap-2 sm:flex">
        <Button variant="secondary" size="sm" onClick={fitAll} disabled={placed.length === 0} className="gap-1.5 bg-surface">
          <LocateFixed aria-hidden className="h-4 w-4" />
          نمایش همه
        </Button>
      </div>

      {placingId ? (
        <div role="status" className="absolute inset-x-0 top-3 z-[6] mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-xl border border-primary bg-surface px-4 py-2.5 text-[13px] font-semibold text-primary">
          <Crosshair aria-hidden className="h-4 w-4" />
          روی نقشه کلیک کنید تا موقعیت «{byId.get(placingId)?.title}» ثبت شود
          <button onClick={() => setPlacingId(null)} className="rounded-md px-2 py-0.5 text-xs text-ink-2 hover:bg-soft">
            انصراف
          </button>
        </div>
      ) : null}

      {capped ? (
        <div role="status" className="absolute bottom-3 end-3 z-[5] max-w-xs rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-2">
          آگهی‌های زیادی در این نما هست؛ نزدیک‌تر شوید یا فیلتر کنید تا همه نمایش داده شوند.
        </div>
      ) : null}

      {!ready || (!data && !error) ? (
        <div className="pointer-events-none absolute inset-0 z-[4]" aria-hidden>
          <Skeleton className="absolute inset-0 rounded-none opacity-60" />
        </div>
      ) : null}

      {selected ? (
        <div className="reveal absolute bottom-4 end-3 z-[7] w-[min(22rem,calc(100%-1.5rem))] rounded-2xl border border-line bg-surface p-4 sm:end-auto sm:start-[23.5rem]" role="dialog" aria-label="جزئیات آگهی">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-ink">{selected.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <Badge tone={selected.deal_type === 'SALE' ? 'primary' : selected.deal_type === 'RENT' ? 'info' : 'gold'}>{DEAL_LABEL[selected.deal_type]}</Badge>
                <span>{TYPE_LABEL[selected.type]}</span>
                <Badge tone={selected.status === 'ACTIVE' ? 'primary' : 'neutral'}>{STATUS_LABEL[selected.status]}</Badge>
                {selected.is_featured ? <Badge tone="gold">ویژه</Badge> : null}
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} aria-label="بستن" className="rounded-lg p-1 text-muted hover:bg-soft">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="tabular mt-2 text-sm font-semibold text-ink-2">{formatMoney(selected.price, selected.currency)}</div>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{selected.address}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.placed ? (
              <p className="w-full text-xs text-muted">برای اصلاح موقعیت، سنجاق را بکشید و رها کنید.</p>
            ) : (
              <Button size="sm" onClick={() => startPlacing(selected)} className="gap-1.5">
                <Crosshair aria-hidden className="h-4 w-4" />
                بگذار روی نقشه
              </Button>
            )}
            <Link href={`/dashboard/listings?q=${encodeURIComponent(selected.title)}&tab=ALL`}>
              <Button size="sm" variant="secondary">
                در فهرست آگهی‌ها
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
