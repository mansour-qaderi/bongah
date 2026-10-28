'use client';

import { Copy, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '@/i18n/provider';
import { buildLocationShare, telegramUrl, whatsappUrl, type SharedPlace, type ShareWords } from '@/lib/share-location';
import { Button } from '@/components/ui/button';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { ShareIcon } from './map-icons';

/** Puts text on the clipboard; the old way (a hidden text box) where the clipboard API is missing (plain http, old browsers). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;opacity:0;';
    document.body.append(box);
    box.select();
    const done = document.execCommand('copy');
    box.remove();
    return done;
  } catch {
    return false;
  }
}

/**
 * «Share the property's location»: a menu to send the exact place to a client in WhatsApp or Telegram (each opens the
 * app's own "send to…" with the message filled in), copy it, or hand it to the phone's share sheet where there is one.
 * The message has the map link, the coordinates as plain text and, for a saved listing, its link.
 */
export function ShareLocationButton({
  place,
  className,
  variant = 'secondary',
  menuClassName,
}: {
  /** What to share; null while there is no position (the button waits, disabled). */
  place: SharedPlace | null;
  className?: string;
  variant?: 'secondary' | 'ghost';
  /** Lets the menu sit above a fullscreen map (it is drawn at the page's top level). */
  menuClassName?: string;
}) {
  const t = useT();
  const words: ShareWords = {
    heading: (title) => (title ? t('share.location.heading', { title }) : t('share.location.headingPlain')),
    mapLine: t('share.location.mapLine'),
    coordinates: (coords) => t('share.location.coordinates', { coords }),
    listingLine: t('share.location.listingLine'),
  };
  const content = place ? buildLocationShare(place, words) : null;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const open = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={!content} className={className} data-testid="share-location" title={t('share.location')}>
          <ShareIcon className="h-4 w-4" />
          {t('share.location')}
        </Button>
      </DropdownTrigger>
      <DropdownContent className={menuClassName ?? 'z-[90]'}>
        <DropdownItem icon={<MessageCircle aria-hidden className="h-4 w-4" />} onSelect={() => content && open(whatsappUrl(content.text))}>
          {t('share.location.whatsapp')}
        </DropdownItem>
        <DropdownItem icon={<Send aria-hidden className="h-4 w-4" />} onSelect={() => content && open(telegramUrl(content.link, content.textWithoutLink))}>
          {t('share.location.telegram')}
        </DropdownItem>
        <DropdownItem
          icon={<Copy aria-hidden className="h-4 w-4" />}
          onSelect={() => {
            if (!content) return;
            void copyText(content.text).then((done) => (done ? toast.success(t('share.location.copied')) : toast.error(t('share.location.copyFailed'))));
          }}
        >
          {t('share.location.copy')}
        </DropdownItem>
        {canNativeShare ? (
          <DropdownItem
            icon={<ShareIcon className="h-4 w-4" />}
            onSelect={() => {
              if (!content) return;
              // Closing the sheet without choosing is not a failure (the browser rejects with AbortError).
              void navigator.share({ text: content.text }).catch(() => undefined);
            }}
          >
            {t('share.location.more')}
          </DropdownItem>
        ) : null}
      </DropdownContent>
    </DropdownRoot>
  );
}
