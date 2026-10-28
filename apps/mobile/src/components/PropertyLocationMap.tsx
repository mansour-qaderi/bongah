import React, { useMemo, useState } from 'react';
import type { DealType, PlotBoundary, PropertyType } from '@bongah/shared-types';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GeoJSONSource, Layer, Marker } from '../map/native';
import BaseMap from '../map/BaseMap';
import {
  cameraAt,
  cameraFitting,
  fromLngLat,
  toLngLat,
  type Coordinate,
} from '../map/geo';
import { UserDot } from '../map/markers';
import { formatDistance, formatEta } from '../map/navFormat';
import PinMarker from '../map/PinMarker';
import { PLOT_STYLE } from '../map/PlotLayer';
import { readBoundary } from '../map/plots';
import type { Route } from '../map/routing';
import { colors, radius, spacing, surfaces } from '../theme';
import AppText from './AppText';
import CircleIconButton from './CircleIconButton';
import { LOCATION_MAP_HEIGHT } from './layoutSizes';

/** What the box measures before it has been laid out. */
const FALLBACK_WIDTH = 320;
const BOX_HEIGHT = LOCATION_MAP_HEIGHT;

/**
 * A picture of where a listing is (details screen): its pin, in the colour of what it is offered for. A listing posted
 * before outlines were dropped from the form may still carry one; it is shown here as it was drawn. The map cannot be
 * dragged, so it never fights the scrolling page.
 *
 * With `route` (and `from`, where the phone is) the live route is drawn on it, the map looks at all of it, and a small
 * chip says how far it is and how long it takes. With `onFullscreen` a button sits in its corner: the details screen
 * answers it by opening the big map with the live route and the speed display.
 */
export default function PropertyLocationMap({
  at,
  zoom,
  boundary,
  deal,
  type,
  from,
  route,
  onFullscreen,
  fullscreenBusy = false,
  onShare,
}: {
  at: Coordinate;
  /** How far in to look; the pin's usual close view when left out. */
  zoom?: number;
  boundary?: PlotBoundary | null;
  deal?: DealType;
  type?: PropertyType;
  /** Where the phone is, drawn as the pulsing blue dot. */
  from?: Coordinate | null;
  /** The route from `from` to `at`. */
  route?: Route | null;
  /** Shows the fullscreen button; called when it is pressed. */
  onFullscreen?: () => void;
  /** The press is being answered (the phone is being located): the button shows a spinner. */
  fullscreenBusy?: boolean;
  /** Shows the «share the location» button; called when it is pressed. */
  onShare?: () => void;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  // The 3D view: the picture leans back and the buildings around the pin stand up (the picture itself stays still).
  const [tilted, setTilted] = useState(false);
  const outline = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const rings = readBoundary(boundary);
    return rings
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: rings },
            },
          ],
        }
      : null;
  }, [boundary]);
  const line = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: route
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: route.line },
            },
          ]
        : [],
    }),
    [route],
  );
  // With a route the map looks at all of it (the phone, the road, the listing); without one, at the listing.
  const camera = useMemo(
    () =>
      route && from
        ? cameraFitting(
            [at, from, ...route.line.map(fromLngLat)],
            width,
            BOX_HEIGHT,
          )
        : cameraAt(at, zoom),
    [route, from, at, zoom, width],
  );
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width || FALLBACK_WIDTH);
  return (
    <View style={styles.box} onLayout={onLayout}>
      <BaseMap
        camera={camera}
        interactive={false}
        androidView="texture"
        tilted={tilted}
        testID="details-map"
      >
        {outline ? (
          <GeoJSONSource id="details-outline" data={outline}>
            <Layer
              id="details-outline-fill"
              type="fill"
              paint={{
                'fill-color': PLOT_STYLE.fill,
                'fill-opacity': PLOT_STYLE.fillOpacity,
              }}
            />
            <Layer
              id="details-outline-line"
              type="line"
              layout={{ 'line-join': 'round' }}
              paint={{
                'line-color': PLOT_STYLE.line,
                'line-width': PLOT_STYLE.lineWidth,
              }}
            />
          </GeoJSONSource>
        ) : null}
        {route ? (
          <GeoJSONSource id="details-route" data={line}>
            <Layer
              id="details-route-casing"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': colors.surface, 'line-width': 8 }}
            />
            <Layer
              id="details-route-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              // A straight line (no road was found) is dashed, so it does not pass for a road.
              paint={
                route.source === 'straight'
                  ? {
                      'line-color': colors.info,
                      'line-width': 4,
                      'line-dasharray': [1.5, 1.5],
                    }
                  : { 'line-color': colors.info, 'line-width': 4 }
              }
            />
          </GeoJSONSource>
        ) : null}
        {from ? (
          <Marker id="me" lngLat={toLngLat(from)}>
            <UserDot testID="details-my-position" />
          </Marker>
        ) : null}
        <Marker
          id="property"
          lngLat={toLngLat(at)}
          anchor={deal ? 'bottom' : 'center'}
        >
          <PinMarker selected deal={deal} type={type} />
        </Marker>
      </BaseMap>
      {route ? (
        <View style={styles.summary} pointerEvents="none" testID="details-route-summary">
          <AppText variant="caption" color={colors.text} style={styles.summaryText}>
            {`${formatDistance(route.distanceM, t)} · ${formatEta(route.durationS, t)}`}
          </AppText>
        </View>
      ) : null}
      <View style={styles.corner} pointerEvents="box-none">
        {onFullscreen ? (
          <CircleIconButton
            testID="details-map-fullscreen"
            icon="expand"
            label={t('map.fullscreen')}
            loading={fullscreenBusy}
            onPress={onFullscreen}
          />
        ) : null}
        <CircleIconButton
          testID="details-map-3d"
          icon="cube"
          label={t('map.view3d')}
          selected={tilted}
          tone={tilted ? 'brand' : 'neutral'}
          onPress={() => setTilted(on => !on)}
        />
        {onShare ? (
          <CircleIconButton
            testID="details-map-share"
            icon="share"
            label={t('shareLocation.button')}
            onPress={onShare}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: BOX_HEIGHT,
    alignSelf: 'stretch',
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  corner: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  summary: {
    position: 'absolute',
    bottom: spacing.sm,
    start: spacing.sm,
    ...surfaces.floating,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  summaryText: { fontWeight: '600' },
});
