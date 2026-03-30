import { proxy } from 'valtio';
import { getLanguage, setLanguage } from '../service';
import type { Locale } from '../../shared/i18n/types';

export const i18nState = proxy<{ locale: Locale; hydrated: boolean }>({
  locale: 'en',
  hydrated: false,
});

export const i18nActions = {
  hydrate: async () => {
    const locale = await getLanguage();
    i18nState.locale = locale;
    i18nState.hydrated = true;
  },
  setLocale: (locale: Locale) => {
    i18nState.locale = locale;
    void setLanguage(locale);
  },
};

