import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { LogoMark } from '@/components/ui/logo';
import { Building2, ListChecks, MapPinned } from 'lucide-react';

export const metadata: Metadata = { title: 'ورود' };

const POINTS = [
  { icon: ListChecks, text: 'ثبت گروهی آگهی‌ها از متن تلگرام، واتساپ یا فایل اکسل' },
  { icon: MapPinned, text: 'نقشه دفتر با جابجایی سریع موقعیت آگهی‌ها' },
  { icon: Building2, text: 'همگام با اپلیکیشن بنگاه؛ هر تغییر در هر دو دیده می‌شود' },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-primary-dark p-8 text-white max-lg:hidden xl:p-14">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-white p-2">
            <LogoMark size={40} />
          </span>
          <span className="text-2xl font-extrabold">بنگاه</span>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold leading-snug xl:text-4xl">
            پنل مدیریت دفتر
            <br />
            برای آگهی‌های زیاد، سریع و بدون دردسر
          </h1>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25">
                  <Icon aria-hidden className="h-[18px] w-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/60">رهنمای معاملات افغانستان</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark size={44} />
            <span className="text-xl font-extrabold text-primary-dark">بنگاه</span>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
