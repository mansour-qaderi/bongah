'use client';

import { mutate } from 'swr';
import { useMe } from '@/hooks/use-api';
import { useT } from '@/i18n/provider';
import { NameForm } from '@/components/auth/name-form';

/**
 * An account that was just created has no name. The login page asks for it, but the person may have closed the page
 * first, so the panel asks again: a window with no way past it until there is a name (the same rule as in the phone app).
 */
export function NameGuard() {
  const { data: me } = useMe();
  const t = useT();
  if (!me || me.full_name?.trim()) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" data-testid="name-guard">
      <div role="dialog" aria-modal="true" aria-labelledby="name-guard-title" className="reveal w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
        <h2 id="name-guard-title" className="text-lg font-extrabold text-ink">
          {t('nameGuard.title')}
        </h2>
        <p className="mb-5 mt-1 text-[13px] text-muted">{t('nameGuard.text')}</p>
        <NameForm onDone={() => void mutate('users/me')} />
      </div>
    </div>
  );
}
