import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { SWRProvider } from '@/components/swr-provider';
import { LANGUAGE_META } from '@/i18n/config';
import { LanguageProvider } from '@/i18n/provider';
import { getRequestLanguage } from '@/i18n/server';
import { translate } from '@/i18n/translate';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const language = await getRequestLanguage();
  return {
    title: { default: translate(language, 'app.title'), template: translate(language, 'app.titleTemplate', { page: '%s' }) },
    description: translate(language, 'app.description'),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: '#047857', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = await getRequestLanguage();
  return (
    // Dari and Pashto are both right-to-left; only `lang` follows the chosen language.
    <html lang={LANGUAGE_META[language].htmlLang} dir="rtl">
      <body>
        <LanguageProvider initialLanguage={language}>
          <SWRProvider>{children}</SWRProvider>
        </LanguageProvider>
        <Toaster position="bottom-left" dir="rtl" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
      </body>
    </html>
  );
}
