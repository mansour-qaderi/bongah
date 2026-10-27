'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PropertyImageUploaded } from '@bongah/shared-types';
import { PROPERTY_MAX_IMAGES } from '@bongah/shared-types';
import { api, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { pooled } from '@/lib/listing-actions';
import { tNow } from '@/i18n/active';
import { useT } from '@/i18n/provider';

export interface PickedImage {
  /** The public URL the listing will store. */
  url: string;
  /** A local preview, so the thumbnail does not depend on the API being reachable from the browser. */
  preview: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function ImagePicker({ images, onChange }: { images: PickedImage[]; onChange: (next: PickedImage[]) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const room = PROPERTY_MAX_IMAGES - images.length;
    const picked = [...files].filter((f) => ACCEPT.split(',').includes(f.type)).slice(0, room);
    if (picked.length < files.length) toast.info(tNow('images.onlyTypes', { max: formatNumber(PROPERTY_MAX_IMAGES) }));
    const added: PickedImage[] = [];
    setBusy((b) => b + picked.length);
    await pooled(picked, 3, async (file) => {
      try {
        const res = await api.upload<PropertyImageUploaded>('property-images', file);
        added.push({ url: res.url, preview: URL.createObjectURL(file) });
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      } finally {
        setBusy((b) => b - 1);
      }
    });
    if (added.length) onChange([...images, ...added]);
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <div key={img.url} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.preview} alt={t('images.alt', { n: formatNumber(i + 1) })} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label={t('images.remove', { n: formatNumber(i + 1) })}
              onClick={() => onChange(images.filter((x) => x.url !== img.url))}
              className="absolute end-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={`busy-${i}`} className="skeleton h-16 w-16 rounded-xl" aria-label={t('images.loading')} role="status" />
        ))}
        {images.length + busy < PROPERTY_MAX_IMAGES ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line-strong text-[11px] text-muted hover:border-primary hover:text-primary"
          >
            <ImagePlus aria-hidden className="h-5 w-5" />
            {t('images.add')}
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void add(e.target.files)} />
    </div>
  );
}
