import type { I18nKey } from "./types";
import { en } from "./locales/en";

export const isI18nKey = (value: unknown): value is I18nKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(en, value);

