'use client';

import { useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, UserRound } from 'lucide-react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import type { Agency } from '@bongah/shared-types';
import { api, ApiError, errorMessage } from '@/lib/api';
import { tNow } from '@/i18n/active';
import { useT } from '@/i18n/provider';
import { useMarketT } from '@/i18n/use-labels';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';

type FieldName = 'agency_name' | 'address' | 'description';
type Errors = Partial<Record<FieldName, string>>;

/** The same limits the API checks with (packages/validation: registerAgencySchema). */
export const SETUP_LIMITS = { name: [2, 120], address: [3, 300], description: 2000 } as const;

/** What the API does to a text before it measures it: runs of white space become one space, the ends are trimmed. */
const tidy = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * Checks the three fields on this page. This is deliberately NOT the shared zod schema: that one lives in a built
 * package, and a stale build of it (one that still wanted a licence photo) used to make the check fail on a field the
 * form does not have, so the button did nothing and said nothing. The API checks everything again for real; whatever
 * it refuses comes back on `errors` and is shown on the matching field (see `fieldErrorsFrom`).
 */
export function validateSetup(input: { name: string; address: string; description: string }): Errors {
  const errors: Errors = {};
  const name = tidy(input.name);
  const address = tidy(input.address);
  if (name.length < SETUP_LIMITS.name[0] || name.length > SETUP_LIMITS.name[1]) errors.agency_name = tNow('setup.name.error');
  if (address.length < SETUP_LIMITS.address[0] || address.length > SETUP_LIMITS.address[1]) errors.address = tNow('setup.address.error');
  if (tidy(input.description).length > SETUP_LIMITS.description) errors.description = tNow('setup.about.error');
  return errors;
}

/**
 * Puts the API's per-field refusals (400 `errors: [{ field, message }]`) onto the fields of this form. A refusal about a
 * field this form does not have (an out-of-date API asking for a licence photo, say) cannot be fixed here: its name is
 * returned in `other`, so the message says what the server is complaining about instead of blaming name and address.
 */
function fieldErrorsFrom(error: ApiError): { fields: Errors; other: string[] } {
  const fields: Errors = {};
  const other: string[] = [];
  for (const item of error.body.errors ?? []) {
    const field = item.field.split('.')[0] ?? '';
    if (field === 'agency_name') fields.agency_name = tNow('setup.name.error');
    else if (field === 'address') fields.address = tNow('setup.address.error');
    else if (field === 'description') fields.description = tNow('setup.about.error');
    else if (field && !other.includes(field)) other.push(field);
  }
  return { fields, other };
}

/**
 * The first-visit profile of a signed-in account: a display name, an address and, optionally, a few words about the
 * person or business. Nothing else is asked: no document, no photo, no review. The dashboard reads and writes through
 * an agency profile, so this one short form creates it, and the pages open straight away.
 *
 * The button always answers: a field that is wrong is marked and focused, a refusal from the server is written in the
 * form, and while the request runs the button shows it is busy. It never returns without saying why.
 */
export function RegisterOffice() {
  const t = useT();
  const tm = useMarketT();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const steps = [t('setup.step1'), t('setup.step2'), t('setup.step3')];

  function clearError(field: FieldName) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  }

  function focusFirst(next: Errors) {
    const target = next.agency_name ? nameRef : next.address ? addressRef : next.description ? descriptionRef : null;
    target?.current?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    const found = validateSetup({ name, address, description });
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      focusFirst(found);
      return;
    }

    setBusy(true);
    try {
      await api.post<Agency>('agencies/register', {
        agency_name: tidy(name),
        address: tidy(address),
        description: tidy(description) || null,
      });
      toast.success(tNow('setup.done'));
      await mutate(() => true); // every page re-reads now that the profile exists, and the gate lets the dashboard in
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The profile exists already (created in another tab, say): just load it.
        await mutate(() => true);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setFormError(tNow('setup.admin.forbidden')); // an admin account: the API refuses by design
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        const { fields, other } = fieldErrorsFrom(err);
        if (Object.keys(fields).length > 0) {
          setErrors(fields);
          focusFirst(fields);
          return;
        }
        setFormError(other.length > 0 ? tNow('setup.refused', { fields: other.join('، ') }) : tNow('setup.invalid'));
        return;
      }
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reveal mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_20rem]">
      <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-line bg-surface p-6" data-testid="setup-form">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary">
            <UserRound aria-hidden className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-ink">{t('setup.title')}</h2>
            <p className="mt-0.5 text-[13px] leading-6 text-muted">{t('setup.intro')}</p>
          </div>
        </div>

        <Field label={t('setup.name.label')} error={errors.agency_name} required>
          {(props) => (
            <Input
              {...props}
              ref={nameRef}
              maxLength={SETUP_LIMITS.name[1]}
              autoComplete="organization"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError('agency_name');
              }}
              placeholder={t('setup.name.placeholder')}
              data-testid="setup-name"
            />
          )}
        </Field>
        <Field label={t('setup.address.label')} error={errors.address} required>
          {(props) => (
            <Input
              {...props}
              ref={addressRef}
              maxLength={SETUP_LIMITS.address[1]}
              autoComplete="street-address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                clearError('address');
              }}
              placeholder={tm('setup.address.placeholder')}
              data-testid="setup-address"
            />
          )}
        </Field>
        <Field label={t('setup.about.label')} hint={t('setup.about.hint')} error={errors.description}>
          {(props) => (
            <Textarea
              {...props}
              ref={descriptionRef}
              maxLength={SETUP_LIMITS.description}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError('description');
              }}
            />
          )}
        </Field>

        {formError ? (
          <p role="alert" data-testid="setup-error" className="rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-[13px] leading-6 text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full justify-center" loading={busy} data-testid="setup-submit">
          {t('setup.submit')}
        </Button>
      </form>

      <aside className="h-fit rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-[14px] font-bold text-ink">{t('setup.steps.title')}</h3>
        <ol className="mt-3 space-y-3">
          {steps.map((text, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] leading-6 text-ink-2">
              <CheckCircle2
                aria-hidden
                className={i === 0 ? 'mt-1 h-4 w-4 shrink-0 text-primary' : 'mt-1 h-4 w-4 shrink-0 text-line-strong'}
              />
              {text}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
