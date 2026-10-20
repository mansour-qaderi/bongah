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
export type ActionIconName =
  | 'send'
  | 'check'
  | 'refresh'
  | 'edit'
  | 'plus'
  | 'close'
  | 'card'
  | 'arrow'
  | 'share'
  | 'gift'
  | 'phone'
  | 'chat'
  | 'trash'
  | 'copy'
  | 'login'
  | 'logout'
  | 'camera'
  | 'pin'
  | 'sliders'
  | 'up'
  | 'star'
  | 'down'
  | 'list'
  | 'search';

const PATHS: Record<ActionIconName, string[]> = {
  // Mirrored paper plane: a diagonal line from the tip into the fold, and the plane's outline.
  send: ['M2 2L13 13', 'M2 2L9 22L13 13L22 9L2 2Z'],
  check: ['M20 6L9 17L4 12'],
  refresh: ['M23 4V10H17', 'M20.49 15A9 9 0 1 1 18.36 5.64L23 10'],
  edit: ['M17 3A2.83 2.83 0 0 1 21 7L7.5 20.5L2 22L3.5 16.5L17 3Z'],
  plus: ['M12 5V19', 'M5 12H19'],
  close: ['M18 6L6 18', 'M6 6L18 18'],
  // A bank card: the outline and the stripe. For every "pay" and "buy" button.
  card: ['M3 6H21V18H3Z', 'M3 10H21'],
  // "Go on": an arrow that points the way the text is read (to the left), like `send`.
  arrow: ['M19 12H5', 'M12 19L5 12L12 5'],
  // Three connected circles: the standard "share" mark.
  share: [
    'M15 5A3 3 0 1 0 21 5A3 3 0 1 0 15 5Z',
    'M3 12A3 3 0 1 0 9 12A3 3 0 1 0 3 12Z',
    'M15 19A3 3 0 1 0 21 19A3 3 0 1 0 15 19Z',
    'M8.59 13.51L15.42 17.49',
    'M15.41 6.51L8.59 10.49',
  ],
  gift: [
    'M20 12V22H4V12',
    'M2 7H22V12H2Z',
    'M12 22V7',
    'M12 7H7.5A2.5 2.5 0 1 1 12 4.5',
    'M12 7H16.5A2.5 2.5 0 1 0 12 4.5',
  ],
  phone: [
    'M22 16.92V19.92A2 2 0 0 1 19.82 21.92A19.79 19.79 0 0 1 11.19 18.85A19.5 19.5 0 0 1 5.19 12.85A19.79 19.79 0 0 1 2.12 4.18A2 2 0 0 1 4.11 2H7.11A2 2 0 0 1 9.11 3.72A12.84 12.84 0 0 0 9.8 6.45A2 2 0 0 1 9.35 8.58L8.08 9.85A16 16 0 0 0 14.15 15.92L15.42 14.65A2 2 0 0 1 17.55 14.2A12.84 12.84 0 0 0 20.28 14.89A2 2 0 0 1 22 16.92Z',
  ],
  chat: ['M21 15A2 2 0 0 1 19 17H7L3 21V5A2 2 0 0 1 5 3H19A2 2 0 0 1 21 5Z'],
  trash: ['M3 6H21', 'M8 6V4H16V6', 'M19 6L18 20H6L5 6'],
  copy: ['M9 9H20V20H9Z', 'M5 15H4V4H15V5'],
  login: ['M15 3H19V21H15', 'M10 17L15 12L10 7', 'M15 12H3'],
  logout: ['M9 21H5V3H9', 'M16 17L21 12L16 7', 'M21 12H9'],
  camera: [
    'M23 19A2 2 0 0 1 21 21H3A2 2 0 0 1 1 19V8A2 2 0 0 1 3 6H7L9 3H15L17 6H21A2 2 0 0 1 23 8Z',
    'M12 17A4 4 0 1 0 12 9A4 4 0 1 0 12 17',
  ],
  pin: [
    'M21 10C21 17 12 23 12 23S3 17 3 10A9 9 0 0 1 21 10Z',
    'M12 13A3 3 0 1 0 12 7A3 3 0 1 0 12 13',
  ],
  sliders: [
    'M4 21V14',
    'M4 10V3',
    'M12 21V12',
    'M12 8V3',
    'M20 21V16',
    'M20 12V3',
    'M1 14H7',
    'M9 8H15',
    'M17 16H23',
  ],
  up: ['M12 19V5', 'M5 12L12 5L19 12'],
  star: [
    'M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26Z',
  ],
  down: ['M6 9L12 15L18 9'],
  list: [
    'M8 6H21',
    'M8 12H21',
    'M8 18H21',
    'M3 6H3.01',
    'M3 12H3.01',
    'M3 18H3.01',
  ],
  search: ['M11 19A8 8 0 1 0 11 3A8 8 0 1 0 11 19', 'M21 21L16.65 16.65'],
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
