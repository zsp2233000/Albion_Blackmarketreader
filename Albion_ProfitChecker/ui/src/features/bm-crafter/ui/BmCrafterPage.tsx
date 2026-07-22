import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { assetUrl, onItemIconError } from "@shared/assets/assets";
import { formatUpdated } from "@shared/time/lastUpdated";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { isGuest, buildGuestProfile, exitGuest } from "@shared/auth/guestMode";
import { isCrawler } from "@shared/auth/crawler";
import { RegionService } from "@shared/region/regionService";
import { useSeo } from "../../../shared/seo/useSeo";
import { SeoHeading } from "../../../shared/seo/SeoHeading";
import { JournalControls, MobileNavBurger, RegionSelect, ResponsiveFilters, normalizeRegion, useI18n, useJournals, GuestSignInLink, exitGuestToLogin } from "../../../shared";
import {
  buildArtefactId,
  buildMaterialId,
  normalizeItemId,
  parseEnchant,
  parseTier,
  type MarketRegion
} from "../domain";
import { useBmCrafterData, useBmCrafterState } from "../hooks";
import "./bmCrafter.css";

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString("de-DE");
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function formatObservedAt(value: string | null | undefined): string {
  const stamp = formatUpdated(value);
  if (!value || !stamp.relative) return "API snapshot";
  return `${stamp.time} · ${stamp.relative}`;
}

function useRegion(): [MarketRegion, (next: MarketRegion) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<MarketRegion>(service.getRegion());

  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);

  const setNext = useCallback((next: MarketRegion) => service.setRegion(next), [service]);
  return [region, setNext];
}

function tierLabel(itemId: string): string {
  const tier = parseTier(itemId);
  const enchant = parseEnchant(itemId);
  if (!tier) return "--";
  return `T${tier}.${enchant}`;
}

type UserState = {
  id: string;
  email: string | null;
  avatar: string;
  region: MarketRegion | null;
};

const allowedAvatars = [
  "/picture/accountsymbol.png",
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png"
];

declare global {
  interface Window {
    env?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }
}

function sanitizeAvatarUrl(value?: string | null): string {
  const fallback = "/picture/accountsymbol.png";
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return fallback;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") return url.href;
  } catch {
    if (trimmed.startsWith("//")) return fallback;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return fallback;
}

function readStoredRegion(): MarketRegion | null {
  return normalizeRegion(localStorage.getItem("region"));
}

export function BmCrafterPage() {
  const INITIAL_ROWS = 40;
  const ROWS_STEP = 40;

  const [region, setRegion] = useRegion();
  const { locale, t } = useI18n();
  const { data, loading, error } = useBmCrafterData(region);
  const journals = useJournals(region);
  // BM Crafter lists every item type, so all four journals always apply — ownership is not a
  // per-profession choice here (unlike the single-item Crafting Calculator).
  const journalConfig = useMemo(
    () => ({
      enabled: journals.enabled,
      owned: { warrior: true, hunter: true, mage: true, toolmaker: true } as const,
      data: journals.data
    }),
    [journals.enabled, journals.data]
  );
  const { rows, selectedRow, selectedRowKey, setSelectedRowKey, filters } = useBmCrafterState(data, journalConfig, locale);
  const navigate = useNavigate();

  // Open the clicked item in the Crafting Calculator, pre-set to sell to the Black Market
  // and craft in the city selected here.
  const openInCraftingCalculator = useCallback((itemId: string) => {
    const tier = parseTier(itemId);
    const enchant = parseEnchant(itemId);
    const base = normalizeItemId(itemId);
    const params = new URLSearchParams({
      item: base,
      tier: String(tier ?? 4),
      enchant: String(enchant),
      sell: "bm",
      craftCity: filters.craftCity,
      // Carry the region so the Crafting Calculator loads the same Black Market prices we showed.
      region
    });
    navigate(`/crafting-calculator?${params.toString()}`);
  }, [navigate, filters.craftCity, region]);

  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const [showRegionConfirm, setShowRegionConfirm] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<MarketRegion | null>(null);
  const [visibleRows, setVisibleRows] = useState(INITIAL_ROWS);
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);

  useSeo({
    title: "Albion Online Black Market Crafter | Blackmarket Reader",
    description:
      "Albion Online Black Market Crafter with material costs, artefact prices, Black Market values, and profit views for profitable crafting routes.",
    keywords:
      "Albion Online Black Market Crafter, Albion crafting profit calculator, Albion black market tool, Albion Online crafting tool",
    canonical: "https://blackmarketreader.com/bm-crafter",
    ogTitle: "Albion Online Black Market Crafter | Blackmarket Reader",
    ogDescription:
      "Compare material costs, artefact prices, and Black Market values in the Albion Online Black Market Crafter.",
    ogUrl: "https://blackmarketreader.com/bm-crafter",
    ogImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    twitterTitle: "Albion Online Black Market Crafter | Blackmarket Reader",
    twitterDescription:
      "Compare material costs, artefact prices, and Black Market values in the Albion Online Black Market Crafter.",
    twitterImage: "https://blackmarketreader.com/picture/bm-crafter-table.png",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Black Market Crafter",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://blackmarketreader.com/bm-crafter",
      description:
        "Albion Online Black Market crafting calculator with live market inputs, material cost breakdowns, and profit analysis.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      }
    }
  });

  useEffect(() => {
    document.body.classList.add("bm-crafter");
    document.body.classList.remove("landing-body");
    document.body.classList.remove("dashboard-body");
    return () => {
      document.body.classList.remove("bm-crafter");
    };
  }, []);

  useEffect(() => {
    const cfg = window.env;
    if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) return;
    setAuthService(createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY }));
  }, []);

  useEffect(() => {
    if (!authService) return;
    let cancelled = false;
    (async () => {
      const session = await authService.getSession().catch(() => null);
      if (cancelled) return;
      if (!session) {
        if (isGuest() || isCrawler()) {
          // Crawlers get the public read-only (guest) view instead of a /login
          // redirect, so search engines can index the tool page content.
          const guest = buildGuestProfile();
          const guestRegion: MarketRegion = readStoredRegion() || guest.region || "eu";
          setUser({
            id: guest.id,
            email: guest.email,
            avatar: sanitizeAvatarUrl(guest.avatar || localStorage.getItem("avatar")),
            region: guestRegion
          });
          setRegion(guestRegion);
          return;
        }
        const next = encodeURIComponent(window.location.pathname || "/bm-crafter");
        window.location.href = `/login?next=${next}`;
        return;
      }
      exitGuest(); // real session supersedes any stale guest flag (prevents guest UI while logged in)
      const profile = await authService.getUserProfile().catch(() => {
        const user = session.user;
        if (!user) return null;
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const regionRaw = String(meta.region || "").toLowerCase();
        const region = normalizeRegion(regionRaw);
        return {
          id: user.id,
          email: user.email || null,
          emailConfirmed: Boolean(user.email_confirmed_at),
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          region
        };
      });
      if (cancelled) return;
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname || "/bm-crafter");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const safeRegion: MarketRegion = readStoredRegion() || profile.region || "eu";
      setUser({
        id: profile.id,
        email: profile.email,
        avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")),
        region: safeRegion
      });
      setRegion(safeRegion);
      if (safeRegion !== profile.region) {
        await authService.updateUserMetadata({ region: safeRegion }).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authService]);

  useEffect(() => {
    if (showAccount) {
      document.body.classList.add("panel-open");
    } else {
      document.body.classList.remove("panel-open");
    }
    return () => {
      document.body.classList.remove("panel-open");
    };
  }, [showAccount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccount(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!showAccount) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (accountPanelRef.current?.contains(target)) return;
      if (accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [showAccount]);

  useEffect(() => {
    const applyAvatar = (raw: string) => {
      const safe = sanitizeAvatarUrl(raw);
      localStorage.setItem("avatar", safe);
      setUser((prev) => (prev ? { ...prev, avatar: safe } : prev));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== "avatar" || !event.newValue) return;
      applyAvatar(event.newValue);
    };

    if ("BroadcastChannel" in window) {
      profileChannelRef.current = new BroadcastChannel("rk-profile-sync");
      profileChannelRef.current.onmessage = (event: MessageEvent<{ type?: string; value?: string }>) => {
        if (event.data?.type !== "avatar" || !event.data.value) return;
        applyAvatar(event.data.value);
      };
    }

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      profileChannelRef.current?.close();
      profileChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    setVisibleRows(INITIAL_ROWS);
  }, [rows.length, region, filters.selectedTiers, filters.selectedEnchants, filters.minSold, filters.searchTerm, filters.sortByDailyTop, filters.showOnlyProfitable, filters.sourceFilter]);

  const latestLocalObservedAt = useMemo(() => {
    const values = data?.market.items
      .filter((item) => item.source === "local" && item.observedAt)
      .map((item) => item.observedAt as string) ?? [];
    return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  }, [data]);
  const lastUpdated = useMemo(
    () => formatUpdated(latestLocalObservedAt ?? data?.market.generatedAt ?? data?.materials.generatedAt ?? null),
    [data, latestLocalObservedAt]
  );
  const hasLocalMarketData = Boolean(data?.market.items.some((item) => item.source === "local"));

  const soldMax = 200;
  const soldRatio = Math.max(0, Math.min(1, filters.minSold / soldMax));

  const materialBreakdown = useMemo(() => {
    if (!selectedRow || !data) return [];
    const tier = parseTier(selectedRow.item.id);
    const enchant = parseEnchant(selectedRow.item.id);
    if (!tier) return [];

    return selectedRow.recipe.materials.map((mat) => {
      const key = buildMaterialId(mat.itemId, tier, enchant);
      const unit = key ? (data.materials.byItemId.get(key) ?? null) : null;
      return {
        itemId: mat.itemId,
        qty: mat.qty,
        unit,
        total: typeof unit === "number" ? unit * mat.qty : null
      };
    });
  }, [selectedRow, data]);

  const artefactCost = useMemo(() => {
    if (!selectedRow || !data || !selectedRow.recipe.artifactId) return null;
    const tier = parseTier(selectedRow.item.id);
    if (!tier) return null;
    const key = buildArtefactId(selectedRow.recipe.artifactId, tier);
    if (!key) return null;
    return data.artefacts.byItemId.get(key) ?? null;
  }, [selectedRow, data]);

  async function onLogout() {
    if (isGuest()) {
      exitGuestToLogin();
      return;
    }
    if (!authService) return;
    await authService.signOut().catch(() => undefined);
    setUser(null);
    setShowAccount(false);
    window.location.href = "/login?next=%2Fbm-crafter";
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error: resetError } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=%2Fbm-crafter`
    });
    if (resetError) {
      setAccountActionMsg(resetError.message || "Password reset failed.");
      return;
    }
    setAccountActionMsg("Email sent");
    window.setTimeout(() => setAccountActionMsg(""), 3000);
  }

  async function onAvatarChange(next: string) {
    if (!authService || !user) return;
    const avatar = sanitizeAvatarUrl(next);
    await authService.updateUserMetadata({ avatar }).catch(() => undefined);
    localStorage.setItem("avatar", avatar);
    profileChannelRef.current?.postMessage({ type: "avatar", value: avatar });
    setUser({ ...user, avatar });
  }

  async function onRegionSave(next: MarketRegion) {
    setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (!authService) return;
    await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  function onTableScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (!nearBottom) return;
    setVisibleRows((current) => Math.min(rows.length, current + ROWS_STEP));
  }

  async function confirmRegionSwitch() {
    setShowRegionConfirm(false);
    const next = pendingRegion ?? region;
    setPendingRegion(null);
    await onRegionSave(next);
  }

  return (
    <>
      <SeoHeading title="Albion Online Black Market Crafter">
        Find the most profitable items to craft and sell to the Albion Online Black Market — with material and artefact costs, return rate, station fees, focus, and daily profit potential.
      </SeoHeading>
      <div className={`modal-overlay ${showRegionConfirm ? "open" : ""}`} aria-hidden={showRegionConfirm ? "false" : "true"}>
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="regionConfirmTitle">
          <h3 id="regionConfirmTitle">{t("message.switchRegion")}</h3>
          <p>{t("message.confirmRegion")}</p>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={() => { setShowRegionConfirm(false); setPendingRegion(null); }}>
              {t("common.cancel")}
            </button>
            <button type="button" className="modal-btn primary" onClick={confirmRegionSwitch}>
              {t("common.switch")}
            </button>
          </div>
        </div>
      </div>

      <header className="bm-header">
        <MobileNavBurger accent="#2dd4bf" />
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true">
                <img src={assetUrl("picture/testo ohne background.png")} alt="" />
              </div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <div className="bm-nav bm-nav-switch">
              <Link className="nav-tab" to="/">{t("nav.home")}</Link>
              <Link className="nav-tab" to="/dashboard">{t("nav.dashboard")}</Link>
              <Link className="nav-tab active" to="/bm-crafter">{t("nav.bmCrafter")}</Link>
              <a className="nav-tab" href="/crafting-calculator">{t("nav.craftingCalculator")}</a>
              <a className="nav-tab" href="/refining-calculator">{t("nav.refiningCalculator")}</a>
              <a className="nav-tab" href="/food-potion-crafter">{t("nav.foodPotionCrafter")}</a>
            </div>
          </div>
          <div className="bm-meta">
            <RegionSelect value={region} onChange={(next) => { setPendingRegion(next); setShowRegionConfirm(true); }} className="bm-pill" />
            <div className="bm-status" title={lastUpdated.title}>
              <span className="pulse"></span>
              <span>{hasLocalMarketData ? "Local" : "API"}</span> · {t("common.lastUpdated")}: <span>{lastUpdated.time}</span>{lastUpdated.relative ? <span className="bm-status-ago"> ({lastUpdated.relative})</span> : null}
            </div>
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount(true)} aria-label={t("common.account")}>
                <img src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="avatar" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        ref={accountPanelRef}
        id="accountPanel"
        className={`account-panel ${showAccount ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="account-header">
          <div className="avatar-ring">
            <img id="profileAvatar" className="avatar-big" src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt={t("common.avatar")} />
            <span className="status-dot" aria-hidden="true"></span>
          </div>
          <div className="user-info">
            {isGuest() ? (
              <GuestSignInLink />
            ) : (
              <>
                <span className="email">{user?.email || "-"}</span>
                <span className="status">{t("auth.loggedIn")}</span>
                <div className="badge-row">
                  <span className="badge-chip">{t("auth.active")}</span>
                  <span className="badge-chip muted">{t("auth.secure")}</span>
                </div>
              </>
            )}
          </div>
          <button className="close-btn" aria-label={t("common.close")} onClick={() => setShowAccount(false)}>X</button>
        </div>

        <div className="panel-section">
          <h4>{t("auth.selectAvatar")}</h4>
          <div className="avatar-grid">
            {allowedAvatars.filter((src) => !src.includes("accountsymbol")).map((src) => (
              <img
                key={src}
                src={assetUrl(src.replace(/^\//, ""))}
                data-avatar={src}
                alt=""
                onClick={() => onAvatarChange(src)}
              />
            ))}
          </div>
        </div>

        <div className="panel-section">
          <h4>{t("auth.dataRegion")}</h4>
          <RegionSelect value={region} onChange={(next) => void onRegionSave(next)} />
        </div>

        <div className="account-actions">
          {!isGuest() && (
            <button className="btn primary" onClick={onResetPassword}>
              {accountActionMsg === "Email sent" ? t("auth.emailSent") : t("auth.changePassword")}
            </button>
          )}
          <button className="btn danger" onClick={onLogout}>{isGuest() ? t("auth.exitGuest") : t("auth.logout")}</button>
        </div>

        <div className="account-help">
          <span>{t("auth.needHelp")}</span>
          <a href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">{t("auth.joinDiscord")}</a>
          <a href="mailto:blackmarketreader@gmail.com">blackmarketreader@gmail.com</a>
        </div>
      </div>

      <ResponsiveFilters accent="#2dd4bf">
      <section className="bm-filters">
        <div className="filter-block">
          <p>Item Tiers</p>
          <div className="chip-row">
            {[4, 5, 6, 7, 8].map((tier) => (
              <button
                key={tier}
                className={`chip ${filters.selectedTiers.includes(tier) ? "active" : ""}`}
                type="button"
                onClick={() => filters.toggleTier(tier)}
              >
                T{tier}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-block">
          <p>Data Source</p>
          <div className="bm-city-field">
            <span className="material-symbols-outlined">sync_alt</span>
            <select value={filters.sourceFilter} onChange={(e) => filters.setSourceFilter(e.target.value as "all" | "local" | "api")}>
              <option value="all">All sources</option>
              <option value="local">Local capture</option>
              <option value="api">API snapshot</option>
            </select>
          </div>
        </div>

          <div className="filter-block">
          <p>{t("common.enchantment")}</p>
          <div className="chip-toggle">
            {[0, 1, 2, 3].map((enchant) => (
              <button
                key={enchant}
                className={`chip ${filters.selectedEnchants.includes(enchant) ? "active" : ""}`}
                type="button"
                onClick={() => filters.toggleEnchant(enchant)}
              >
                .{enchant}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-block">
          <div className="filter-head">
            <p>{t("filter.minSold")}</p>
            <span className="filter-value">{filters.minSold}+</span>
          </div>
          <div className="slider">
            <div className="slider-track">
              <div className="slider-fill" style={{ width: `${soldRatio * 100}%` }}></div>
              <div className="slider-thumb" style={{ left: `${soldRatio * 100}%` }}></div>
            </div>
            <input
              type="range"
              min="0"
              max={soldMax}
              value={filters.minSold}
              step="1"
              onChange={(e) => filters.setMinSold(Number(e.target.value || 0))}
            />
          </div>
        </div>

        <div className="filter-block">
          <div className="filter-head">
            <p>{t("filter.topDailyProfit")}</p>
            <span className="filter-value">{filters.sortByDailyTop ? t("filter.on") : t("filter.off")}</span>
          </div>
          <label className="daily-top-toggle">
            <input
              type="checkbox"
              checked={filters.sortByDailyTop}
              onChange={(e) => filters.setSortByDailyTop(e.target.checked)}
            />
            <span>{t("filter.sortHighestDaily")}</span>
          </label>
        </div>

        <div className="filter-block">
          <div className="filter-head">
            <p>{t("filter.nonArtefactOnly")}</p>
            <span className="filter-value">{filters.nonArtefactOnly ? t("filter.on") : t("filter.off")}</span>
          </div>
          <label className="daily-top-toggle">
            <input
              type="checkbox"
              checked={filters.nonArtefactOnly}
              onChange={(e) => filters.setNonArtefactOnly(e.target.checked)}
            />
            <span>{t("filter.hideArtefactItems")}</span>
          </label>
        </div>

        <div className="filter-block">
          <div className="filter-head">
            <p>{t("filter.journalProfit")}</p>
            <span className="filter-value">{journals.enabled ? t("filter.on") : t("filter.off")}</span>
          </div>
          <JournalControls
            enabled={journals.enabled}
            owned={journals.owned}
            onToggleEnabled={journals.setEnabled}
            onToggleOwned={journals.toggleOwned}
            data={journals.data}
            city={filters.craftCity}
            showOwnership={false}
          />
        </div>

        <div className="filter-block">
          <div className="filter-head">
            <p>{t("common.returnRate")}</p>
            <span className="filter-value">{filters.returnRatePercent.toFixed(2)}%</span>
          </div>
          <div className="return-rate">
            <input
              type="number"
              min={15.25}
              max={60}
              step={0.25}
              value={filters.returnRatePercent}
              onChange={(e) => filters.setReturnRatePercent(Number(e.target.value || 15.25))}
            />
            <span className="suffix">%</span>
            <label className="bonus-toggle">
              <input
                type="checkbox"
                checked={filters.bonusCity}
                onChange={(e) => filters.setBonusCityPreset(e.target.checked)}
              />
              <span>{t("common.bonusCity")}</span>
            </label>
          </div>
        </div>

        <div className="filter-block">
          <p>{t("filter.searchItem")}</p>
          <div className="search-field">
            <input
              type="search"
              placeholder={t("filter.typeItemName")}
              value={filters.searchTerm}
              onChange={(e) => filters.setSearchTerm(e.target.value)}
            />
            <span className="material-symbols-outlined">search</span>
          </div>
        </div>

        <div className="filter-block">
          <p>{t("common.craftCity")}</p>
          <div className="bm-city-field">
            <span className="material-symbols-outlined">location_city</span>
            <select
              value={filters.craftCity}
              onChange={(e) => filters.setCraftCity(e.target.value)}
            >
              <option value="Caerleon">Caerleon</option>
              <option value="Lymhurst">Lymhurst</option>
              <option value="Bridgewatch">Bridgewatch</option>
              <option value="Martlock">Martlock</option>
              <option value="Fort Sterling">Fort Sterling</option>
              <option value="Thetford">Thetford</option>
              <option value="Brecilien">Brecilien</option>
            </select>
          </div>
        </div>

        <div className="filter-block">
          <div className="filter-head">
            <p>{t("filter.usageFee")}</p>
            <span className="filter-value">{filters.usageFeePer100}</span>
          </div>
          <div className="bm-fee-field">
            <span className="material-symbols-outlined">construction</span>
            <input
              type="number"
              min={0}
              step={50}
              value={filters.usageFeePer100}
              onChange={(e) => filters.setUsageFeePer100(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
      </section>
      </ResponsiveFilters>

      <main className="bm-main">
        <section className="bm-table">
          <div className="table-wrap custom-scrollbar" onScroll={onTableScroll}>
            <table>
              <thead>
                <tr>
                  <th>{t("common.item")}</th>
                  <th className="num">{t("common.bmPrice")}</th>
                  <th className="num">{t("common.craftCost")}</th>
                  <th className="num">{t("common.netProfit")}</th>
                  <th className="center">{t("common.soldPerDay")}</th>
                  <th className="num">{t("common.dailyPotential")}</th>
                  <th className="num">{t("common.profitPercent")}</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length && !loading ? (
                  <tr className="empty-row">
                    <td colSpan={7}>{error || t("common.noData")}</td>
                  </tr>
                ) : null}
                {rows.slice(0, visibleRows).map((row, idx) => {
                  const tier = parseTier(row.item.id);
                  const enchant = parseEnchant(row.item.id);
                  const baseId = normalizeItemId(row.item.id);
                  const suspect = typeof row.item.bm === "number" && row.economics.craftCost > 0 && row.item.bm >= 10 * row.economics.craftCost;
                  return (
                    <tr
                      key={row.rowKey}
                      className={`high-density-row bm-clickable-row ${idx % 2 === 1 ? "alt" : ""} ${suspect ? "bm-suspect-row" : ""}`}
                      title="Click: open in Crafting Calculator · Right-click: show craft details here"
                      onClick={() => { setSelectedRowKey(row.rowKey); openInCraftingCalculator(row.item.id); }}
                      onContextMenu={(e) => { e.preventDefault(); setSelectedRowKey(row.rowKey); }}
                    >
                      <td>
                        <div className="item">
                          <div className="item-info">
                            <div className="item-icon">
                              <img
                                src={`/itemicons/T4_${baseId}.png`}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onError={onItemIconError}
                              />
                            </div>
                            <div>
                              <div className="item-name">{row.displayName}<span className="bm-open-calc-icon" aria-hidden="true">↗</span></div>
                              {suspect ? <div className="bm-suspect-note">This profit looks unrealistic — market price probably not real</div> : null}
                              <div className="item-meta">{baseId} · {row.item.source === "local" ? "Local" : "API"} · {formatObservedAt(row.item.observedAt)}</div>
                            </div>
                          </div>
                          <span className="item-tier-pill" data-tier={tier ?? undefined} data-enchant={enchant}>
                            {tierLabel(row.item.id)}
                          </span>
                        </div>
                      </td>
                      <td className="num">{formatNumber(row.item.bm)}</td>
                      <td className="num muted">{formatNumber(row.economics.craftCost)}</td>
                      <td className={`num ${row.economics.profit >= 0 ? "profit" : "loss"}`}>
                        {formatNumber(row.economics.profit)}
                      </td>
                      <td className="center">{formatNumber(row.item.sold)}</td>
                      <td className={`num ${(row.economics.dailyPotential ?? 0) >= 0 ? "profit" : "loss"}`}>
                        {formatNumber(row.economics.dailyPotential)}
                      </td>
                      <td className={`num ${(row.economics.profitPct ?? 0) >= 0 ? "profit" : "loss"}`}>
                        {formatPct(row.economics.profitPct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <p>{t("message.showingItems", { shown: Math.min(visibleRows, rows.length), total: rows.length })}</p>
            {loading ? <p>{t("common.loading")}</p> : null}
          </div>
        </section>

        <aside className="bm-side">
          <div className="side-card teal-glow custom-scrollbar">
            <div className="side-header">
              <h3>{t("panel.crafterInsight")}</h3>
              <span className="material-symbols-outlined">info</span>
            </div>
            <div className="side-hero teal-gradient-bg" data-tier={selectedRow?.tier ?? undefined}>
              <div className="side-icon" data-enchant={selectedRow?.enchant ? selectedRow.enchant : undefined}>
                <div className="side-icon-inner">
                  <img
                    src={selectedRow ? `/itemicons/T4_${normalizeItemId(selectedRow.item.id)}.png` : ""}
                    alt=""
                    onError={onItemIconError}
                  />
                </div>
              </div>
              <h2>{selectedRow?.displayName || t("message.selectItem")}</h2>
              <div className="side-tags">
                <span className="tag" id="insightTier">{selectedRow ? tierLabel(selectedRow.item.id) : "Tier --"}</span>
              </div>
            </div>
            <div className="side-metrics">
              <div><span>{t("common.bmPrice")}</span><strong className="profit">{selectedRow ? formatNumber(selectedRow.item.bm) : "--"}</strong></div>
              <div><span>{t("common.soldPerDay")}</span><strong className="primary">{selectedRow ? formatNumber(selectedRow.item.sold) : "--"}</strong></div>
              <div><span>{t("common.craftCost")}</span><strong>{selectedRow ? formatNumber(selectedRow.economics.craftCost) : "--"}</strong></div>
              <div><span>{t("common.stationFee")}</span><strong>{selectedRow ? formatNumber(selectedRow.economics.stationFee) : "--"}</strong></div>
              {selectedRow && (selectedRow.journalProfit ?? 0) > 0 ? (
                <div><span>{t("common.journalProfit")}</span><strong className="profit">+{formatNumber(selectedRow.journalProfit)}</strong></div>
              ) : null}
              <div><span>{t("common.netProfit")}</span><strong className={selectedRow && selectedRow.economics.profit < 0 ? "loss" : "profit"}>{selectedRow ? formatNumber(selectedRow.economics.profit) : "--"}</strong></div>
              <div><span>{t("common.profitPercent")}</span><strong className={selectedRow && (selectedRow.economics.profitPct ?? 0) < 0 ? "loss" : "profit"}>{selectedRow ? formatPct(selectedRow.economics.profitPct) : "--"}</strong></div>
              <div><span>{t("common.dailyPotential")}</span><strong className={selectedRow && (selectedRow.economics.dailyPotential ?? 0) < 0 ? "loss" : "profit"}>{selectedRow ? formatNumber(selectedRow.economics.dailyPotential) : "--"}</strong></div>
              <div><span>{t("common.profitPerFocus")}</span><strong className={selectedRow && (selectedRow.economics.profitPerFocus ?? 0) < 0 ? "loss" : "profit"}>{selectedRow ? formatNumber(selectedRow.economics.profitPerFocus) : "--"}</strong></div>
              <div><span>{t("common.itemId")}</span><strong>{selectedRow?.item.id || "--"}</strong></div>
            </div>
            <div className="material-box">
              <div className="material-head">
                <span>{t("common.materialPrices")}</span>
                <span className="material-total">{t("common.total")}: {selectedRow ? formatNumber(selectedRow.economics.craftCost) : "--"}</span>
              </div>
              <div className="material-list">
                {materialBreakdown.map((mat) => (
                  <div key={`${mat.itemId}-total`} className="material-row">
                    <div className="material-name">{mat.itemId}</div>
                    <div className="material-meta">
                      <span className="material-qty">x{mat.qty}</span>
                      <span className="material-price">{formatNumber(mat.total)}</span>
                    </div>
                  </div>
                ))}
                {materialBreakdown.map((mat) => (
                  <div key={`${mat.itemId}-unit`} className="material-row material-unit-row">
                    <div className="material-name">{mat.itemId} · Unit</div>
                    <div className="material-meta">
                      <span className="material-qty">x1</span>
                      <span className="material-price">{formatNumber(mat.unit)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="material-row artefact-row" aria-hidden={selectedRow?.recipe.artifactId ? "false" : "true"}>
                <div className="material-name">{selectedRow?.recipe.artifactId || t("common.artefact")}</div>
                <div className="material-meta">
                  <span className="material-qty">x1</span>
                  <span className="material-price">{formatNumber(artefactCost)}</span>
                </div>
              </div>
            </div>
            <div className="side-chart">
              <div className="side-chart-head">
                <span className="material-symbols-outlined">trending_up</span>
                <span>{t("panel.monthlyAvgProfit")}</span>
              </div>
              <div className="chart-bars">
                <span style={{ height: "40%" }}></span>
                <span style={{ height: "60%" }}></span>
                <span style={{ height: "55%" }}></span>
                <span style={{ height: "75%" }}></span>
                <span style={{ height: "90%" }}></span>
                <span style={{ height: "85%" }}></span>
                <span className="strong" style={{ height: "100%" }}></span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </>
  );
}
