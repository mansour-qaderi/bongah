import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ChatTemplate } from '@bongah/shared-types';
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
} from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import { queryKeys, useChatCapabilities, useTemplates } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import { useErrorToast } from '../../components/useErrorToast';
import Button from '../../components/Button';
import { ScrollScreen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import TextField from '../../components/TextField';
import { formatNumber } from '../../i18n/format';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing, surfaces } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Templates'>;

/**
 * The saved replies of an agency with an active subscription, and the one that is sent
 * automatically to the first message of every new customer. Everyone else sees what the feature
 * is and a way to subscribe (the server refuses these calls without the perks anyway).
 */
export default function TemplatesScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const capabilities = useChatCapabilities(signedIn);
  const advanced = capabilities.data?.advanced === true;
  const templates = useTemplates(advanced);

  if (status === 'loading') return <LoadingView />;
  if (!signedIn) {
    return (
      <EmptyView message={t('templates.signInHint')}>
        <Button
          icon="login"
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
  if (capabilities.isPending) return <LoadingView />;
  if (capabilities.isError)
    return (
      <ErrorView
        message={errorMessage(capabilities.error, t)}
        onRetry={() => capabilities.refetch()}
      />
    );
  if (!advanced) {
    return (
      <EmptyView message={t('templates.lockedBody')}>
        <AppText variant="heading">{t('templates.lockedTitle')}</AppText>
        <Button
          icon="card"
          title={t('templates.subscribe')}
          onPress={() => navigation.navigate('Upgrade')}
        />
      </EmptyView>
    );
  }
  if (templates.isPending) return <LoadingView />;
  if (templates.isError)
    return (
      <ErrorView
        message={errorMessage(templates.error, t)}
        onRetry={() => templates.refetch()}
      />
    );

  return (
    <Manager
      templates={templates.data}
      max={capabilities.data.limits.templates_max}
      maxLength={capabilities.data.limits.template_max_length}
    />
  );
}

function Manager({
  templates,
  max,
  maxLength,
}: {
  templates: ChatTemplate[];
  max: number;
  maxLength: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ChatTemplate | null>(null);
  const [body, setBody] = useState('');
  const [auto, setAuto] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.templates });
  const resetForm = () => {
    setEditing(null);
    setBody('');
    setAuto(false);
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? updateTemplate(editing.id, { body, is_auto_reply: auto })
        : createTemplate({ body, is_auto_reply: auto }),
    onSuccess: async () => {
      resetForm();
      await refresh();
    },
  });
  const toggleAuto = useMutation({
    mutationFn: (template: ChatTemplate) =>
      updateTemplate(template.id, { is_auto_reply: !template.is_auto_reply }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: async (_, id) => {
      if (editing?.id === id) resetForm();
      await refresh();
    },
  });

  const confirmDelete = (template: ChatTemplate) =>
    Alert.alert(template.body, t('templates.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(template.id),
      },
    ]);

  const startEdit = (template: ChatTemplate) => {
    save.reset();
    setEditing(template);
    setBody(template.body);
    setAuto(template.is_auto_reply);
  };

  const full = !editing && templates.length >= max;
  const failure = save.error ?? toggleAuto.error ?? remove.error;
  useErrorToast(failure ? errorMessage(failure, t) : null, failure);

  return (
    <ScrollScreen edges={['left', 'right']}>
      <AppText color={colors.textMuted} style={styles.count}>
        {t('templates.count', {
          count: formatNumber(templates.length, 0),
          max: formatNumber(max, 0),
        })}
      </AppText>

      <View style={styles.card}>
        <AppText variant="heading">
          {editing ? t('templates.editTitle') : t('templates.newTitle')}
        </AppText>
        <TextField
          label={t('templates.bodyLabel')}
          value={body}
          onChangeText={setBody}
          placeholder={t('templates.bodyPlaceholder')}
          multiline
          maxLength={maxLength}
          editable={!full}
        />
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <AppText variant="label">{t('templates.autoReply')}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {t('templates.autoReplyHelp')}
            </AppText>
          </View>
          <Switch
            accessibilityLabel={t('templates.autoReply')}
            value={auto}
            onValueChange={setAuto}
            disabled={full}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.border}
          />
        </View>
        {full ? <Banner kind="info" message={t('chat.templateLimit')} /> : null}
        <View style={styles.buttons}>
          {editing ? (
            <Button
              icon="close"
              title={t('common.cancel')}
              variant="outline"
              style={styles.flex}
              onPress={resetForm}
            />
          ) : null}
          <Button
            icon="check"
            title={editing ? t('templates.update') : t('templates.add')}
            loading={save.isPending}
            disabled={full || body.trim() === ''}
            style={styles.flex}
            onPress={() => save.mutate()}
          />
        </View>
      </View>

      {templates.length === 0 ? (
        <AppText color={colors.textMuted} style={styles.empty}>
          {t('templates.empty')}
        </AppText>
      ) : (
        templates.map(template => (
          <View key={template.id} style={styles.card}>
            {template.is_auto_reply ? (
              <AppText variant="caption" color={colors.accentText}>
                {t('templates.autoOn')}
              </AppText>
            ) : null}
            <AppText>{template.body}</AppText>
            <View style={styles.buttons}>
              <Button
                icon="edit"
                title={t('templates.edit')}
                variant="outline"
                style={styles.flex}
                onPress={() => startEdit(template)}
              />
              <Button
                icon="refresh"
                title={
                  template.is_auto_reply
                    ? t('templates.makeNotAuto')
                    : t('templates.makeAuto')
                }
                variant="secondary"
                loading={
                  toggleAuto.isPending &&
                  toggleAuto.variables?.id === template.id
                }
                style={styles.flex}
                onPress={() => toggleAuto.mutate(template)}
              />
              <Button
                icon="trash"
                title={t('common.delete')}
                variant="danger"
                style={styles.flex}
                onPress={() => confirmDelete(template)}
              />
            </View>
          </View>
        ))
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  count: { marginBottom: spacing.md },
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { flex: 1 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  empty: { textAlign: 'center', marginTop: spacing.md },
});
