import { getRequestConfig } from 'next-intl/server';

const DEFAULT_LOCALE = 'en';
export const locales = ['en', 'vi'];

export default getRequestConfig(async ({ locale }: { locale: string }) => {
  const safeLocale = locales.includes(locale) ? locale : DEFAULT_LOCALE;
  
  return {
    locale: safeLocale,
    messages: (await import(`./messages/${safeLocale}.json`)).default
  };
});