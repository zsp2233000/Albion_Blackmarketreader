import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/i18n";
import "./mobileNavBurger.css";

const TOOLS: ReadonlyArray<{ to: string; labelKey: MessageKey }> = [
  { to: "/", labelKey: "nav.home" },
  { to: "/dashboard", labelKey: "nav.dashboard" },
  { to: "/bm-crafter", labelKey: "nav.bmCrafter" },
  { to: "/crafting-calculator", labelKey: "nav.craftingCalculator" },
  { to: "/refining-calculator", labelKey: "nav.refiningCalculator" },
  { to: "/food-potion-crafter", labelKey: "nav.foodPotionCrafter" },
];

/**
 * Phone-only burger menu (top-left) that opens a drawer to switch between tools. Hidden on desktop
 * (the inline nav is shown there instead). Portalled to <body> so no ancestor can clip it.
 * `accent` tints the button + active item to the current tool's colour.
 */
export function MobileNavBurger({ accent }: { accent?: string }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useI18n();
  const accentVar = accent ? ({ ["--tool-accent"]: accent } as CSSProperties) : undefined;

  return (
    <>
      <button type="button" className="mnav-burger" aria-label={t("nav.openMenu")} style={accentVar} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open
        ? createPortal(
            <div className="mnav-overlay" style={accentVar} onClick={() => setOpen(false)}>
              <nav className="mnav-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="mnav-head">
                  <span>{t("nav.tools")}</span>
                  <button type="button" className="mnav-close" aria-label={t("nav.close")} onClick={() => setOpen(false)}>
                    ×
                  </button>
                </div>
                {TOOLS.map((tool) => (
                  <Link
                    key={tool.to}
                    to={tool.to}
                    className={`mnav-item ${pathname === tool.to ? "active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {t(tool.labelKey)}
                  </Link>
                ))}
              </nav>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
