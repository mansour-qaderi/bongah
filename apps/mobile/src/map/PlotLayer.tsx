import React, { useMemo } from 'react';
import { GeoJSONSource, Layer } from './native';
import { colors } from '../theme';
import { plotFeatures, type Plot } from './plots';

/** Plot outlines are invisible specks below this zoom, so the renderer is not asked to draw them. */
export const PLOT_MIN_ZOOM = 12;

/**
 * How plots look. Emerald (the brand colour, #047857) at low opacity so the streets underneath stay readable,
 * with a solid darker edge. The chosen plot is deeper and gets the gold edge the chosen marker has.
 */
export const PLOT_STYLE = {
  fill: colors.primary,
  fillOpacity: 0.22,
  line: colors.primaryDark,
  lineWidth: 1.5,
  chosenFillOpacity: 0.45,
  chosenLine: colors.accentBright,
  chosenLineWidth: 3,
} as const;

interface Props {
  plots: Plot[];
  /** The listing whose plot is highlighted. */
  selectedId: string | null;
}

/**
 * Draws plot outlines as native map layers, not as views: any number of polygons costs the JS side nothing
 * per frame. The outlines are one source that only changes when the listings change; the highlighted one is
 * a second, tiny source, so choosing a plot never re-sends the rest.
 */
export default function PlotLayer({ plots, selectedId }: Props) {
  const all = useMemo(() => plotFeatures(plots), [plots]);
  const chosen = useMemo(
    () => plotFeatures(plots.filter(plot => plot.id === selectedId)),
    [plots, selectedId],
  );
  if (plots.length === 0) return null;

  return (
    <>
      <GeoJSONSource id="plots" data={all}>
        <Layer
          id="plots-fill"
          type="fill"
          minzoom={PLOT_MIN_ZOOM}
          paint={{
            'fill-color': PLOT_STYLE.fill,
            'fill-opacity': PLOT_STYLE.fillOpacity,
          }}
        />
        <Layer
          id="plots-line"
          type="line"
          minzoom={PLOT_MIN_ZOOM}
          layout={{ 'line-join': 'round' }}
          paint={{
            'line-color': PLOT_STYLE.line,
            'line-width': PLOT_STYLE.lineWidth,
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="plot-chosen" data={chosen}>
        <Layer
          id="plot-chosen-fill"
          type="fill"
          minzoom={PLOT_MIN_ZOOM}
          paint={{
            'fill-color': PLOT_STYLE.fill,
            'fill-opacity': PLOT_STYLE.chosenFillOpacity,
          }}
        />
        <Layer
          id="plot-chosen-line"
          type="line"
          minzoom={PLOT_MIN_ZOOM}
          layout={{ 'line-join': 'round' }}
          paint={{
            'line-color': PLOT_STYLE.chosenLine,
            'line-width': PLOT_STYLE.chosenLineWidth,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
