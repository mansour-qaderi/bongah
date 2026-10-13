/** What the phone does with a number: dial it, or start a WhatsApp chat with it. */

export type ContactAction = 'call' | 'whatsapp';

/** `+93701234567` -> `tel:+93701234567`. */
export const telUrl = (e164: string): string => `tel:${e164}`;

/** wa.me wants the number with country code and no `+`, spaces or dashes. */
export const whatsappDigits = (e164: string): string => e164.replace(/\D/g, '');

/** The short reference the buyer quotes in the first message so the seller knows which listing it is about. */
export const propertyRef = (propertyId: string): string =>
  `#${propertyId.slice(0, 8)}`;

/**
 * Opens WhatsApp (the app if installed, otherwise WhatsApp Web in the browser) on a chat with this
 * number, with `text` already typed in. The person still has to press send.
 */
export const whatsappUrl = (e164: string, text: string): string =>
  `https://wa.me/${whatsappDigits(e164)}?text=${encodeURIComponent(text)}`;
