import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { MarketAutoDetect } from '@/components/market-auto-detect';
import { SWRProvider } from '@/components/swr-provider';
import { htmlLangFor } from '@/i18n/config';
import { LanguageProvider } from '@/i18n/provider';
import { getRequestLanguage, getRequestMarket } from '@/i18n/server';
import { translateFor } from '@/i18n/translate';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const [language, market] = await Promise.all([getRequestLanguage(), getRequestMarket()]);
  return {
    title: { default: translateFor(language, 'app.title', market), template: translateFor(language, 'app.titleTemplate', market, { page: '%s' }) },
    // In Iran the description does not speak of Afghanistan (nor, in the page's language, of Dari or Pashto).
    description: translateFor(language, 'app.description', market),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: '#047857', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [language, market] = await Promise.all([getRequestLanguage(), getRequestMarket()]);
  return (
    // Persian and Pashto are both right-to-left; only `lang` follows the chosen language (and, for Persian, the country).
    <html lang={htmlLangFor(language, market)} dir="rtl">
      <body>
        <LanguageProvider initialLanguage={language}>
          <MarketAutoDetect />
          <SWRProvider>{children}</SWRProvider>
        </LanguageProvider>
        <Toaster position="bottom-left" dir="rtl" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
      </body>
    </html>
  );
}
