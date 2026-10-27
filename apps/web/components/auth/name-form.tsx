'use client';

import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { registerUserSchema } from '@bongah/validation';
import type { User } from '@bongah/shared-types';
import { useT } from '@/i18n/provider';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/**
 * Finishes sign-up: the account was created by the first code that was confirmed, and only has a phone number. This
 * asks for the name the person is known by (it is what listings and the header show). There is no way past it
 * without a name, the same rule as in the phone app.
 */
export function NameForm({ onDone, submitLabel }: { onDone: (user: User) => void; submitLabel?: string }) {
  const t = useT();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = registerUserSchema.safeParse({ full_name: name });
    if (!parsed.success) {
      setError(t('name.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<User>('users/register', {
        full_name: parsed.data.full_name,
      });
      await mutate('users/me', user, { revalidate: false });
      onDone(user);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <Field label={t('name.label')} error={error} hint={t('name.hint')}>
        {(props) => (
          <Input
            {...props}
            autoFocus
            autoComplete="name"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 text-base"
            placeholder={t('name.placeholder')}
          />
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
        {submitLabel ?? t('common.continue')}
      </Button>
    </form>
  );
}
