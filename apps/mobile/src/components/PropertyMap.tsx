import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Marker } from '@maplibre/maplibre-react-native';
import type { AgencyMapPin, Property } from '@bongah/shared-types';
import BaseMap, { type MapViewChange } from '../map/BaseMap';
import {
  clusterPoints,
  inBounds,
  viewMoved,
  zoomStep,
  type Bounds,
  type Cluster,
  type MapView,
} from '../map/cluster';
import { toLngLat, type Coordinate, type MapCamera } from '../map/geo';
import PlotLayer from '../map/PlotLayer';
import { buildPlots, plotAt } from '../map/plots';
import { agencyKey, buildItems, propertyKey, type MapItem } from '../map/items';
import {
  AgencyMarker,
  ClusterMarker,
  PropertyMarker,
  UserDot,
} from '../map/markers';

/** What the person chose on the map. */
export type MapSelection =
  | { kind: 'property'; id: string }
  | { kind: 'agency'; id: string };

interface Props {
  properties: Property[];
  agencies: AgencyMapPin[];
  /** Where to look. Changing it moves the map (a province filter, "my location"). */
  camera: MapCamera;
  selected: MapSelection | null;
  /** The phone's position, drawn as a blue dot; null when unknown. */
  userLocation: Coordinate | null;
  onSelectProperty: (property: Property) => void;
  onSelectAgency: (agency: AgencyMapPin) => void;
  /** A group of several listings/offices in one place was tapped. */
  onOpenCluster: (items: MapItem[]) => void;
  /**
   * The map settled: how far in it is and what part of the world it shows. Lets the screen fly to a chosen
   * listing without zooming out, and ask the server for just what is on screen.
   */
  onViewChange?: (view: MapViewChange) => void;
  /** Empty map was tapped: not a marker, not a cluster and not inside a plot. */
  onPressMap?: () => void;
}

/**
 * A marker sits on top of the map, and whether the same finger-tap is also reported to the map underneath
 * depends on the platform. If it is, "tap the map to close" would close a card the instant a marker opened
 * it. So a map tap this soon after a marker tap is taken to be the same tap and ignored.
 */
export const MARKER_TAP_GRACE_MS = 300;

/** Whether a featured listing is among what the marker stands for. */
const hasFeatured = (cluster: Cluster<MapItem>): boolean =>
  cluster.items.some(i => i.kind === 'property' && i.property.is_featured);

/** The most markers drawn at once. Each one is a native view, so this keeps panning smooth. */
const MAX_MARKERS = 120;
/** From here on, markers carry their title (or an office's name): the map is close enough that there is room for it. */
export const LABEL_ZOOM = 14;

/**
 * Interactive map of listings and verified offices, with a "you are here" dot and, where a listing has one,
 * its plot outline.
 *
 * Markers are real views (price, seller, name), which a map layer cannot draw without a glyph server, so the
 * work of keeping it fast is done here: items that overlap at this zoom collapse into one counted cluster
 * (tapping it zooms in), and only what is on or just off screen is drawn. Plot outlines are native layers,
 * not views, so they cost nothing per frame; a tap inside one chooses its listing.
 */
export default function PropertyMap({
  properties,
  agencies,
  camera,
  selected,
  userLocation,
  onSelectProperty,
  onSelectAgency,
  onOpenCluster,
  onViewChange,
  onPressMap,
}: Props) {
  const [view, setView] = useState<MapView>({
    zoom: zoomStep(camera.zoom),
    bounds: null,
  });

  const items = useMemo(
    () => buildItems(properties, agencies),
    [properties, agencies],
  );
  const clusters = useMemo(
    () => clusterPoints(items, view.zoom),
    [items, view.zoom],
  );

  const plots = useMemo(() => buildPlots(properties), [properties]);
  const lastMarkerTap = useRef(0);
  const fromMarker = (action: () => void) => () => {
    lastMarkerTap.current = Date.now();
    action();
  };
  const onPress = useCallback(
    (point: Coordinate) => {
      if (Date.now() - lastMarkerTap.current < MARKER_TAP_GRACE_MS) return;
      const hit = plotAt(plots, point);
      if (hit) onSelectProperty(hit);
      else onPressMap?.();
    },
    [plots, onSelectProperty, onPressMap],
  );

  const selectedKey = selected
    ? selected.kind === 'property'
      ? propertyKey(selected.id)
      : agencyKey(selected.id)
    : null;

  const drawn = useMemo(() => {
    const visible = view.bounds
      ? clusters.filter(c => inBounds(c.lat, c.lng, view.bounds as Bounds))
      : clusters;
    // Later is on top. The chosen one is drawn last, so it sits on top of anything crowding it; just before it
    // come the featured ones (and piles holding one), so a paid listing is never hidden under an ordinary marker
    // and is the last to be dropped when more than MAX_MARKERS are on screen.
    const chosen = (c: Cluster<MapItem>) =>
      c.items.length === 1 && c.items[0].key === selectedKey;
    return [
      ...visible.filter(c => !chosen(c) && !hasFeatured(c)),
      ...visible.filter(c => !chosen(c) && hasFeatured(c)),
      ...visible.filter(chosen),
    ].slice(-MAX_MARKERS);
  }, [clusters, view.bounds, selectedKey]);

  const showLabels = view.zoom >= LABEL_ZOOM;

  return (
    <BaseMap
      camera={camera}
      testID="property-map"
      onPress={onPress}
      onViewChange={next => {
        // A small pan changes nothing that is drawn: keep the same state so nothing re-renders.
        setView(previous => {
          const updated = {
            zoom: zoomStep(next.zoom),
            bounds: next.bounds,
          };
          return viewMoved(previous, updated) ? updated : previous;
        });
        onViewChange?.(next);
      }}
    >
      <PlotLayer
        plots={plots}
        selectedId={selected?.kind === 'property' ? selected.id : null}
      />
      {drawn.map(cluster => {
        const count = cluster.items.length;
        const at = toLngLat({ latitude: cluster.lat, longitude: cluster.lng });
        if (count > 1) {
          return (
            <Marker
              key={`${cluster.key}#${count}`}
              id={`cluster:${cluster.key}#${count}`}
              lngLat={at}
              onPress={fromMarker(() => onOpenCluster(cluster.items))}
            >
              <ClusterMarker
                count={count}
                onlyProperties={cluster.items.every(i => i.kind === 'property')}
                hasFeatured={hasFeatured(cluster)}
              />
            </Marker>
          );
        }
        const item = cluster.items[0];
        const isSelected = item.key === selectedKey;
        return item.kind === 'property' ? (
          <Marker
            key={item.key}
            id={item.key}
            lngLat={at}
            anchor="bottom"
            onPress={fromMarker(() => onSelectProperty(item.property))}
          >
            <PropertyMarker
              property={item.property}
              selected={isSelected}
              showLabel={showLabels}
            />
          </Marker>
        ) : (
          <Marker
            key={item.key}
            id={item.key}
            lngLat={at}
            anchor="bottom"
            onPress={fromMarker(() => onSelectAgency(item.agency))}
          >
            <AgencyMarker
              agency={item.agency}
              selected={isSelected}
              showLabel={showLabels}
            />
          </Marker>
        );
      })}
      {userLocation ? (
        <Marker id="me" lngLat={toLngLat(userLocation)}>
          <UserDot />
        </Marker>
      ) : null}
    </BaseMap>
  );
}
