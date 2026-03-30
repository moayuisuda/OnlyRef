import { en } from './locales/en';
import { zh } from './locales/zh';
import type { I18nDict, I18nKey, I18nParams, Locale } from './types';

const dictionaries: Record<Locale, I18nDict> = {
  en,
  zh,
};

export function t(locale: Locale, key: I18nKey, params?: I18nParams): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, name) => {
    const value = params[name];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}
