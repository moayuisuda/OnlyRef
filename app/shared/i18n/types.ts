import { en } from './locales/en';

export type Locale = 'en' | 'zh';

export type I18nKey = keyof typeof en;
export type I18nDict = Record<I18nKey, string>;
export type I18nParams = Record<string, string | number>;

export type I18nMessage = {
  key: I18nKey;
  params?: I18nParams;
};
