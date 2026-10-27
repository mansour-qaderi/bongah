import { cookies } from 'next/headers';
import { LANGUAGE_COOKIE, toLanguage, type Language } from './config';

/** The language of this request, from the cookie the switcher sets. */
export async function getRequestLanguage(): Promise<Language> {
  return toLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
}
