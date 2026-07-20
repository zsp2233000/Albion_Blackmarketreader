import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../shared/i18n/I18nProvider";
import {
  SPEC_LEVEL_MAX,
  SPEC_LEVEL_MIN,
  clampSpecLevel,
  getMasteryGroup,
  getMasteryLevel,
  getSpecLevel,
  getStationForItem,
  getStationLabel,
  resolveSpecKey
} from "./data";
import type { CraftingProgress, SpecStation } from "./types";
import "./specs.css";

const STATIONS: ReadonlyArray<SpecStation> = ["warrior", "hunter", "mage", "toolmaker"];

interface ItemRef {
  id: string;
  name?: string;
  categoryKey?: string;
}

interface SpecsModalProps {
  open: boolean;
  progress: CraftingProgress;
  items: ReadonlyArray<ItemRef>;
  highlightedSpecKey?: string | null;
  pendingSync?: boolean;
  readOnly?: boolean;
  onChange: (specKey: string, level: number) => void;
  onMasteryChange: (groupKey: string, level: number) => void;
  onReset: () => void;
  onClose: () => void;
}

interface CategoryGroup {
  categoryKey: string;
  label: string;
  items: ItemRef[];
  masteryGroups: string[];
}

function humanizeCategoryLabel(key: string): string {
  return key
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SpecsModal({
  open,
  progress,
  items,
  highlightedSpecKey,
  pendingSync = false,
  readOnly = false,
  onChange,
  onMasteryChange,
  onReset,
  onClose
}: SpecsModalProps) {
  const { t } = useI18n();
  const [activeStation, setActiveStation] = useState<SpecStation>("warrior");
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!highlightedSpecKey) return;
    const match = items.find((item) => resolveSpecKey(item) === highlightedSpecKey);
    const station = match ? getStationForItem(match) : null;
    if (station) setActiveStation(station);
    if (match?.categoryKey) setActiveCategory(match.categoryKey);
  }, [highlightedSpecKey, items, open]);

  useEffect(() => {
    setActiveCategory("__all__");
  }, [activeStation]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const itemsByStation = useMemo(() => {
    const groups: Record<SpecStation, ItemRef[]> = { warrior: [], hunter: [], mage: [], toolmaker: [] };
    for (const item of items) {
      const station = getStationForItem(item);
      if (!station) continue;
      groups[station].push(item);
    }
    return groups;
  }, [items]);

  const stationCategories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const item of itemsByStation[activeStation]) {
      const category = String(item.categoryKey || "misc");
      seen.set(category, (seen.get(category) ?? 0) + 1);
    }
    return Array.from(seen.entries()).map(([categoryKey, count]) => ({
      categoryKey,
      label: humanizeCategoryLabel(categoryKey),
      count
    }));
  }, [itemsByStation, activeStation]);

  const filteredGroups = useMemo<CategoryGroup[]>(() => {
    const stationItems = itemsByStation[activeStation];
    const query = search.trim().toLowerCase();
    const categoryMatches = (item: ItemRef): boolean =>
      activeCategory === "__all__" || String(item.categoryKey || "misc") === activeCategory;
    const queryMatches = (item: ItemRef): boolean => {
      if (!query) return true;
      const name = String(item.name || "").toLowerCase();
      const id = String(item.id || "").toLowerCase();
      return name.includes(query) || id.includes(query);
    };
    const filtered = stationItems.filter((item) => categoryMatches(item) && queryMatches(item));
    const byCategory = new Map<string, { items: ItemRef[]; masteryGroups: Set<string> }>();
    for (const item of filtered) {
      const category = String(item.categoryKey || "misc");
      const group = getMasteryGroup(item);
      if (!byCategory.has(category)) byCategory.set(category, { items: [], masteryGroups: new Set() });
      const bucket = byCategory.get(category)!;
      bucket.items.push(item);
      if (group) bucket.masteryGroups.add(group);
    }
    return Array.from(byCategory.entries()).map(([categoryKey, bucket]) => ({
      categoryKey,
      label: humanizeCategoryLabel(categoryKey),
      items: bucket.items,
      masteryGroups: Array.from(bucket.masteryGroups)
    }));
  }, [itemsByStation, activeStation, activeCategory, search]);

  return (
    <div className={`modal-overlay specs-overlay ${open ? "open" : ""}`} aria-hidden={open ? "false" : "true"} onClick={onClose}>
      <div className="specs-modal" role="dialog" aria-modal="true" aria-labelledby="specsTitle" onClick={(event) => event.stopPropagation()}>
        {readOnly ? (
          <div className="specs-readonly-note">
            {t("auth.guestMode")} · {t("specs.readOnly")}{" "}
            <a
              href="/login"
              className="guest-signin-anchor"
              onClick={(e) => {
                e.preventDefault();
                const next = encodeURIComponent(window.location.pathname || "/crafting-calculator");
                window.location.href = `/login?next=${next}`;
              }}
            >
              {t("auth.signIn")}
            </a>{" "}
            {t("common.toEdit")}
          </div>
        ) : null}
        <header className="specs-header">
          <div>
            <h3 id="specsTitle">{t("specs.craftingTitle")}</h3>
            <p>{t("specs.craftingDescription")}</p>
          </div>
          <div className="specs-meta">
            <span className={`specs-sync ${pendingSync ? "pending" : ""}`}>{pendingSync ? t("common.saving") : t("common.synced")}</span>
            <button type="button" className="specs-close" aria-label={t("common.close")} onClick={onClose}>×</button>
          </div>
        </header>

        <nav className="specs-tabs" aria-label={t("common.craftingStations")}>
          {STATIONS.map((station) => (
            <button
              key={station}
              type="button"
              className={`specs-tab ${activeStation === station ? "active" : ""}`}
              onClick={() => setActiveStation(station)}
            >
              <span>{getStationLabel(station)}</span>
              <span className="specs-tab-count">{itemsByStation[station].length}</span>
            </button>
          ))}
        </nav>

        <div className="specs-filter-row">
          <button
            type="button"
            className={`specs-chip ${activeCategory === "__all__" ? "active" : ""}`}
            onClick={() => setActiveCategory("__all__")}
          >
            {t("common.all")}
            <span>{itemsByStation[activeStation].length}</span>
          </button>
          {stationCategories.map((cat) => (
            <button
              key={cat.categoryKey}
              type="button"
              className={`specs-chip ${activeCategory === cat.categoryKey ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.categoryKey)}
            >
              {cat.label}
              <span>{cat.count}</span>
            </button>
          ))}
        </div>

        <div className="specs-search-row">
          <input
            type="text"
            className="specs-search"
            placeholder={t("common.searchStationItems")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className={`specs-body ${readOnly ? "readonly" : ""}`}>
          {filteredGroups.length === 0 ? (
            <div className="specs-empty">{t("specs.noItemsMatch")}</div>
          ) : (
            filteredGroups.map((group) => (
              <section key={group.categoryKey} className="specs-group">
                <h4 className="specs-group-title">{group.label}<span>{group.items.length}</span></h4>

                {group.masteryGroups.map((masteryGroup) => (
                  <div key={masteryGroup} className="specs-mastery-row">
                    <span className="specs-mastery-label">{t("common.mastery")} · {humanizeCategoryLabel(masteryGroup)}</span>
                    <SpecLine
                      level={getMasteryLevel(progress.masteries, masteryGroup)}
                      onChange={(level) => onMasteryChange(masteryGroup, level)}
                      itemLabel={`${humanizeCategoryLabel(masteryGroup)} mastery`}
                    />
                  </div>
                ))}

                <ul className="specs-list">
                  {group.items.map((item) => {
                    const key = resolveSpecKey(item);
                    if (!key) return null;
                    const specLevel = getSpecLevel(progress.specs, key);
                    const isHighlighted = highlightedSpecKey === key;
                    return (
                      <li key={key} className={`specs-row ${isHighlighted ? "highlighted" : ""}`}>
                        <div className="specs-row-head">
                          <span className="specs-row-label">{item.name || key}</span>
                          {isHighlighted ? <span className="specs-badge">{t("specs.active")}</span> : null}
                          <span className="specs-row-value">{specLevel}</span>
                        </div>
                        <SpecLine
                          level={specLevel}
                          onChange={(level) => onChange(key, level)}
                          itemLabel={item.name || key}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <footer className="specs-footer">
          <button type="button" className="modal-btn ghost" onClick={onReset} disabled={readOnly}>{t("specs.resetAll")}</button>
          <button type="button" className="modal-btn primary" onClick={onClose}>{t("specs.done")}</button>
        </footer>
      </div>
    </div>
  );
}

interface SpecLineProps {
  level: number;
  itemLabel: string;
  onChange: (level: number) => void;
}

function SpecLine({ level, itemLabel, onChange }: SpecLineProps) {
  const fillPercent = (clampSpecLevel(level) / SPEC_LEVEL_MAX) * 100;
  return (
    <div className="specs-row-controls">
      <button
        type="button"
        className="specs-step"
        onClick={() => onChange(level - 10)}
        disabled={level <= SPEC_LEVEL_MIN}
        aria-label={`Decrease ${itemLabel} by 10`}
      >−10</button>
      <input
        type="range"
        min={SPEC_LEVEL_MIN}
        max={SPEC_LEVEL_MAX}
        step={1}
        value={level}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--fill": `${fillPercent}%` } as React.CSSProperties}
        aria-label={`${itemLabel} level slider`}
      />
      <input
        type="number"
        min={SPEC_LEVEL_MIN}
        max={SPEC_LEVEL_MAX}
        step={1}
        value={level}
        onChange={(event) => onChange(Number(event.target.value))}
        className="specs-number"
        aria-label={`${itemLabel} numeric input`}
      />
      <button
        type="button"
        className="specs-step"
        onClick={() => onChange(level + 10)}
        disabled={level >= SPEC_LEVEL_MAX}
        aria-label={`Increase ${itemLabel} by 10`}
      >+10</button>
    </div>
  );
}
