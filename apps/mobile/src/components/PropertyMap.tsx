import React, { useMemo, useState } from 'react';
import { Marker } from '@maplibre/maplibre-react-native';
import type { AgencyMapPin, Property } from '@bongah/shared-types';
import BaseMap from '../map/BaseMap';
import {
  clusterPoints,
  inBounds,
  type Bounds,
  type Cluster,
} from '../map/cluster';
import { toLngLat, type Coordinate, type MapCamera } from '../map/geo';
import {
  agencyKey,
  buildItems,
  propertyKey,
  type MapItem,
} from '../map/items';
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
  /** The map settled at this zoom. Lets the screen fly to a chosen listing without zooming out. */
  onZoomChange?: (zoom: number) => void;
}

/** The most markers drawn at once. Each one is a native view, so this keeps panning smooth. */
const MAX_MARKERS = 120;

/** Zoom is clustered in half steps: finer than that changes nothing the eye can see. */
const zoomStep = (zoom: number) => Math.round(zoom * 2) / 2;

/**
 * Interactive map of listings and verified offices, with a "you are here" dot.
 *
 * Markers are real views (price, seller, name), which a map layer cannot draw without a glyph server, so the
 * work of keeping it fast is done here: items that overlap at this zoom collapse into one counted cluster
 * (tapping it opens a list), and only what is on or just off screen is drawn.
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
  onZoomChange,
}: Props) {
  const [view, setView] = useState<{ zoom: number; bounds: Bounds | null }>({
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

  const selectedKey = selected
    ? selected.kind === 'property'
      ? propertyKey(selected.id)
      : agencyKey(selected.id)
    : null;

  const drawn = useMemo(() => {
    const visible = view.bounds
      ? clusters.filter(c => inBounds(c.lat, c.lng, view.bounds as Bounds))
      : clusters;
    // The chosen one is drawn last, so it sits on top of anything crowding it.
    const chosen = (c: Cluster<MapItem>) =>
      c.items.length === 1 && c.items[0].key === selectedKey;
    return [
      ...visible.filter(c => !chosen(c)),
      ...visible.filter(chosen),
    ].slice(-MAX_MARKERS);
  }, [clusters, view.bounds, selectedKey]);

  return (
    <BaseMap
      camera={camera}
      testID="property-map"
      onViewChange={next => {
        setView({ zoom: zoomStep(next.zoom), bounds: next.bounds });
        onZoomChange?.(next.zoom);
      }}
    >
      {drawn.map(cluster => {
        const count = cluster.items.length;
        const at = toLngLat({ latitude: cluster.lat, longitude: cluster.lng });
        if (count > 1) {
          return (
            <Marker
              key={`${cluster.key}#${count}`}
              id={`cluster:${cluster.key}#${count}`}
              lngLat={at}
              onPress={() => onOpenCluster(cluster.items)}
            >
              <ClusterMarker count={count} />
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
            onPress={() => onSelectProperty(item.property)}
          >
            <PropertyMarker property={item.property} selected={isSelected} />
          </Marker>
        ) : (
          <Marker
            key={item.key}
            id={item.key}
            lngLat={at}
            anchor="bottom"
            onPress={() => onSelectAgency(item.agency)}
          >
            <AgencyMarker agency={item.agency} selected={isSelected} />
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
