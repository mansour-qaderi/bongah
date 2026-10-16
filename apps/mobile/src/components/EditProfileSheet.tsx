import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { launchImageLibrary } from 'react-native-image-picker';
import { CHAT_IMAGE_TYPES } from '@bongah/shared-types';
import { registerUserSchema } from '@bongah/validation';
import { registerUser, uploadAvatar } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Avatar from './Avatar';
import Banner from './Banner';
import BottomSheet from './BottomSheet';
import Button from './Button';
import Icon from './Icon';
import { KeyboardAwareScrollView } from './KeyboardAware';
import TextField from './TextField';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** The picture the person has chosen in this sheet: a photo from the phone, or "none" once they remove theirs. */
type PhotoChoice =
  | { kind: 'picked'; uri: string; type: string }
  | { kind: 'removed' }
  | null;

/**
 * Where the person sets how they appear to others: their name and their picture. Nothing is sent until "Save".
 * A new picture is uploaded first and its URL is saved with the name in the same request, so a failed upload
 * never leaves a half-changed profile.
 */
export default function EditProfileSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<PhotoChoice>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Each time the sheet opens it starts from what is saved, not from a half-finished earlier edit.
  useEffect(() => {
    if (!visible) return;
    setName(user?.full_name ?? '');
    setPhoto(null);
    setNameError(null);
    setFailure(null);
    setSaving(false);
    // Only the opening matters: a refreshed `user` while the sheet is open must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!user) return null;

  const shownUri =
    photo?.kind === 'picked'
      ? photo.uri
      : photo?.kind === 'removed'
      ? null
      : user.avatar;

  const pickPhoto = async () => {
    setFailure(null);
    // Shrunk on the phone first: a profile picture is shown small, so there is no reason to send a full photo.
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      includeBase64: false,
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 0.8,
    });
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (result.errorCode || !asset?.uri) {
      setFailure(t('account.photoFailed'));
      return;
    }
    const type = asset.type ?? '';
    if (!(CHAT_IMAGE_TYPES as readonly string[]).includes(type)) {
      setFailure(t('account.photoUnsupported'));
      return;
    }
    setPhoto({ kind: 'picked', uri: asset.uri, type });
  };

  const save = async () => {
    setFailure(null);
    const parsed = registerUserSchema.safeParse({ full_name: name });
    if (!parsed.success) {
      setNameError(t('auth.invalidName'));
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      let avatar: string | null | undefined;
      if (photo?.kind === 'picked') {
        avatar = (await uploadAvatar(photo.uri, photo.type)).url;
      } else if (photo?.kind === 'removed') {
        avatar = null;
      }
      const updated = await registerUser(parsed.data.full_name, avatar);
      await updateUser(updated);
      onClose();
    } catch (error) {
      setFailure(errorMessage(error, t));
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('account.editProfile')}
      heightRatio={0.8}
      footer={
        <Button
          title={t('common.save')}
          onPress={save}
          loading={saving}
          style={styles.save}
        />
      }
    >
      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        {failure ? <Banner kind="error" message={failure} /> : null}

        <View style={styles.photoBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              shownUri ? t('account.changePhoto') : t('account.addPhoto')
            }
            onPress={pickPhoto}
            style={styles.photoButton}
          >
            <Avatar
              name={name || user.full_name}
              uri={shownUri}
              seed={user.id}
              size={96}
            />
            <View style={styles.cameraBadge}>
              <Icon
                name="camera"
                size={18}
                color={colors.textOnPrimary}
                background={colors.primary}
                weight={1.8}
              />
            </View>
          </Pressable>
          <View style={styles.photoActions}>
            <Pressable
              accessibilityRole="button"
              onPress={pickPhoto}
              hitSlop={8}
            >
              <AppText variant="label" color={colors.primary}>
                {shownUri ? t('account.changePhoto') : t('account.addPhoto')}
              </AppText>
            </Pressable>
            {shownUri ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPhoto({ kind: 'removed' })}
                hitSlop={8}
              >
                <AppText variant="label" color={colors.danger}>
                  {t('account.removePhoto')}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>

        <TextField
          label={t('auth.fullName')}
          value={name}
          onChangeText={value => {
            setName(value);
            setNameError(null);
          }}
          placeholder={t('auth.fullNamePlaceholder')}
          autoComplete="name"
          textContentType="name"
          maxLength={100}
          error={nameError}
          onSubmitEditing={save}
        />
      </KeyboardAwareScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  photoBlock: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  photoButton: { width: 96, height: 96 },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: { flexDirection: 'row', gap: spacing.xl },
  save: { flex: 1 },
});
