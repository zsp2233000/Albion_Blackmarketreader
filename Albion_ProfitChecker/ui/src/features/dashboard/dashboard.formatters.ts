import type { Locale } from "../../shared/i18n/i18n";

export function formatSilver(value: number, locale: Locale): string {
  return Number(value || 0).toLocaleString(locale);
}
