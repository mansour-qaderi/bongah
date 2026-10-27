'use client';

import { useEffect, useRef, useState } from 'react';
import { FileImage, RefreshCw } from 'lucide-react';
import { fitImage, IMAGE_ACCEPT, isAcceptedImage } from '@/lib/image';
import { cn } from '@/lib/cn';

/**
 * Picks the photo of the office licence (or any document the review needs). Only JPEG, PNG and WebP are taken; a big
 * phone photo is made smaller in the browser so it fits the upload limit. The file is NOT sent from here: the form that
 * owns this field uploads it together with the rest, once.
 */
export function LicensePhotoField({
  id,
  file,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function pick(list: FileList | null) {
    const picked = list?.[0];
    if (input.current) input.current.value = '';
    if (!picked) return;
    setProblem(null);
    if (!isAcceptedImage(picked)) {
      setProblem('فقط عکس JPG، PNG یا WebP پذیرفته می‌شود.');
      return;
    }
    setWorking(true);
    try {
      onChange(await fitImage(picked));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'عکس آماده نشد.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        id={id}
        aria-describedby={describedBy}
        onClick={() => input.current?.click()}
        disabled={working}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-start transition-colors hover:border-primary disabled:opacity-60',
          invalid ? 'border-danger' : 'border-line-strong',
        )}
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-soft text-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="پیش‌نمایش مدرک" className="h-full w-full object-cover" />
          ) : (
            <FileImage aria-hidden className="h-6 w-6" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink-2">
            {working ? 'در حال آماده‌سازی عکس…' : file ? file.name : 'انتخاب عکس مدرک'}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {file ? 'برای عوض کردن عکس دوباره بزنید.' : 'عکس واضح جواز یا مدرک دفتر (JPG، PNG یا WebP).'}
          </span>
        </span>
        {file ? <RefreshCw aria-hidden className="h-4 w-4 shrink-0 text-muted" /> : null}
      </button>
      {problem ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {problem}
        </p>
      ) : null}
      <input ref={input} type="file" accept={IMAGE_ACCEPT} hidden data-testid="license-input" onChange={(e) => void pick(e.target.files)} />
    </div>
  );
}
