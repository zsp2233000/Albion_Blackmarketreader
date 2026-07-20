import { useEffect } from "react";
import { useI18n } from "../../../shared/i18n/I18nProvider";
import type { ConsumableCategory } from "../core";
import {
  SPEC_LEVEL_MAX,
  SPEC_LEVEL_MIN,
  applyFocusEfficiency,
  clampSpecLevel,
  computeFocusEfficiency,
  familiesForCategory,
} from "./data";
import type { CraftingProgress } from "./data";
import "./fpSpecs.css";

interface Props {
  open: boolean;
  category: ConsumableCategory;
  progress: CraftingProgress;
  activeFamily: string | null;
  pendingSync?: boolean;
  readOnly?: boolean;
  onMastery: (category: ConsumableCategory, level: number) => void;
  onSpec: (category: ConsumableCategory, familyKey: string, level: number) => void;
  onReset: (category: ConsumableCategory) => void;
  onClose: () => void;
}

function SliderLine({ level, label, accent, onChange }: { level: number; label: string; accent: boolean; onChange: (n: number) => void }) {
  const { t } = useI18n();
  const fill = (clampSpecLevel(level) / SPEC_LEVEL_MAX) * 100;
  return (
    <div className={`fps-row ${accent ? "active" : ""}`}>
      <div className="fps-row-head">
        <span className="fps-row-label">{label}</span>
        {accent ? <span className="fps-badge">{t("specs.crafting")}</span> : null}
        <span className="fps-row-value">{level}</span>
      </div>
      <div className="fps-controls">
        <button type="button" className="fps-step" disabled={level <= SPEC_LEVEL_MIN} onClick={() => onChange(level - 10)}>−10</button>
        <input
          type="range" min={SPEC_LEVEL_MIN} max={SPEC_LEVEL_MAX} step={1} value={level}
          style={{ "--fill": `${fill}%` } as React.CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number" min={SPEC_LEVEL_MIN} max={SPEC_LEVEL_MAX} step={1} value={level}
          className="fps-number" onChange={(e) => onChange(Number(e.target.value))}
        />
        <button type="button" className="fps-step" disabled={level >= SPEC_LEVEL_MAX} onClick={() => onChange(level + 10)}>+10</button>
      </div>
    </div>
  );
}

export function FoodPotionSpecsModal({ open, category, progress, activeFamily, pendingSync = false, readOnly = false, onMastery, onSpec, onReset, onClose }: Props) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cat = progress[category];
  const families = familiesForCategory(category);
  const eff = computeFocusEfficiency(progress, category, activeFamily);
  const reductionPct = (1 - applyFocusEfficiency(100, eff) / 100) * 100;
  const stationLabel = category === "food" ? t("common.cooking") : t("common.alchemy");

  return (
    <div className="fps-overlay" onClick={onClose}>
      <div className="fps-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {readOnly ? (
          <div className="fps-readonly-note">
            {t("auth.guestMode")} · {t("specs.readOnly")}{" "}
            <a
              href="/login"
              className="guest-signin-anchor"
              onClick={(e) => {
                e.preventDefault();
                const next = encodeURIComponent(window.location.pathname || "/food-potion-crafter");
                window.location.href = `/login?next=${next}`;
              }}
            >
              {t("auth.signIn")}
            </a>{" "}
            {t("common.toEdit")}
          </div>
        ) : null}
        <header className="fps-header">
          <div>
            <h3>{stationLabel} {t("specs.craftingTitle")}</h3>
            <p>{t("specs.foodPotionDescription")}</p>
          </div>
          <div className="fps-meta">
            <span className={`fps-sync ${pendingSync ? "pending" : ""}`}>{pendingSync ? t("common.saving") : t("common.synced")}</span>
            <button type="button" className="fps-close" aria-label={t("common.close")} onClick={onClose}>×</button>
          </div>
        </header>

        <div className="fps-stat-bar">
          <div><span>{t("specs.focusEfficiency")}</span><strong>{Math.round(eff).toLocaleString("de-DE")}</strong></div>
          <div><span>{t("specs.focusReduction")}</span><strong className="profit">−{reductionPct.toFixed(1)}%</strong></div>
          <div><span>{t("specs.activeFamily")}</span><strong>{activeFamily ? families.find((f) => f.key === activeFamily)?.label ?? "—" : "—"}</strong></div>
        </div>

        <div className={`fps-body ${readOnly ? "readonly" : ""}`}>
          <div className="fps-mastery">
            <SliderLine level={cat.mastery} label={`${stationLabel} ${t("common.mastery")}`} accent={false} onChange={(n) => onMastery(category, n)} />
          </div>
          <div className="fps-list">
            {families.map((fam) => (
              <SliderLine
                key={fam.key}
                level={cat.specs[fam.key] ?? 0}
                label={fam.label}
                accent={fam.key === activeFamily}
                onChange={(n) => onSpec(category, fam.key, n)}
              />
            ))}
          </div>
        </div>

        <footer className="fps-footer">
          <button type="button" className="fps-btn ghost" onClick={() => onReset(category)} disabled={readOnly}>{t("specs.resetStation", { station: stationLabel })}</button>
          <button type="button" className="fps-btn primary" onClick={onClose}>{t("specs.done")}</button>
        </footer>
      </div>
    </div>
  );
}
