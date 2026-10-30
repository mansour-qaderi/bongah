import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getRequestLanguage, getRequestMarket } from '@/i18n/server';
import { translateFor, type MessageKey } from '@/i18n/translate';
import { CountryLanguageSwitcher } from '@/components/ui/country-language-switcher';
import { LoginForm } from './login-form';
import { LogoMark } from '@/components/ui/logo';
import { Building2, ListChecks, MapPinned, RefreshCw } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const [language, market] = await Promise.all([getRequestLanguage(), getRequestMarket()]);
  return { title: translateFor(language, 'login.pageTitle', market) };
}

const POINTS: { icon: typeof ListChecks; key: MessageKey }[] = [
  { icon: ListChecks, key: 'login.point.bulk' },
  { icon: MapPinned, key: 'login.point.map' },
  { icon: Building2, key: 'login.point.account' },
  { icon: RefreshCw, key: 'login.point.sync' },
];

export default async function LoginPage() {
  const [language, market] = await Promise.all([getRequestLanguage(), getRequestMarket()]);
  const t = (key: MessageKey) => translateFor(language, key, market);
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-primary-dark p-8 text-white max-lg:hidden xl:p-14">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-white p-2">
            <LogoMark size={40} />
          </span>
          <span className="text-2xl font-extrabold">{t('app.name')}</span>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold leading-snug xl:text-4xl">
            {t('login.heroTitle1')}
            <br />
            {t('login.heroTitle2')}
          </h1>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3 text-white/90">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25">
                  <Icon aria-hidden className="h-[18px] w-[18px]" />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/60">{t('login.footer')}</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-end">
            <CountryLanguageSwitcher />
          </div>
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark size={44} />
            <span className="text-xl font-extrabold text-primary-dark">{t('app.name')}</span>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
