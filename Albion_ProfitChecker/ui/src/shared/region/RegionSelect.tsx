import type { ChangeEvent } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { Region } from "../types";
import { normalizeRegion } from "./regions";

interface RegionSelectProps {
  value: Region;
  onChange: (region: Region) => void;
  className?: string;
  ariaLabel?: string;
}

export function RegionSelect({ value, onChange, className = "city-select", ariaLabel }: RegionSelectProps) {
  const { t } = useI18n();
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = normalizeRegion(event.target.value);
    if (next) onChange(next);
  };

  return (
    <select className={className} value={value} onChange={handleChange} aria-label={ariaLabel ?? t("common.region")}>
      <option value="us">{t("panel.america")}</option>
      <option value="eu">{t("panel.europe")}</option>
      <option value="asia">{t("panel.asia")}</option>
    </select>
  );
}
