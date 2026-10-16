import React from 'react';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSaved } from '../favorites/store';
import { colors } from '../theme';
import Icon from './Icon';

interface Props {
  /** The listing this button saves. */
  propertyId: string;
  /** The listing's title, for the screen reader ("save: خانه سه اتاقه"). */
  title: string;
  style?: StyleProp<ViewStyle>;
  size?: number;
}

/**
 * The ribbon on a listing: tap to save it to the person's favourites, tap again to take it out. A saved listing shows
 * a filled emerald ribbon; an unsaved one an outline. It sits on a white disc with a 1 px edge so it reads on any picture.
 */
export default function BookmarkButton({
  propertyId,
  title,
  style,
  size = 40,
}: Props) {
  const { t } = useTranslation();
  const { isSaved, toggle } = useSaved();
  const saved = isSaved(propertyId);
  return (
    <Pressable
      testID={`bookmark-${propertyId}`}
      accessibilityRole="button"
      accessibilityLabel={`${t(
        saved ? 'property.unsave' : 'property.save',
      )}: ${title}`}
      accessibilityState={{ selected: saved }}
      onPress={() => toggle(propertyId)}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon
        name={saved ? 'bookmarkFilled' : 'bookmark'}
        size={size * 0.55}
        color={saved ? colors.primary : colors.text}
        weight={1.9}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.8 },
});
