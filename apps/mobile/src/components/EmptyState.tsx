import React from 'react';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import AppText from './AppText';
import Button from './Button';
import EmptyIllustration, { type EmptyKind } from './EmptyIllustration';
import type { ActionIconName } from './ActionIcon';
import { EmptyView } from './States';

interface Props {
  /**
   * The picture. There is no default on purpose: each list has its own (the bookmark house is «ذخیره‌شده‌ها»' alone),
   * so a new empty state has to choose one instead of borrowing whichever came first.
   */
  illustration: EmptyKind;
  /** What is missing, in a few words. */
  title: string;
  /** A friendly line under it: why it is empty, or what to do. */
  hint?: string;
  /** The one thing to do about it. Left out (with `onAction`), there is no button. */
  actionLabel?: string;
  actionIcon?: ActionIconName;
  onAction?: () => void;
  testID?: string;
}

/**
 * The picture, the title, a friendly line and one button: how every list says that it has nothing to show (the saved
 * listings, «آگهی‌های من», the Home list). One component, so the layout cannot drift apart: the picture, a heading, a
 * quiet caption and an outlined button. The picture is the screen's own (see `EmptyIllustration`).
 */
export default function EmptyState({
  illustration,
  title,
  hint,
  actionLabel,
  actionIcon,
  onAction,
  testID,
}: Props) {
  return (
    <EmptyView message={title} illustration={<EmptyIllustration kind={illustration} />}>
      {hint ? (
        <AppText
          variant="caption"
          color={colors.textMuted}
          style={styles.hint}
          testID={testID ? `${testID}-hint` : undefined}
        >
          {hint}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          testID={testID ? `${testID}-action` : undefined}
          icon={actionIcon}
          title={actionLabel}
          variant="outline"
          onPress={onAction}
        />
      ) : null}
    </EmptyView>
  );
}

const styles = StyleSheet.create({
  hint: { textAlign: 'center' },
});
