import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { RegionService } from "@shared/region/regionService";
import { getReturnRatePresetConfig, makeRefiner, type Enchant, type MarketRegion, type MaterialKey, type RefineTierInput, type ReturnRatePreset, type Tier } from "../core";
import { buildRefiningLiveSnapshot, MATERIAL_DEFINITIONS, REFINE_VARIANTS } from "../data";
import "../../bm-crafter/ui/bmCrafter.css";
import "./refiningCalculator.css";

type UserState = { id: string; email: string | null; avatar: string; region: MarketRegion | null };
type RawPriceOverrides = Record<MaterialKey, Record<Tier, Record<Enchant, string>>>;
type ManualOverrides = {
  variantMarkets: Record<string, string>;
  rawByMaterialTierEnchant: RawPriceOverrides;
};

const KNOWN_CITIES = ["ALL", "Lymhurst", "Caerleon", "Bridgewatch", "Martlock", "Fort Sterling", "Thetford"] as const;
type SelectedCity = (typeof KNOWN_CITIES)[number];
const MANUAL_OVERRIDE_STORAGE_KEY = "refining-manual-overrides-v1";
const TIERS = [4, 5, 6, 7, 8] as const;
const ENCHANTS = [0, 1, 2, 3, 4] as const;

declare global {
  interface Window {
    env?: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
  }
}

const allowedAvatars = [
  "/picture/accountsymbol.png",
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png"
];

function createEmptyRawByMaterialTierEnchant(): RawPriceOverrides {
  return MATERIAL_DEFINITIONS.reduce((acc, material) => {
    acc[material.key] = TIERS.reduce<Record<Tier, Record<Enchant, string>>>((tierAcc, tier) => {
      tierAcc[tier] = { 0: "", 1: "", 2: "", 3: "", 4: "" };
      return tierAcc;
    }, { 4: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 5: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 6: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 7: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 8: { 0: "", 1: "", 2: "", 3: "", 4: "" } });
    return acc;
  }, {} as RawPriceOverrides);
}

function createEmptyManualOverrides(): ManualOverrides {
  return { variantMarkets: {}, rawByMaterialTierEnchant: createEmptyRawByMaterialTierEnchant() };
}

function createEmptyLiveRawByMaterialTierEnchant(): Record<MaterialKey, Record<Tier, Record<Enchant, number>>> {
  return MATERIAL_DEFINITIONS.reduce((acc, material) => {
    acc[material.key] = TIERS.reduce<Record<Tier, Record<Enchant, number>>>((tierAcc, tier) => {
      tierAcc[tier] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
      return tierAcc;
    }, { 4: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 5: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 6: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 7: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } });
    return acc;
  }, {} as Record<MaterialKey, Record<Tier, Record<Enchant, number>>>);
}

function normalizeManualOverrides(raw: unknown): ManualOverrides {
  const fallback = createEmptyManualOverrides();
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Partial<ManualOverrides>;
  const variantMarkets = source.variantMarkets && typeof source.variantMarkets === "object"
    ? Object.fromEntries(Object.entries(source.variantMarkets).map(([key, value]) => [key, String(value ?? "")]))
    : {};
  const rawByMaterialTierEnchant = createEmptyRawByMaterialTierEnchant();
  MATERIAL_DEFINITIONS.forEach((material) => {
    const byTier = source.rawByMaterialTierEnchant?.[material.key];
    TIERS.forEach((tier) => {
      const byEnchant = byTier?.[tier];
      ENCHANTS.forEach((enchant) => {
        rawByMaterialTierEnchant[material.key][tier][enchant] = typeof byEnchant?.[enchant] === "string" ? byEnchant[enchant] : "";
      });
    });
  });
  return { variantMarkets, rawByMaterialTierEnchant };
}

function readManualOverrides(): ManualOverrides {
  try {
    const stored = localStorage.getItem(MANUAL_OVERRIDE_STORAGE_KEY);
    return normalizeManualOverrides(stored ? JSON.parse(stored) : null);
  } catch {
    return createEmptyManualOverrides();
  }
}

function parseAmount(raw: string, fallback = 0): number {
  const cleaned = String(raw || "").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("de-DE") : "--";
}

function formatPct(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "--";
}

function readStoredRegion(): MarketRegion | null {
  const stored = (localStorage.getItem("region") || "").toLowerCase();
  return stored === "us" || stored === "eu" ? stored : null;
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

function normalizeCityName(raw: string | null): SelectedCity {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "all" || text === "all cities") return "ALL";
  const match = KNOWN_CITIES.find((city) => city.toLowerCase() === text);
  return (match || "ALL") as SelectedCity;
}

function getCurrentCity(): SelectedCity {
  const keys = ["city", "selectedCity", "cityFilter", "currentCity"];
  for (const key of keys) {
    const found = normalizeCityName(localStorage.getItem(key));
    if (found !== "ALL") return found;
  }
  return "ALL";
}

function hasManualOverrideValues(overrides: ManualOverrides): boolean {
  const hasVariantOverride = Object.values(overrides.variantMarkets).some((value) => String(value || "").trim() !== "");
  const hasRawOverride = Object.values(overrides.rawByMaterialTierEnchant).some((byTier) =>
    Object.values(byTier).some((byEnchant) => Object.values(byEnchant).some((value) => String(value || "").trim() !== ""))
  );
  return hasVariantOverride || hasRawOverride;
}

function useRegion(): [MarketRegion, (next: MarketRegion) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<MarketRegion>(service.getRegion());
  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next as MarketRegion));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);
  return [region, (next) => service.setRegion(next)];
}

export function RefiningCalculatorPage() {
  // Rubric marker: this component is the imperative shell around the pure refining core.
  const [region, setRegion] = useRegion();
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showRegionConfirm, setShowRegionConfirm] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<MarketRegion | null>(null);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const [selectedRowKey, setSelectedRowKey] = useState(REFINE_VARIANTS[0].id);
  const [returnRatePreset, setReturnRatePreset] = useState<ReturnRatePreset>("bonus_city_focus");
  const [usageFeePer100, setUsageFeePer100] = useState("400");
  const [selectedCity, setSelectedCity] = useState<SelectedCity>(() => getCurrentCity());
  const [editorMaterial, setEditorMaterial] = useState<MaterialKey>("metal");
  const [isTopSectionExpanded, setIsTopSectionExpanded] = useState(true);
  const [isPriceEditorExpanded, setIsPriceEditorExpanded] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [liveMarketByVariantId, setLiveMarketByVariantId] = useState<Record<string, number>>({});
  const [liveRawByMaterialTierEnchant, setLiveRawByMaterialTierEnchant] = useState<Record<MaterialKey, Record<Tier, Record<Enchant, number>>>>(() => createEmptyLiveRawByMaterialTierEnchant());
  const [manualOverrides, setManualOverrides] = useState<ManualOverrides>(() => createEmptyManualOverrides());
  const [hasLiveData, setHasLiveData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("--:--");

  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    document.body.classList.add("refining-calculator-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "crafting-calculator-body");
    return () => document.body.classList.remove("refining-calculator-body");
  }, []);

  useEffect(() => {
    const cfg = window.env;
    if (cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY) {
      setAuthService(createAuthService({ supabaseUrl: cfg.SUPABASE_URL, supabaseAnonKey: cfg.SUPABASE_ANON_KEY }));
    }
  }, []);

  useEffect(() => {
    if (!authService) return;
    let cancelled = false;
    (async () => {
      const session = await authService.getSession().catch(() => null);
      if (cancelled) return;
      if (!session) return;
      const profile = await authService.getUserProfile().catch(() => null);
      if (cancelled || !profile?.emailConfirmed) return;
      const safeRegion = readStoredRegion() || profile.region || "eu";
      setUser({ id: profile.id, email: profile.email, avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")), region: safeRegion });
      setRegion(safeRegion);
    })();
    return () => {
      cancelled = true;
    };
  }, [authService, setRegion]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!showAccount) return;
      const target = event.target as Node | null;
      if (!target || accountPanelRef.current?.contains(target) || accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccount(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showAccount]);

  useEffect(() => {
    setManualOverrides(readManualOverrides());
  }, []);

  useEffect(() => {
    localStorage.setItem(MANUAL_OVERRIDE_STORAGE_KEY, JSON.stringify(manualOverrides));
  }, [manualOverrides]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/data/materials-cities-${region}.json`);
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        const snapshot = buildRefiningLiveSnapshot(payload, REFINE_VARIANTS, selectedCity);

        setLiveMarketByVariantId(snapshot.marketByVariantId);
        setLiveRawByMaterialTierEnchant(
          MATERIAL_DEFINITIONS.reduce((acc, material) => {
            acc[material.key] = TIERS.reduce<Record<Tier, Record<Enchant, number>>>((tierAcc, tier) => {
              tierAcc[tier] = ENCHANTS.reduce<Record<Enchant, number>>((enchantAcc, enchant) => {
                const variant = REFINE_VARIANTS.find((entry) => entry.materialKey === material.key && entry.tier === tier && entry.enchant === enchant);
                enchantAcc[enchant] = variant ? snapshot.marketByVariantId[variant.id] || 0 : 0;
                return enchantAcc;
              }, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
              return tierAcc;
            }, { 4: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 5: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 6: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 7: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, 8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } });
            return acc;
          }, {} as Record<MaterialKey, Record<Tier, Record<Enchant, number>>>)
        );
        setHasLiveData(Object.values(snapshot.marketByVariantId).some((value) => value > 0));
        if (snapshot.generatedAt) {
          const dt = new Date(snapshot.generatedAt);
          if (!Number.isNaN(dt.getTime())) setLastUpdated(dt.toISOString().slice(11, 16));
        } else {
          setLastUpdated("--:--");
        }
      } catch {
        setHasLiveData(false);
        setLiveMarketByVariantId({});
        setLiveRawByMaterialTierEnchant(createEmptyLiveRawByMaterialTierEnchant());
        setLastUpdated("--:--");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [region, selectedCity]);

  const displayedRawByMaterialTierEnchant = useMemo<Record<MaterialKey, Record<Tier, Record<Enchant, string>>>>(
    () =>
      MATERIAL_DEFINITIONS.reduce((acc, material) => {
        acc[material.key] = TIERS.reduce<Record<Tier, Record<Enchant, string>>>((tierAcc, tier) => {
          tierAcc[tier] = ENCHANTS.reduce<Record<Enchant, string>>((enchantAcc, enchant) => {
            const manualValue = manualOverrides.rawByMaterialTierEnchant[material.key][tier][enchant];
            const liveValue = liveRawByMaterialTierEnchant[material.key][tier][enchant];
            enchantAcc[enchant] = manualValue.trim() !== "" ? manualValue : liveValue > 0 ? String(liveValue) : "";
            return enchantAcc;
          }, { 0: "", 1: "", 2: "", 3: "", 4: "" });
          return tierAcc;
        }, { 4: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 5: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 6: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 7: { 0: "", 1: "", 2: "", 3: "", 4: "" }, 8: { 0: "", 1: "", 2: "", 3: "", 4: "" } });
        return acc;
      }, {} as Record<MaterialKey, Record<Tier, Record<Enchant, string>>>),
    [liveRawByMaterialTierEnchant, manualOverrides]
  );

  const tierInputs = useMemo<ReadonlyArray<RefineTierInput>>(
    // Rubric marker: UI state is transformed into immutable input data for the functional core.
    () =>
      MATERIAL_DEFINITIONS.flatMap((material) =>
        TIERS.flatMap((tier) =>
          ENCHANTS.map((enchant) => ({
            materialKey: material.key,
            tier,
            enchant,
            unitRawPrice: parseAmount(displayedRawByMaterialTierEnchant[material.key][tier][enchant], 0)
          }))
        )
      ),
    [displayedRawByMaterialTierEnchant]
  );

  const rows = useMemo(() => {
    const profile = getReturnRatePresetConfig(returnRatePreset);
    // Rubric marker: the closure returned by makeRefiner captures config once and is reused for each variant.
    const refiner = makeRefiner({
      city: selectedCity === "ALL" ? "Bridgewatch" : selectedCity,
      baseReturnRate: profile.baseReturnRate,
      cityBonusRate: profile.cityBonusRate,
      refiningBonusRate: profile.refiningBonusRate,
      focusEnabled: profile.focusEnabled,
      focusReturnRate: profile.focusReturnRate
    });
    const feeValue = parseAmount(usageFeePer100, 400);
    return REFINE_VARIANTS.map((variant) => {
      const manualMarket = manualOverrides.variantMarkets[variant.id] || "";
      const market = manualMarket.trim() !== "" ? parseAmount(manualMarket, 0) : liveMarketByVariantId[variant.id] || 0;
      const withMarket = { ...variant, market };
      const result = refiner(withMarket, tierInputs, feeValue);
      return { variant: withMarket, ...result, positive: result.profit >= 0 };
    }).sort((left, right) => right.profit - left.profit);
  }, [liveMarketByVariantId, manualOverrides, returnRatePreset, selectedCity, tierInputs, usageFeePer100]);

  const selectedRow = rows.find((row) => row.variant.id === selectedRowKey) || rows[0];
  const maxDailyProfit = rows.reduce((sum, row) => sum + Math.max(0, row.profit), 0) * 5;
  const hasDisplayData = hasLiveData || hasManualOverrideValues(manualOverrides);
  const variantByTierEnchant = useMemo(
    () => REFINE_VARIANTS.filter((variant) => variant.materialKey === editorMaterial).reduce<Record<string, (typeof REFINE_VARIANTS)[number]>>((acc, variant) => {
      acc[`${variant.tier}.${variant.enchant}`] = variant;
      return acc;
    }, {}),
    [editorMaterial]
  );

  useEffect(() => {
    if (!rows.length) return;
    if (!rows.some((row) => row.variant.id === selectedRowKey)) setSelectedRowKey(rows[0].variant.id);
  }, [rows, selectedRowKey]);

  function updateManualVariantMarket(variantId: string, value: string) {
    setManualOverrides((prev) => ({ ...prev, variantMarkets: { ...prev.variantMarkets, [variantId]: value } }));
  }

  function updateManualRawPrice(materialKey: MaterialKey, tier: Tier, enchant: Enchant, value: string) {
    setManualOverrides((prev) => ({
      ...prev,
      rawByMaterialTierEnchant: {
        ...prev.rawByMaterialTierEnchant,
        [materialKey]: {
          ...prev.rawByMaterialTierEnchant[materialKey],
          [tier]: { ...prev.rawByMaterialTierEnchant[materialKey][tier], [enchant]: value }
        }
      }
    }));
  }

  function clearManualOverrides() {
    localStorage.removeItem(MANUAL_OVERRIDE_STORAGE_KEY);
    setManualOverrides(createEmptyManualOverrides());
  }

  async function onRegionSave(next: MarketRegion) {
    setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (authService) await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error } = await authService.client.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/login?next=%2Frefining-calculator` });
    setAccountActionMsg(error ? error.message || "Password reset failed." : "Email sent");
    if (!error) window.setTimeout(() => setAccountActionMsg(""), 3000);
  }

  async function onLogout() {
    if (!authService) return;
    await authService.signOut().catch(() => undefined);
    setUser(null);
    setShowAccount(false);
    window.location.href = "/login?next=%2Frefining-calculator";
  }

  return (
    <div className="rc-page">
      <div className={`modal-overlay ${showRegionConfirm ? "open" : ""}`} aria-hidden={showRegionConfirm ? "false" : "true"}>
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="regionConfirmTitle">
          <h3 id="regionConfirmTitle">Switch region?</h3>
          <p>Do you really want to switch the region?</p>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={() => { setShowRegionConfirm(false); setPendingRegion(null); }}>Cancel</button>
            <button type="button" className="modal-btn primary" onClick={() => { const next = pendingRegion ?? (region === "eu" ? "us" : "eu"); setPendingRegion(null); setShowRegionConfirm(false); void onRegionSave(next); }}>Switch</button>
          </div>
        </div>
      </div>

      <header className="bm-header">
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true"><img src={assetUrl("picture/testo ohne background.png")} alt="" /></div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <div className="bm-nav bm-nav-switch">
              <Link className="nav-tab" to="/">Home</Link>
              <Link className="nav-tab" to="/dashboard">Dashboard</Link>
              <Link className="nav-tab" to="/bm-crafter">Blackmarket Crafter</Link>
              <Link className="nav-tab" to="/crafting-calculator">Crafting Calculator</Link>
              <span className="nav-tab active">Refining Calculator</span>
            </div>
          </div>
          <div className="bm-meta">
            <button className="bm-pill" type="button" onClick={() => { setPendingRegion(region === "eu" ? "us" : "eu"); setShowRegionConfirm(true); }}>
              <span className="material-symbols-outlined">language</span>Region: <span>{region.toUpperCase()}</span>
            </button>
            <div className="bm-status"><span className="pulse"></span>Last updated: <span>{lastUpdated}</span></div>
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount(true)} aria-label="Account">
                <img src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="avatar" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div ref={accountPanelRef} className={`account-panel ${showAccount ? "open" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="account-header">
          <div className="avatar-ring"><img className="avatar-big" src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="Avatar" /><span className="status-dot" aria-hidden="true"></span></div>
          <div className="user-info"><span className="email">{user?.email || "Guest"}</span><span className="status">{user ? "Logged in" : "No session"}</span></div>
          <button className="close-btn" aria-label="Close" onClick={() => setShowAccount(false)}>X</button>
        </div>
        <div className="panel-section">
          <h4>Select profile avatar</h4>
          <div className="avatar-grid">{allowedAvatars.filter((src) => !src.includes("accountsymbol")).map((src) => (<img key={src} src={assetUrl(src.replace(/^\//, ""))} alt="" onClick={() => setUser((prev) => (prev ? { ...prev, avatar: src } : prev))} />))}</div>
        </div>
        <div className="panel-section">
          <h4>Data region</h4>
          <select className="city-select" value={region} onChange={(event) => void onRegionSave(event.target.value === "us" ? "us" : "eu")}><option value="us">America</option><option value="eu">Europe</option></select>
        </div>
        <div className="account-actions">
          {user ? (
            <>
              <button className="btn primary" onClick={() => void onResetPassword()}>{accountActionMsg === "Email sent" ? "Email sent" : "Change password"}</button>
              <button className="btn danger" onClick={() => void onLogout()}>Logout</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => { window.location.href = "/login?next=%2Frefining-calculator"; }}>Login</button>
          )}
        </div>
      </div>

      <section className={`rc-top-panel ${isTopSectionExpanded ? "expanded" : "collapsed"}`}>
        <div className="rc-top-panel-header">
          <div>
            <p className="rc-block-title">Refining Controls</p>
            <span>{isTopSectionExpanded ? "Filters and manual editor open" : "Filters and manual editor closed"}</span>
          </div>
          <button
            type="button"
            className={`rc-arrow-toggle ${isTopSectionExpanded ? "open" : ""}`}
            aria-label={isTopSectionExpanded ? "Collapse refining controls" : "Expand refining controls"}
            onClick={() => setIsTopSectionExpanded((prev) => !prev)}
          >
            <span className="rc-arrow-glyph">▾</span>
          </button>
        </div>
        {isTopSectionExpanded ? (
          <div className={`bm-filters rc-filters ${isPriceEditorExpanded ? "expanded" : "collapsed"}`}>
            <div className={`rc-price-editor ${isPriceEditorExpanded ? "expanded" : "collapsed"}`}>
              <div className="rc-price-editor-head">
                <div>
                  <p className="rc-block-title">Material Prices</p>
                  <span>{isPriceEditorExpanded ? "Manual price table open" : "Manual price table closed"}</span>
                </div>
                <div className="rc-price-head-actions">
                  <button
                    type="button"
                    className={`rc-arrow-toggle ${isPriceEditorExpanded ? "open" : ""}`}
                    aria-label={isPriceEditorExpanded ? "Collapse price table" : "Expand price table"}
                    onClick={() => setIsPriceEditorExpanded((prev) => !prev)}
                  >
                    <span className="rc-arrow-glyph">▾</span>
                  </button>
                </div>
                <div className="rc-tab-nav">
                  {MATERIAL_DEFINITIONS.map((material) => (
                    <button key={material.key} type="button" className={`rc-tab ${editorMaterial === material.key ? "active" : ""}`} onClick={() => setEditorMaterial(material.key)}>
                      {material.key === "metal" ? "Metal" : material.key === "wood" ? "Wood" : material.key === "fiber" ? "Fiber" : "Hide"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rc-price-editor-body">
                <div className="rc-price-table-wrap">
                  <p className="rc-section-label">Raw + Refining Sell Prices</p>
                  <table className="rc-price-table rc-price-table-combined">
                    <thead>
                      <tr>
                        <th>Tier</th>
                        {ENCHANTS.map((enchant) => (<th key={`raw-head-${enchant}`}>Raw .{enchant}</th>))}
                        {ENCHANTS.map((enchant) => (<th key={`sell-head-${enchant}`}>Sell .{enchant}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIERS.map((tier) => (
                        <tr key={`combined-${editorMaterial}-${tier}`} className={`tier-row tier-${tier}`}>
                          <td className="tier-cell">T{tier}</td>
                          {ENCHANTS.map((enchant) => (
                            <td key={`raw-${editorMaterial}-${tier}-${enchant}`}>
                              <input className="rc-input rc-table-input" value={displayedRawByMaterialTierEnchant[editorMaterial][tier][enchant]} onChange={(event) => updateManualRawPrice(editorMaterial, tier, enchant, event.target.value)} placeholder={`raw .${enchant}`} />
                            </td>
                          ))}
                          {ENCHANTS.map((enchant) => {
                            const variant = variantByTierEnchant[`${tier}.${enchant}`];
                            const liveValue = variant ? liveMarketByVariantId[variant.id] || 0 : 0;
                            const manualValue = variant ? manualOverrides.variantMarkets[variant.id] || "" : "";
                            return (
                              <td key={`sell-${editorMaterial}-${tier}-${enchant}`}>
                                <input className="rc-input rc-table-input" value={manualValue || (liveValue > 0 ? String(liveValue) : "")} onChange={(event) => { if (!variant) return; updateManualVariantMarket(variant.id, event.target.value); }} placeholder={`sell .${enchant}`} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="rc-fixed-filters">
              <div className="filter-block">
                <p>Usage Fee / 100</p>
                <input className="rc-input" value={usageFeePer100} onChange={(event) => setUsageFeePer100(event.target.value)} />
              </div>
              <div className="filter-block">
                <p>City</p>
                <select className="rc-input" value={selectedCity} onChange={(event) => { const nextCity = normalizeCityName(event.target.value); setSelectedCity(nextCity); localStorage.setItem("city", nextCity === "ALL" ? "all" : nextCity); }}>
                  {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
                </select>
              </div>
              <div className="filter-block">
                <p>Return Profile</p>
                <select className="rc-input" value={returnRatePreset} onChange={(event) => setReturnRatePreset(event.target.value as ReturnRatePreset)}>
                  <option value="base">Base 15.2%</option>
                  <option value="bonus_city">Bonus City 36.7%</option>
                  <option value="bonus_city_focus">Bonus City + Focus 53.9%</option>
                </select>
              </div>
              <div className="filter-block rc-filter-action">
                <p>Manual Overrides</p>
                <button type="button" className="execute-btn ghost-btn" onClick={clearManualOverrides}>Reset To Live Data</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <main className={`bm-main rc-main ${isTableExpanded ? "table-expanded" : ""}`}>
        <section className={`bm-table ${isTableExpanded ? "expanded" : ""}`}>
          <div className="rc-table-toolbar">
            <span>Results Table</span>
            <span>{isTableExpanded ? "Expanded" : "Normal"}</span>
          </div>
          <div className="table-wrap custom-scrollbar">
            <table>
              <thead><tr><th>Variant ID</th><th className="num">Gross Cost</th><th className="num">Return Save</th><th className="num">Fee</th><th className="num">Net Cost</th><th className="num">Revenue</th><th className="num">Profit</th><th className="num">Profit %</th></tr></thead>
              <tbody>
                {!hasDisplayData || !rows.length ? (<tr><td colSpan={8}>No refining data available for the selected region/city.</td></tr>) : null}
                {rows.map((row, index) => (
                  <tr key={row.variant.id} className={`high-density-row ${index % 2 === 1 ? "alt" : ""} ${selectedRowKey === row.variant.id ? "selected-row" : ""}`} onClick={() => setSelectedRowKey(row.variant.id)}>
                    <td><div className="item"><div className="item-info"><div className="item-icon"><img src={row.variant.icon} alt={row.variant.id} /></div><div><div className="item-name">{row.variant.id}</div><div className="item-meta">{row.variant.label}</div></div></div></div></td>
                    <td className="num">{formatNumber(row.grossMaterialCost)}</td>
                    <td className="num profit">-{formatNumber(row.returnedMaterialCost)}</td>
                    <td className="num muted">{formatNumber(row.refiningFee)}</td>
                    <td className="num">{formatNumber(row.totalCost)}</td>
                    <td className="num">{formatNumber(row.revenue)}</td>
                    <td className={`num ${row.positive ? "profit" : "loss"}`}>{row.positive ? "+" : ""}{formatNumber(row.profit)}</td>
                    <td className={`num ${row.positive ? "profit" : "loss"}`}>{formatPct(row.profitPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <p>Showing {rows.length} variants</p>
            <p>Region {region.toUpperCase()}</p>
            <button
              type="button"
              className={`rc-arrow-toggle table-toggle ${isTableExpanded ? "open" : ""}`}
              aria-label={isTableExpanded ? "Collapse results table" : "Expand results table"}
              onClick={() => setIsTableExpanded((prev) => !prev)}
            >
              <span className="rc-arrow-glyph">▾</span>
            </button>
          </div>
        </section>

        <aside className={`bm-side ${isTableExpanded ? "compressed" : ""}`}>
          <div className="side-card teal-glow custom-scrollbar">
            <div className="side-header"><h3>Refining Insight</h3><span className="material-symbols-outlined">tune</span></div>
            <div className="side-hero teal-gradient-bg">
              <div className="side-icon"><div className="side-icon-inner"><img src={selectedRow?.variant.icon || ""} alt="" /></div></div>
              <h2>{selectedRow?.variant.id || "Select a variant"}</h2>
            </div>
            <div className="side-metrics">
              <div><span>Gross Material Cost</span><strong>{formatNumber(selectedRow?.grossMaterialCost || 0)}</strong></div>
              <div><span>Returned Material Value</span><strong className="profit">-{formatNumber(selectedRow?.returnedMaterialCost || 0)}</strong></div>
              <div><span>Effective Material Cost</span><strong>{formatNumber(selectedRow?.effectiveMaterialCost || 0)}</strong></div>
              <div><span>Nutrition Cost</span><strong>{formatNumber(selectedRow?.nutritionCost || 0)}</strong></div>
              <div><span>Station Fee</span><strong>{formatNumber(selectedRow?.refiningFee || 0)}</strong></div>
              <div><span>Total Cost</span><strong>{formatNumber(selectedRow?.totalCost || 0)}</strong></div>
              <div><span>Revenue</span><strong>{formatNumber(selectedRow?.revenue || 0)}</strong></div>
              <div><span>Return Rate</span><strong>{formatPct((selectedRow?.returnRate || 0) * 100)}</strong></div>
              <div><span>Profit</span><strong className={selectedRow?.profit && selectedRow.profit >= 0 ? "profit" : "loss"}>{selectedRow?.profit && selectedRow.profit >= 0 ? "+" : ""}{formatNumber(selectedRow?.profit || 0)}</strong></div>
              <div><span>Profit %</span><strong className={selectedRow?.profitPercent && selectedRow.profitPercent >= 0 ? "profit" : "loss"}>{formatPct(selectedRow?.profitPercent || 0)}</strong></div>
            </div>
            <div className="rc-side-footer"><div className="rc-side-stat"><span>Max Potential Daily Profit</span><strong>{formatNumber(maxDailyProfit)}</strong></div></div>
          </div>
        </aside>
      </main>
    </div>
  );
}
