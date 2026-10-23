'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { mutate } from 'swr';
import { normalizeAfghanMobile, OTP_LENGTH, toAsciiDigits } from '@bongah/validation';
import type { SendOtpResponse, VerifyOtpResponse } from '@bongah/shared-types';
import { authPost, errorMessage, ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/** Only a path inside the panel is a valid place to return to (never another site). */
function safeNext(next: string | null): string {
  return next && /^\/dashboard(\/|\?|$)/.test(next) && !next.includes('//') ? next : '/dashboard';
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const phone = normalizeAfghanMobile(phoneInput);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    if (!phone) {
      setError('شماره موبایل معتبر نیست. مثال: ۰۷۹۱۲۳۴۵۶۷۸');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authPost<SendOtpResponse>('send-otp', { phone_number: phone });
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
    const digits = toAsciiDigits(code).replace(/\s/g, '');
    if (digits.length !== OTP_LENGTH) {
      setError(`کد ${formatNumber(OTP_LENGTH)} رقمی را وارد کنید.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authPost<Omit<VerifyOtpResponse, 'access_token'>>('verify-otp', { phone_number: phone, otp_code: digits });
      await mutate(() => true, undefined, { revalidate: false }); // nothing cached from a previous account
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
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
          تغییر شماره
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-ink">کد تأیید را وارد کنید</h2>
          <p className="mt-1 text-[13px] text-muted">
            کد {formatNumber(OTP_LENGTH)} رقمی به <span className="ltr font-semibold text-ink-2">{phoneInput}</span> پیامک شد.
          </p>
        </div>
        <Field label="کد تأیید" error={error}>
          {(props) => (
            <Input
              {...props}
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH + 2}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="ltr h-12 text-center text-lg tracking-[0.5em]"
              placeholder="••••••"
            />
          )}
        </Field>
        {devCode ? (
          <p className="rounded-lg border border-line bg-soft px-3 py-2 text-xs text-muted">
            محیط آزمایشی — کد: <span className="ltr font-bold text-ink">{devCode}</span>
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
          ورود
        </Button>
        <div className="text-center text-[13px] text-muted">
          {resendIn > 0 ? (
            <>ارسال دوباره تا {formatNumber(resendIn)} ثانیه دیگر</>
          ) : (
            <button type="button" onClick={() => void requestCode()} className="font-semibold text-primary hover:underline">
              ارسال دوباره کد
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="reveal space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-extrabold text-ink">ورود به پنل دفتر</h2>
        <p className="mt-1 text-[13px] text-muted">با همان شماره‌ای وارد شوید که در اپلیکیشن بنگاه دارید.</p>
      </div>
      <Field label="شماره موبایل" error={error}>
        {(props) => (
          <Input
            {...props}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            className="ltr h-12 text-start text-base"
            placeholder="0791234567"
          />
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
        دریافت کد تأیید
      </Button>
    </form>
  );
}
