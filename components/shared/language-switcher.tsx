'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { isLocale, LOCALE_COOKIE, setLocaleCookie, type Locale } from '@/lib/locale';
import { supabase } from '@/lib/supabase-client';
import { useTranslations } from 'next-intl';

const languages: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

export function LanguageSwitcher() {
  const t = useTranslations('components.shared.languageSwitcher');
  const router = useRouter();
  const { user } = useAuth();
  const [locale, setLocale] = useState<Locale>('en');
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cookieValue = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`))
      ?.split('=')[1];

    if (isLocale(cookieValue)) setLocale(cookieValue);
  }, []);

  const changeLocale = async (nextLocale: Locale) => {
    if (pendingLocale || nextLocale === locale) return;

    setPendingLocale(nextLocale);
    setError(null);

    if (user) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ preferred_language: nextLocale, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) {
        setError(updateError.message);
        setPendingLocale(null);
        return;
      }
    }

    setLocaleCookie(nextLocale);
    setLocale(nextLocale);
    setPendingLocale(null);
    router.refresh();
  };

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={t('language')}>
      {languages.map((language) => (
        <button
          key={language.code}
          type="button"
          aria-pressed={locale === language.code}
          disabled={pendingLocale !== null}
          onClick={() => changeLocale(language.code)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            locale === language.code
              ? 'bg-teal-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {language.label}
        </button>
      ))}
      {error && <span role="alert" className="ml-2 text-xs text-rose-600">{error}</span>}
    </div>
  );
}
