'use client';

import { useState } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import type { Agency, PropertyImageUploaded } from '@bongah/shared-types';
import { api, errorMessage } from '@/lib/api';
import { useDashboard } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { LicensePhotoField } from './license-photo';

/**
 * Where the office's documents stand, shown above every page until they are approved: waiting for review, or refused
 * with the reason and a way to send a new photo (which puts the review back to "waiting").
 */
export function VerificationBanner() {
  const { data } = useDashboard();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = data?.agency.verification_status;
  if (status !== 'PENDING' && status !== 'REJECTED') return null;

  async function resubmit() {
    if (!photo) {
      setError('عکس مدرک را انتخاب کنید.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.upload<PropertyImageUploaded>('property-images', photo);
      await api.put<Agency>('agencies/me/license', {
        license_photo: uploaded.url,
      });
      toast.success('مدرک جدید فرستاده شد و دوباره بررسی می‌شود.');
      setOpen(false);
      setPhoto(null);
      await mutate('agencies/me/dashboard');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (status === 'PENDING') {
    return (
      <div
        role="status"
        className="mb-5 flex items-start gap-3 rounded-xl border border-info/25 bg-info-tint px-4 py-3 text-[13px] leading-6 text-ink-2"
      >
        <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          <b className="text-ink">مدرک دفتر شما در انتظار بررسی است.</b> تا زمان تأیید، دفتر شما روی نقشه عمومی بنگاه نمایش داده نمی‌شود.
          می‌توانید همین حالا اشتراک بخرید و آگهی ثبت کنید.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        role="alert"
        className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-danger/25 bg-danger-tint px-4 py-3 text-[13px] leading-6 text-ink-2"
      >
        <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <p className="min-w-0 flex-1">
          <b className="text-danger">مدرک دفتر پذیرفته نشد.</b>{' '}
          {data?.agency.rejection_reason ? <>دلیل: {data.agency.rejection_reason}. </> : null}
          عکس واضح‌تری بفرستید تا دوباره بررسی شود.
        </p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          ارسال مدرک جدید
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title="ارسال مدرک جدید"
        description="عکس تازه جواز یا مدرک دفتر را بفرستید. بررسی از نو شروع می‌شود."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              انصراف
            </Button>
            <Button onClick={() => void resubmit()} loading={busy}>
              ارسال
            </Button>
          </>
        }
      >
        <LicensePhotoField file={photo} onChange={setPhoto} invalid={Boolean(error)} />
        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
