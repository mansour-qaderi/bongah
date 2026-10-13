import React from 'react';
import { StyleSheet } from 'react-native';
import { act } from 'react-test-renderer';
import AppText from '../src/components/AppText';
import { colors, fonts } from '../src/theme';
import { render } from '../test-utils';

const styleOf = async (element: React.ReactElement) => {
  const tree = await render(element);
  const text = tree.root.findByType('Text' as never);
  const flat = StyleSheet.flatten(text.props.style);
  await act(async () => tree.unmount());
  return flat;
};

describe('AppText fonts', () => {
  it('uses the variant font and the default colour', async () => {
    expect(await styleOf(<AppText>x</AppText>)).toMatchObject({
      fontFamily: fonts.regular,
      color: colors.text,
    });
    expect(await styleOf(<AppText variant="heading">x</AppText>)).toMatchObject(
      { fontFamily: fonts.bold },
    );
    expect(await styleOf(<AppText variant="label">x</AppText>)).toMatchObject({
      fontFamily: fonts.semibold,
    });
  });

  it('turns a requested fontWeight into the matching font file and drops the weight', async () => {
    const style = await styleOf(
      <AppText style={{ fontWeight: '700' }}>x</AppText>,
    );
    expect(style.fontFamily).toBe(fonts.bold);
    expect(style).not.toHaveProperty('fontWeight');

    const light = await styleOf(
      <AppText variant="heading" style={{ fontWeight: '400' }}>
        x
      </AppText>,
    );
    expect(light.fontFamily).toBe(fonts.regular);
  });
});
