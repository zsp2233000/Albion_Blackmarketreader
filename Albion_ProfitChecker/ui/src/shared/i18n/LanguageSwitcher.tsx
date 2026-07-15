import { useI18n } from "./I18nProvider";
import "./languageSwitcher.css";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "en" ? "zh-TW" : "en";

  return (
    <button
      type="button"
      className="language-switcher"
      aria-label={`${t("language.switchTo")}: ${t(nextLocale === "en" ? "language.english" : "language.traditionalChinese")}`}
      title={t("language.switchTo")}
      onClick={() => setLocale(nextLocale)}
    >
      <span className="material-symbols-outlined" aria-hidden="true">language</span>
      <span>{locale === "en" ? "繁中" : "EN"}</span>
    </button>
  );
}
