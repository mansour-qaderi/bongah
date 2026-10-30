'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { mutate } from 'swr';
import { normalizeAfghanMobile, normalizeReferralCode, OTP_LENGTH, toAsciiDigits } from '@bongah/validation';
import type { SendOtpResponse, VerifyOtpResponse } from '@bongah/shared-types';
import { authPost, errorMessage, ApiError } from '@/lib/api';
import { useT } from '@/i18n/provider';
import { formatNumber } from '@/lib/format';
import { toPersianDigits } from '@/lib/persian-input';
import { NameForm } from '@/components/auth/name-form';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { OtpBoxes } from '@/components/ui/otp-boxes';
import { PersianDigitInput } from '@/components/ui/persian-input';

/** Only a path inside the panel is a valid place to return to (never another site). */
function safeNext(next: string | null): string {
  return next && /^\/dashboard(\/|\?|$)/.test(next) && !next.includes('//') ? next : '/dashboard/map';
}

type Step = 'phone' | 'code' | 'name';

/**
 * Sign-in and sign-up in one: a mobile number, the code sent to it, and (for an account that has no name yet) the name.
 * An account is created by the first confirmed code, so there is no separate "register" page and nothing has to be
 * done in the phone app first. The number and the code are typed in Persian digits (see PersianDigitInput).
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [referral, setReferral] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  const phone = normalizeAfghanMobile(phoneInput);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function finish() {
    router.replace(safeNext(params.get('next')));
    router.refresh();
  }

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    if (!phone) {
      setError(t('login.phoneInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authPost<SendOtpResponse>('send-otp', {
        phone_number: phone,
      });
      setDevCode(res.dev_otp ?? null);
      setResendIn(res.resend_after);
      setCode('');
      setStep('code');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setResendIn(err.retryAfter ?? 60);
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const digits = toAsciiDigits(code);
    if (digits.length !== OTP_LENGTH) {
      setError(t('login.codeLength', { length: formatNumber(OTP_LENGTH) }));
      return;
    }
    const referralCode = referral.trim() ? normalizeReferralCode(referral) : null;
    if (referral.trim() && !referralCode) {
      setError(t('login.referralInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authPost<Omit<VerifyOtpResponse, 'access_token'>>('verify-otp', {
        phone_number: phone,
        otp_code: digits,
        ...(referralCode ? { referral_code: referralCode } : {}),
      });
      await mutate(() => true, undefined, { revalidate: false }); // nothing cached from a previous account
      if (!res.user?.full_name?.trim()) {
        setStep('name');
        setBusy(false);
        return;
      }
      finish();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (step === 'name') {
    return (
      <div className="reveal space-y-5">
        <div>
          <h2 className="text-xl font-extrabold text-ink">{t('login.welcomeTitle')}</h2>
          <p className="mt-1 text-[13px] text-muted">{t('login.welcomeText')}</p>
        </div>
        <NameForm onDone={finish} submitLabel={t('login.enterPanel')} />
      </div>
    );
  }

  if (step === 'code') {
    return (
      <form onSubmit={verify} className="reveal space-y-5" noValidate>
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setError(null);
          }}
          className="flex items-center gap-1 text-[13px] text-muted hover:text-primary"
        >
          <ArrowRight aria-hidden className="h-4 w-4" />
          {t('login.changeNumber')}
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-ink">{t('login.codeTitle')}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {t('login.codeSentBefore', { length: formatNumber(OTP_LENGTH) })}{' '}
            <span className="fa-digits ltr font-semibold text-ink-2">{phoneInput}</span> {t('login.codeSentAfter')}
          </p>
        </div>
        <Field label={t('login.codeLabel')} error={error}>
          {(props) => (
            <OtpBoxes
              id={props.id}
              aria-describedby={props['aria-describedby']}
              invalid={props.invalid}
              disabled={busy}
              length={OTP_LENGTH}
              label={t('login.codeLabel')}
              value={code}
              onValueChange={(next) => {
                setCode(next);
                setError(null);
              }}
            />
          )}
        </Field>
        {devCode ? (
          <p className="rounded-lg border border-line bg-soft px-3 py-2 text-xs text-muted">
            {t('login.devEnv')} <span className="fa-digits ltr font-bold text-ink">{toPersianDigits(devCode)}</span>
          </p>
        ) : null}
        {showReferral ? (
          <Field label={t('login.referralLabel')} hint={t('login.referralHint')}>
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                className="text-start tracking-widest"
                placeholder="ABCD2345"
              />
            )}
          </Field>
        ) : (
          <button type="button" onClick={() => setShowReferral(true)} className="text-[13px] font-semibold text-primary hover:underline">
            {t('login.referralAsk')}
          </button>
        )}
        <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
          {t('login.verify')}
        </Button>
        <div className="text-center text-[13px] text-muted">
          {resendIn > 0 ? (
            <>{t('login.resendIn', { seconds: formatNumber(resendIn) })}</>
          ) : (
            <button type="button" onClick={() => void requestCode()} className="font-semibold text-primary hover:underline">
              {t('login.resend')}
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="reveal space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-extrabold text-ink">{t('login.title')}</h2>
        <p className="mt-1 text-[13px] leading-6 text-muted">{t('login.hint')}</p>
      </div>
      <Field label={t('login.phoneLabel')} error={error}>
        {(props) => (
          <PersianDigitInput
            {...props}
            kind="phone"
            autoComplete="tel"
            autoFocus
            value={phoneInput}
            onValueChange={setPhoneInput}
            className="h-12 text-base"
            placeholder="۰۷۹۱۲۳۴۵۶۷۸"
          />
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
        {t('login.getCode')}
      </Button>
    </form>
  );
}
