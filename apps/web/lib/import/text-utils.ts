import { toAsciiDigits } from '@bongah/validation';

const ZWNJ = /‌/g;
const INVISIBLE = /[​‍‎‏‪-‮⁦-⁩﻿]/g;
const TATWEEL = /ـ/g;
const DIACRITICS = /[ً-ٰٟ]/g;

/**
 * The text as the matchers see it: ASCII digits, one spelling of ی and ک, no tatweel or marks, zero-width joiners
 * as plain spaces, runs of spaces collapsed (line breaks kept). Positions in this text are NOT positions in the
 * original, so extraction results are values, never offsets.
 */
export function flatten(input: string): string {
  return toAsciiDigits(input)
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(ZWNJ, ' ')
    .replace(TATWEEL, '')
    .replace(DIACRITICS, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'ه')
    .replace(/[ \t ]+/g, ' ')
    .replace(/[٬،]/g, ',')
    .replace(/٫/g, '.');
}

/** Letters or digits in any script. */
export const WORD = '\\p{L}\\p{N}';

/** A regex source that matches `word` only as a whole word (Persian text has no \b that works). */
export const whole = (source: string) => `(?<![${WORD}])(?:${source})(?![${WORD}])`;

/** Decorations agents put in front of lines: emoji, arrows, bullets, check marks, labels' colons. */
export function stripDecoration(line: string): string {
  return line
    .replace(/[\p{Extended_Pictographic}⃣️•●○▪▫■□★☆✔✅➡⬅⭐✨]+/gu, ' ')
    .replace(/^[\s\-–—_=*#>~·•.:|]+/, '')
    .replace(/[\s\-–—_=*#~|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lines made only of symbols (3+ of them) are separators between listings: "-----", "➖➖➖", "〰〰〰". */
export function isSeparatorLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 3 && !/[\p{L}\p{N}]/u.test(t);
}

/** Cuts at a word boundary, never mid-word, and never leaves the text longer than `max`. */
export function cutAt(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
}
