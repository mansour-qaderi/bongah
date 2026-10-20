import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

/**
 * The glyphs that sit inside buttons: one clear shape each, drawn as strokes on a 24 x 24 grid with round ends
 * (the same weight and softness as the line icons in iconShapes.ts, which are the app's navigation and listing icons).
 *
 * `send` is a paper plane that points the way the text is read. A right-to-left layout does not mirror an SVG, so
 * the plane is drawn pointing to the top-left, which is forward for a Dari or Pashto reader.
 */
export type ActionIconName = 'send' | 'check' | 'refresh' | 'edit';

const PATHS: Record<ActionIconName, string[]> = {
  // Mirrored paper plane: a diagonal line from the tip into the fold, and the plane's outline.
  send: ['M2 2L13 13', 'M2 2L9 22L13 13L22 9L2 2Z'],
  check: ['M20 6L9 17L4 12'],
  refresh: ['M23 4V10H17', 'M20.49 15A9 9 0 1 1 18.36 5.64L23 10'],
  edit: ['M17 3A2.83 2.83 0 0 1 21 7L7.5 20.5L2 22L3.5 16.5L17 3Z'],
};

interface Props {
  name: ActionIconName;
  size?: number;
  color?: string;
  /** Stroke width in grid units. */
  weight?: number;
}

/** A button glyph. Decorative: the button carries the accessible name, so it is hidden from screen readers. */
function ActionIconView({
  name,
  size = 18,
  color = colors.text,
  weight = 2,
}: Props) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size }}
      testID={`icon-${name}`}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {PATHS[name].map(d => (
          <Path
            key={d}
            d={d}
            stroke={color}
            strokeWidth={weight}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  );
}

const ActionIcon = React.memo(ActionIconView);
export default ActionIcon;
