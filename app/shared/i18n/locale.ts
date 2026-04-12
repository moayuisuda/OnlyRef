import type { Locale } from "./types";

export const DEFAULT_LOCALE: Locale = "en";

export const normalizeLocale = (
  value: unknown,
  fallback: Locale = DEFAULT_LOCALE,
): Locale => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("zh")) {
    return "zh";
  }
  if (normalized.startsWith("en")) {
    return "en";
  }
  return fallback;
};
