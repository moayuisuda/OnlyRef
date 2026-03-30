import { useSnapshot } from 'valtio';
import { t as translate } from '../../shared/i18n/t';
import type { I18nKey, I18nParams } from '../../shared/i18n/types';
import { i18nActions, i18nState } from '../store/i18nStore';

export function useT() {
  const snap = useSnapshot(i18nState);
  return {
    locale: snap.locale,
    setLocale: i18nActions.setLocale,
    t: (key: I18nKey, params?: I18nParams) => translate(snap.locale, key, params),
  };
}

