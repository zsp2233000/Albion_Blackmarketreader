import { useState } from "react";
import { createPortal } from "react-dom";
import { assetUrl, onItemIconError } from "../assets/assets";
import { JOURNAL_PROFESSIONS, type JournalProfession } from "./journals";
import { journalPriceTable, type JournalData, type OwnedJournals } from "./useJournals";
import { useI18n } from "../i18n/I18nProvider";
import "./journalControls.css";

const PROFESSION_ORDER: JournalProfession[] = ["warrior", "hunter", "mage", "toolmaker"];

function fmt(value: number): string {
  return value > 0 ? Math.round(value).toLocaleString("en-US") : "–";
}

/** Albion CDN icon for a profession's (full) journal. */
function journalIcon(profession: JournalProfession): string {
  return `https://render.albiononline.com/v1/item/T4_${JOURNAL_PROFESSIONS[profession].stem}_FULL.png`;
}

interface JournalControlsProps {
  enabled: boolean;
  owned: OwnedJournals;
  onToggleEnabled: (next: boolean) => void;
  onToggleOwned: (profession: JournalProfession) => void;
  /** Live journal price data + the city used for the price table (defaults sensibly if omitted). */
  data?: JournalData | null;
  city?: string;
  /**
   * Restrict the settings modal to a single profession's journal. Use on single-item views (the
   * Crafting Calculator) so only the journal that item actually fills is shown. Omit (or undefined)
   * to show all four; null means the current item has no journal.
   */
  onlyProfession?: JournalProfession | null;
  /**
   * Show the per-profession "do you fill this" checkboxes. Off on list views (BM Crafter) where all
   * four journals always apply and the modal is a pure price reference. Defaults to true.
   */
  showOwnership?: boolean;
}

/**
 * Shared journal-profit control: a toggle to include journal ("book") profit, an info button
 * explaining the mechanic, and a settings modal to choose which profession journals you fill and
 * see the per-tier empty/full/profit prices. Prices come from live per-city data.
 *
 * Modals are portalled to <body> so they are never clipped by a transformed/overflow-hidden
 * filter container.
 */
export function JournalControls({ enabled, owned, onToggleEnabled, onToggleOwned, data, city, onlyProfession, showOwnership = true }: JournalControlsProps) {
  const [showSettings, setShowSettings] = useState(false);
  const { t } = useI18n();

  // Single-item views pass onlyProfession to show just that item's journal. `undefined` = show all.
  const shownProfessions =
    onlyProfession === undefined ? PROFESSION_ORDER : onlyProfession ? [onlyProfession] : [];

  const settingsModal = (
    <div className="jrnl-overlay" onClick={() => setShowSettings(false)}>
      <div className="jrnl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="jrnl-modal-close" aria-label={t("common.close")} onClick={() => setShowSettings(false)}>
          ×
        </button>
        <h3>{showOwnership ? t("journal.whichFill") : t("journal.prices")}</h3>
        <details className="jrnl-explain">
          <summary>{t("journal.howItWorks")}</summary>
          <p className="jrnl-note">
            {t(showOwnership ? "journal.explanationOwnership" : "journal.explanationPrices", { city: city || t("common.craftCity") })}
          </p>
          <ul className="jrnl-formula">
            <li>{t("journal.formulaFame")}</li>
            <li>{t("journal.formulaFilled")}</li>
            <li>{t("journal.formulaProfit")}</li>
            <li>{t("journal.formulaAdded")}</li>
          </ul>
        </details>
        {shownProfessions.length === 0 ? (
          <p className="jrnl-note">{t("journal.noJournal")}</p>
        ) : null}
        <ul className="jrnl-prof-list">
          {shownProfessions.map((profession) => {
            const rows = data ? journalPriceTable(data, profession, city ?? "") : [];
            const hasPrices = rows.some((r) => r.profit > 0);
            return (
              <li key={profession}>
                <div className="jrnl-prof-head">
                  <img
                    className="jrnl-prof-icon"
                    src={journalIcon(profession)}
                    alt=""
                    loading="lazy"
                    onError={onItemIconError}
                  />
                  <div className="jrnl-prof-labels">
                    {showOwnership ? (
                      <label className="jrnl-toggle">
                        <input
                          type="checkbox"
                          checked={owned[profession]}
                          onChange={() => onToggleOwned(profession)}
                        />
                        <span>{JOURNAL_PROFESSIONS[profession].journalName}</span>
                      </label>
                    ) : (
                      <strong className="jrnl-prof-name">{JOURNAL_PROFESSIONS[profession].journalName}</strong>
                    )}
                    <span className="jrnl-prof-sub">{JOURNAL_PROFESSIONS[profession].label}</span>
                  </div>
                </div>
                {(showOwnership ? owned[profession] : true) && hasPrices ? (
                  <table className="jrnl-price-table">
                    <thead>
                      <tr><th>{t("journal.tier")}</th><th>{t("journal.empty")}</th><th>{t("journal.full")}</th><th>{t("common.profit")}</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.tier}>
                          <td>T{r.tier}</td>
                          <td>{fmt(r.empty)}</td>
                          <td>{fmt(r.full)}</td>
                          <td className={r.profit > 0 ? "jrnl-pos" : ""}>{fmt(r.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="jrnl-control">
      <label className="jrnl-toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
        <span>{t("journal.profit")}</span>
      </label>
      <button
        type="button"
        className="jrnl-edit-btn"
        disabled={!enabled}
        aria-label={t("journal.editPrices")}
        title={t("journal.editPrices")}
        onClick={() => setShowSettings(true)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
        </svg>
        <span>{t("journal.journals")}</span>
      </button>

      {showSettings ? createPortal(settingsModal, document.body) : null}
    </div>
  );
}
