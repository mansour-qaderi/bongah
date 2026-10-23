import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { SWRProvider } from '@/components/swr-provider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'پنل دفتر بنگاه', template: '%s | بنگاه' },
  description: 'مدیریت آگهی‌ها، ثبت گروهی، نقشه دفتر و اشتراک برای دفترهای معاملات ملکی افغانستان.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#047857', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <SWRProvider>{children}</SWRProvider>
        <Toaster position="bottom-left" dir="rtl" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
      </body>
    </html>
  );
}
