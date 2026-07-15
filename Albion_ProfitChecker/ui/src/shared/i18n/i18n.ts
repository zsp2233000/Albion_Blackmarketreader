import messages from "./messages";

export type Locale = "en" | "zh-TW";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "ui:locale";

type StorageLike = Pick<Storage, "getItem">;

export function detectLocale(storage?: StorageLike | null, browserLanguage?: string | null): Locale {
  const stored = storage?.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "zh-TW") return stored;

  const normalizedBrowserLanguage = String(browserLanguage || "").toLowerCase();
  if (normalizedBrowserLanguage.startsWith("zh-tw") || normalizedBrowserLanguage.startsWith("zh-hant")) {
    return "zh-TW";
  }

  return DEFAULT_LOCALE;
}

export type MessageKey = keyof typeof messages.en;

export function translate(
  locale: Locale,
  key: MessageKey | string,
  variables: Record<string, string | number> = {}
): string {
  const localized = messages[locale][key as MessageKey] ?? messages.en[key as MessageKey] ?? key;
  return String(localized).replace(/\{(\w+)\}/g, (match, variable: string) => {
    const value = variables[variable];
    return value === undefined ? match : String(value);
  });
}
