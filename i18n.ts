import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { isLocale, LOCALE_COOKIE } from '@/lib/locale';
import englishMessages from '@/messages/en.json';
import hindiMessages from '@/messages/hi.json';

type MessageTree = { [key: string]: string | MessageTree };

function mergeMessages(
  fallback: MessageTree,
  translations: MessageTree,
): MessageTree {
  const merged = { ...fallback };

  for (const [key, value] of Object.entries(translations)) {
    const fallbackValue = merged[key];
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      fallbackValue && typeof fallbackValue === 'object' && !Array.isArray(fallbackValue)
    ) {
      merged[key] = mergeMessages(
        fallbackValue as MessageTree,
        value as MessageTree,
      );
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : 'en';

  return {
    locale,
    messages: locale === 'hi'
      ? mergeMessages(englishMessages as MessageTree, hindiMessages as MessageTree)
      : englishMessages,
  };
});
