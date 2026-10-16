import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import AppText from './AppText';

/** Solid, flat colours with white ink on top (each pair reads at 4.5:1 or better). No pastel tints. */
const PALETTE = [
  { bg: colors.primary, ink: colors.textOnPrimary },
  { bg: '#1D4ED8', ink: colors.textOnPrimary },
  { bg: colors.accentText, ink: colors.textOnPrimary },
  { bg: '#5B21B6', ink: colors.textOnPrimary },
  { bg: '#9D174D', ink: colors.textOnPrimary },
  { bg: '#0E7490', ink: colors.textOnPrimary },
] as const;

/** The same name always gets the same colour, so a person is recognisable down a list. */
export function avatarTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1_000_003;
  }
  return PALETTE[hash % PALETTE.length];
}

/** The first letter of a name, for the picture-less avatar ("" when there is no name to take it from). */
export function initialOf(name: string | null | undefined): string {
  const first = Array.from((name ?? '').trim())[0];
  return first ?? '';
}

interface Props {
  name?: string | null;
  uri?: string | null;
  size?: number;
  /** Decides the colour when two people share a name; the name itself is used when this is left out. */
  seed?: string;
}

/** A round picture of a person or an office, or their first letter on a soft colour when there is none. */
export default function Avatar({ name, uri, size = 48, seed }: Props) {
  const tone = avatarTone(seed ?? name ?? '');
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, box]}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.initial, box, { backgroundColor: tone.bg }]}>
      <AppText
        color={tone.ink}
        style={[
          styles.letter,
          {
            fontSize: Math.round(size * 0.42),
            lineHeight: Math.round(size * 0.62),
          },
        ]}
      >
        {initialOf(name) || '؟'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.neutralSoft },
  initial: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontWeight: '700' },
});
