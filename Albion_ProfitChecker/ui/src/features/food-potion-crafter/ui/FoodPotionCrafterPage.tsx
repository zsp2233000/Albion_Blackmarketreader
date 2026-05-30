import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { assetUrl, onItemIconError } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { RegionService } from "@shared/region/regionService";
import { formatUpdated } from "@shared/time/lastUpdated";
import { useSeo } from "../../../shared/seo/useSeo";
import type { City, ConsumableCategory, ConsumableRecipe, MarketRegion, RecipeIngredient } from "../core";
import { buildConsumablePriceSnapshot, ingredientPricesPath, loadIngredients, loadRecipes, outputPricesPath } from "../data";
import { deriveFoodPotionRows, useFoodPotionState } from "../hooks";
import { FoodPotionSpecsModal } from "../specs/FoodPotionSpecsModal";
import { resolveSpecFamily } from "../specs/data";
import { useFoodPotionSpecs } from "../specs/useFoodPotionSpecs";
import "../../bm-crafter/ui/bmCrafter.css";
import "../../crafting-calculator/craftingCalculator.css";
import "./foodPotionCrafter.css";

const KNOWN_CITIES: City[] = ["Caerleon", "Brecilien", "Bridgewatch", "Lymhurst", "Fort Sterling", "Martlock", "Thetford"];
const PRICE_STORAGE_KEY = "food-potion-prices-v1";

function iconUrl(itemId: string): string {
  return `/itemicons/${itemId}.png`;
}

/** Family key — fish sauce levels collapse into one product. */
function familyBase(itemId: string): string {
  const base = itemId.replace(/^T\d+_/, "");
  if (/^FISHSAUCE/.test(base)) return "FISHSAUCE";
  return base;
}

const FOOD_TYPE_WORDS = ["Sandwich", "Omelette", "Salad", "Roast", "Stew", "Soup", "Pie"];

/**
 * Product label from the first recipe's name.
 * - strips the Minor/Major/... quality prefix
 * - for food, collapses "{ingredient} {Type}" (e.g. Goat Stew, Carrot Soup) to just the food type
 * - tags Fish / Avalon variant families so they stay distinct
 */
function familyLabel(base: string, name: string, category: ConsumableCategory): string {
  if (base === "FISHSAUCE") return "Fish Sauce";
  let label = String(name || "").replace(/^(Minor|Lesser|Major|Greater|Mighty|Superior|Grand)\s+/i, "").trim();
  if (category === "food") {
    const lower = label.toLowerCase();
    const type = FOOD_TYPE_WORDS.find((t) => lower.endsWith(` ${t.toLowerCase()}`) || lower === t.toLowerCase());
    if (type) label = type;
  }
  if (/_FISH$/.test(base)) label = `${label} (Fish)`;
  if (/_AVALON$/.test(base)) label = `${label} (Avalon)`;
  return label;
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString("de-DE");
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function parsePrice(raw: string): number {
  const cleaned = String(raw || "").replace(/[^\d.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readManualPrices(): Record<string, string> {
  try {
    const stored = localStorage.getItem(PRICE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
    }
  } catch {
    /* ignore */
  }
  return {};
}

function sanitizeAvatarUrl(value?: string | null): string {
  const fallback = "/picture/accountsymbol.png";
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return fallback;
  // Reject protocol-relative ("//host") and backslash tricks that escape our origin.
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return fallback;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") return url.href;
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return fallback;
}

function useRegion(): [MarketRegion, (next: MarketRegion) => void] {
  const [service] = useState(() => new RegionService("eu"));
  const [region, setRegion] = useState<MarketRegion>(service.getRegion() as MarketRegion);
  useEffect(() => {
    const off = service.subscribe((next) => setRegion(next as MarketRegion));
    return () => {
      off();
      service.destroy();
    };
  }, [service]);
  return [region, (next) => service.setRegion(next)];
}

interface AccountUser {
  id: string;
  email: string | null;
  avatar: string;
  region: MarketRegion | null;
}

const ACCOUNT_AVATARS = [
  "/picture/accountsymbol.png",
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png",
];

export function FoodPotionCrafterPage() {
  const [region, setRegion] = useRegion();
  const [recipes, setRecipes] = useState<ConsumableRecipe[]>([]);
  const [ingredientMeta, setIngredientMeta] = useState<Map<string, RecipeIngredient>>(new Map());
  const [manualPrices, setManualPrices] = useState<Record<string, string>>(() => readManualPrices());
  const [livePriceByItemId, setLivePriceByItemId] = useState<Record<string, number>>({});
  const [soldByItemId, setSoldByItemId] = useState<Record<string, number>>({});
  const [liveUpdatedIso, setLiveUpdatedIso] = useState<string | null>(null);
  const [buyCity, setBuyCity] = useState<City>("Lymhurst");
  const [sellCity, setSellCity] = useState<City>("Lymhurst");
  const [mode, setMode] = useState<"scanner" | "crafter">("scanner");
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [showSpecsModal, setShowSpecsModal] = useState(false);

  // --- account ---
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);

  const specsState = useFoodPotionSpecs(authService, Boolean(user));

  useSeo({
    title: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    description:
      "Albion Online Food and Potion crafting profit calculator with ingredient costs, return rate, station fees, focus specs, and per-recipe profit analysis.",
    keywords:
      "Albion Online Food Crafter, Albion Potion Crafter, Albion cooking calculator, Albion alchemy calculator, Albion consumable profit",
    canonical: "https://blackmarketreader.com/food-potion-crafter",
    ogTitle: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    ogDescription: "Calculate Albion Online food and potion crafting profit with ingredient prices, return rate, station fees, and focus.",
    ogUrl: "https://blackmarketreader.com/food-potion-crafter",
    ogImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
    twitterTitle: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    twitterDescription: "Calculate Albion Online food and potion crafting profit with ingredient prices, return rate, station fees, and focus.",
    twitterImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
  });

  useEffect(() => {
    document.body.classList.add("food-potion-crafter-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "crafting-calculator-body", "refining-calculator-body");
    return () => document.body.classList.remove("food-potion-crafter-body");
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
        const next = encodeURIComponent(window.location.pathname || "/food-potion-crafter");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const profile = await authService.getUserProfile().catch(() => null);
      if (cancelled || !profile) return;
      if (!profile.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname || "/food-potion-crafter");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const normalizedRegion = profile.region === "eu" || profile.region === "us" ? (profile.region as MarketRegion) : null;
      setUser({
        id: profile.id,
        email: profile.email,
        avatar: sanitizeAvatarUrl(profile.avatar || localStorage.getItem("avatar")),
        region: normalizedRegion,
      });
      if (normalizedRegion) setRegion(normalizedRegion);
    })();
    return () => {
      cancelled = true;
    };
  }, [authService, setRegion]);

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
      if (accountPanelRef.current?.contains(target) || accountBtnRef.current?.contains(target)) return;
      setShowAccount(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [showAccount]);

  // Cross-tab avatar sync (matches the other crafter pages).
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

  const onRegionSave = useCallback(
    async (next: MarketRegion) => {
      setRegion(next);
      setUser((prev) => (prev ? { ...prev, region: next } : prev));
      if (authService) await authService.updateUserMetadata({ region: next }).catch(() => undefined);
    },
    [authService, setRegion]
  );

  const onAvatarChange = useCallback(
    async (next: string) => {
      const avatar = sanitizeAvatarUrl(next);
      localStorage.setItem("avatar", avatar);
      profileChannelRef.current?.postMessage({ type: "avatar", value: avatar });
      setUser((prev) => (prev ? { ...prev, avatar } : prev));
      if (authService) await authService.updateUserMetadata({ avatar }).catch(() => undefined);
    },
    [authService]
  );

  const onResetPassword = useCallback(async () => {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=%2Ffood-potion-crafter`,
    });
    if (error) {
      setAccountActionMsg(error.message || "Password reset failed.");
      return;
    }
    setAccountActionMsg("Email sent");
    window.setTimeout(() => setAccountActionMsg(""), 3000);
  }, [authService, user]);

  const onLogout = useCallback(async () => {
    if (authService) await authService.signOut().catch(() => undefined);
    setUser(null);
    setShowAccount(false);
    window.location.href = "/login?next=%2Ffood-potion-crafter";
  }, [authService]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [food, potions, ingredients] = await Promise.all([loadRecipes("food"), loadRecipes("potion"), loadIngredients()]);
      if (cancelled) return;
      setRecipes([...food, ...potions]);
      setIngredientMeta(new Map(ingredients.map((entry) => [entry.itemId, entry])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(manualPrices));
  }, [manualPrices]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ingredientPayload, foodPayload, potionPayload] = await Promise.all([
        fetch(ingredientPricesPath(region)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(outputPricesPath("food", region)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(outputPricesPath("potion", region)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cancelled) return;
      const foodSnap = buildConsumablePriceSnapshot(ingredientPayload, foodPayload, buyCity, sellCity);
      const potionSnap = buildConsumablePriceSnapshot(ingredientPayload, potionPayload, buyCity, sellCity);
      setLivePriceByItemId({ ...foodSnap.priceByItemId, ...potionSnap.priceByItemId });
      setSoldByItemId({ ...foodSnap.soldByItemId, ...potionSnap.soldByItemId });
      setLiveUpdatedIso(foodSnap.generatedAt ?? potionSnap.generatedAt ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [region, buyCity, sellCity]);

  const priceByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [itemId, price] of Object.entries(livePriceByItemId)) if (price > 0) map.set(itemId, price);
    for (const [itemId, value] of Object.entries(manualPrices)) {
      const price = parsePrice(value);
      if (price > 0) map.set(itemId, price);
    }
    return map;
  }, [livePriceByItemId, manualPrices]);

  const { rows, selectedRow, selectedRowKey, setSelectedRowKey, filters } = useFoodPotionState(recipes, priceByItemId, specsState.progress);

  const updatePrice = (itemId: string, value: string) => setManualPrices((prev) => ({ ...prev, [itemId]: value }));

  // A row's profit is only trustworthy when every needed ingredient AND a sell price are known.
  const isPriced = (row: { result: { missingIngredientCost: boolean; revenue: number } }) =>
    !row.result.missingIngredientCost && row.result.revenue > 0;

  const profitableCount = rows.filter((row) => isPriced(row) && row.result.profit > 0).length;
  const visibleRows = rows;

  const selectedTiers = useMemo(() => {
    const tiers = new Set<number>();
    recipes.forEach((recipe) => {
      if (recipe.category === filters.category) tiers.add(recipe.tier);
    });
    return [...tiers].sort((a, b) => a - b);
  }, [recipes, filters.category]);

  const families = useMemo(() => {
    // First recipe (lowest tier) per family supplies the display name.
    const firstByBase = new Map<string, ConsumableRecipe>();
    recipes.forEach((recipe) => {
      if (recipe.category !== filters.category) return;
      const base = familyBase(recipe.itemId);
      const current = firstByBase.get(base);
      if (!current || recipe.tier < current.tier) firstByBase.set(base, recipe);
    });
    return [...firstByBase.entries()]
      .map(([base, recipe]) => ({ base, label: familyLabel(base, recipe.name, filters.category) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [recipes, filters.category]);

  const effectiveFamily = useMemo(() => {
    if (selectedFamily && families.some((f) => f.base === selectedFamily)) return selectedFamily;
    if (selectedRow) return familyBase(selectedRow.recipe.itemId);
    return families[0]?.base ?? null;
  }, [selectedFamily, families, selectedRow]);

  const familyRows = useMemo(() => {
    if (!effectiveFamily) return [];
    const famRecipes = recipes.filter((recipe) => recipe.category === filters.category && familyBase(recipe.itemId) === effectiveFamily);
    return deriveFoodPotionRows(
      famRecipes,
      { ...filters, selectedTier: null, searchTerm: "", showOnlyProfitable: false },
      priceByItemId
    ).sort((a, b) => a.recipe.tier - b.recipe.tier);
  }, [effectiveFamily, recipes, filters, priceByItemId]);

  const crafterSelected = useMemo(
    () => familyRows.find((row) => row.rowKey === selectedRowKey) ?? familyRows[0] ?? null,
    [familyRows, selectedRowKey]
  );

  // Active spec family for the modal highlight (crafter: selected recipe; scanner: top row).
  const activeSpecFamily = useMemo(() => {
    const recipe = mode === "crafter" ? crafterSelected?.recipe : selectedRow?.recipe;
    return recipe ? resolveSpecFamily(recipe.itemId, filters.category) : null;
  }, [mode, crafterSelected, selectedRow, filters.category]);

  const liveUpdated = formatUpdated(liveUpdatedIso);

  return (
    <div className="rc-page fp-page">
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
              <Link className="nav-tab" to="/refining-calculator">Refining Calculator</Link>
              <span className="nav-tab active">Food &amp; Potion Crafter</span>
            </div>
          </div>
          <div className="bm-meta">
            <button className="bm-pill" type="button" onClick={() => setRegion(region === "eu" ? "us" : "eu")}>
              <span className="material-symbols-outlined">language</span>Region: <span>{region.toUpperCase()}</span>
            </button>
            <div className="bm-status" title={liveUpdated.title}><span className="pulse"></span>{liveUpdated.relative ? <>Last updated: <span>{liveUpdated.time}</span><span className="bm-status-ago"> ({liveUpdated.relative})</span></> : "Manual pricing"}</div>
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount((p) => !p)} aria-label="Account">
                <img src={user?.avatar || assetUrl("picture/accountsymbol.png")} alt="avatar" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {user ? (
        <div ref={accountPanelRef} className={`account-panel ${showAccount ? "open" : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className="account-header">
            <div className="avatar-ring">
              <img className="avatar-big" src={user.avatar} alt="avatar" />
              <span className="status-dot" aria-hidden="true"></span>
            </div>
            <div className="user-info">
              <span className="email">{user.email || "-"}</span>
              <span className="status">Logged in</span>
              <div className="badge-row">
                <span className="badge-chip">Active</span>
                <span className="badge-chip muted">Secure</span>
              </div>
            </div>
            <button className="close-btn" aria-label="Close" onClick={() => setShowAccount(false)}>X</button>
          </div>

          <div className="panel-section">
            <h4>Select profile avatar</h4>
            <div className="avatar-grid">
              {ACCOUNT_AVATARS.filter((src) => !src.includes("accountsymbol")).map((src) => (
                <img key={src} src={assetUrl(src.replace(/^\//, ""))} alt="" onClick={() => onAvatarChange(src)} />
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h4>Data region</h4>
            <select className="city-select" value={region} onChange={(e) => onRegionSave(e.target.value === "us" ? "us" : "eu")}>
              <option value="us">America</option>
              <option value="eu">Europe</option>
            </select>
          </div>

          <div className="account-actions">
            <button className="btn primary" onClick={onResetPassword}>{accountActionMsg === "Email sent" ? "Email sent" : "Change password"}</button>
            <button className="btn danger" onClick={onLogout}>Logout</button>
          </div>

          <div className="account-help">
            <span>Need help?</span>
            <a href="https://discord.gg/HF2Ctg73m5" target="_blank" rel="noopener noreferrer">Join Discord</a>
            <a href="mailto:blackmarketreader@gmail.com">blackmarketreader@gmail.com</a>
          </div>
        </div>
      ) : null}

      <div className="fp-category-bar">
        <div className="fp-category-tabs">
          {([
            { category: "food", mode: "scanner", label: "Cooking Scanner", icon: "restaurant" },
            { category: "food", mode: "crafter", label: "Cooking Crafter", icon: "restaurant" },
            { category: "potion", mode: "scanner", label: "Potion Scanner", icon: "science" },
            { category: "potion", mode: "crafter", label: "Potion Crafter", icon: "science" },
          ] as const).map((tab) => {
            const active = filters.category === tab.category && mode === tab.mode;
            return (
              <button
                key={`${tab.category}-${tab.mode}`}
                type="button"
                data-category={tab.category}
                className={`fp-category-tab ${active ? "active" : ""}`}
                onClick={() => {
                  if (filters.category !== tab.category) filters.setCategory(tab.category);
                  setMode(tab.mode);
                }}
              >
                <span className="material-symbols-outlined">{tab.icon}</span>{tab.label}
              </button>
            );
          })}
        </div>
        <button type="button" className="fp-specs-trigger" onClick={() => setShowSpecsModal(true)}>
          <span className="material-symbols-outlined">workspace_premium</span>
          Manage Specs
          {specsState.pendingSync ? <span className="badge">Saving…</span> : null}
        </button>
      </div>

      <section className="fp-controls fp-controls-static">
        <div className="fp-filter-grid">
          <div className="fp-field">
            <label>Amount</label>
            <input className="fp-control" inputMode="numeric" value={filters.amount} onChange={(e) => filters.setAmount(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="fp-field">
            <label>Station Fee / Craft</label>
            <input className="fp-control" inputMode="numeric" value={filters.stationFeePerCraft} onChange={(e) => filters.setStationFeePerCraft(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="fp-field">
            <label>Craft City</label>
            <select className="fp-control" value={filters.craftCity} onChange={(e) => filters.setCraftCity(e.target.value as City)}>
              {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
            </select>
          </div>
          <div className="fp-field">
            <label>Buy City</label>
            <select className="fp-control" value={buyCity} onChange={(e) => setBuyCity(e.target.value as City)}>
              {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
            </select>
          </div>
          <div className="fp-field">
            <label>Sell City</label>
            <select className="fp-control" value={sellCity} onChange={(e) => setSellCity(e.target.value as City)}>
              {KNOWN_CITIES.map((city) => (<option key={city} value={city}>{city}</option>))}
            </select>
          </div>
          <div className="fp-field">
            <label>Return Profile</label>
            <select className="fp-control" value={filters.returnRatePreset} onChange={(e) => filters.setReturnRatePreset(e.target.value as typeof filters.returnRatePreset)}>
              <option value="base">Royal Base</option>
              <option value="city">Auto City Bonus</option>
              <option value="focus">Auto City + Focus</option>
              <option value="custom">Custom %</option>
            </select>
          </div>
          {filters.returnRatePreset === "custom" ? (
            <div className="fp-field">
              <label>Custom Return %</label>
              <input className="fp-control" inputMode="decimal" value={filters.customReturnRatePct} onChange={(e) => filters.setCustomReturnRatePct(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} />
            </div>
          ) : null}
          <div className="fp-field">
            <label>Market Tax %</label>
            <input className="fp-control" inputMode="decimal" value={(filters.marketTaxRate * 100).toFixed(1)} onChange={(e) => filters.setMarketTaxRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} />
          </div>
          {mode === "scanner" ? (
            <div className="fp-field fp-field-wide">
              <label>Tier</label>
              <div className="chip-row">
                {selectedTiers.map((tier) => (
                  <button key={tier} type="button" className={`chip ${filters.selectedTier === tier ? "active" : ""}`} onClick={() => filters.toggleTier(tier)}>T{tier}</button>
                ))}
              </div>
            </div>
          ) : null}
          {mode === "scanner" ? (
            <div className="fp-field fp-field-wide">
              <label>Search</label>
              <div className="search-field">
                <input type="search" value={filters.searchTerm} onChange={(e) => filters.setSearchTerm(e.target.value)} placeholder="Recipe or ingredient" />
                <span className="material-symbols-outlined">search</span>
              </div>
            </div>
          ) : null}
          {mode === "scanner" ? (
            <div className="fp-field">
              <label>Profitable Only</label>
              <label className="fp-toggle-field">
                <input type="checkbox" checked={filters.showOnlyProfitable} onChange={(e) => filters.setShowOnlyProfitable(e.target.checked)} />
                <span>Hide losses</span>
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <main className={`bm-main rc-main fp-main fp-main-${mode}`}>
        {mode === "scanner" ? (
          <section className="bm-table expanded">
            <div className="fp-summary-bar">
              <div className="fp-summary-stat"><span>Profitable</span><strong className="profit">{profitableCount}</strong></div>
              <div className="fp-summary-divider" />
              <div className="fp-summary-stat"><span>Showing</span><strong>{rows.length}</strong></div>
              <div className="fp-summary-divider" />
              <div className="fp-summary-stat"><span>Category</span><strong>{filters.category === "food" ? "Food" : "Potions"}</strong></div>
              <div className="fp-summary-divider" />
              <div className="fp-summary-stat"><span>Return</span><strong>{selectedRow ? formatPct(selectedRow.result.returnRate * 100) : "--"}</strong></div>
            </div>
            <div className="table-wrap custom-scrollbar fp-scanner-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recipe</th><th className="num">Output</th><th className="num">Return</th>
                    <th className="num">Craft Cost</th><th className="num">Sell Price</th>
                    <th className="num">Profit</th><th className="num">Profit %</th><th className="num">Silver / Focus</th><th className="num">Sold / Day</th>
                  </tr>
                </thead>
                <tbody>
                  {!rows.length ? (<tr><td colSpan={9}>No recipes match — enter ingredient prices or adjust filters.</td></tr>) : null}
                  {visibleRows.map((row, index) => {
                    const priced = isPriced(row);
                    return (
                    <tr
                      key={row.rowKey}
                      className={`high-density-row fp-clickable-row ${index % 2 === 1 ? "alt" : ""} ${selectedRowKey === row.rowKey ? "selected-row" : ""} ${row.recipe.isAvalonian ? "fp-avalonian-row" : ""} ${priced ? "" : "fp-unpriced-row"}`}
                      title="Open in crafter"
                      onClick={() => { setSelectedFamily(familyBase(row.recipe.itemId)); setSelectedRowKey(row.rowKey); setMode("crafter"); }}
                    >
                      <td>
                        <div className="item">
                          <div className="item-info">
                            <div className="fp-item-icon"><img src={iconUrl(row.recipe.itemId)} alt="" loading="lazy" onError={onItemIconError} /></div>
                            <div>
                              <div className="item-name">
                                {row.recipe.name}
                                {priced ? null : <span className="fp-chip fp-missing-chip" style={{ marginLeft: 6 }}>No price</span>}
                                {row.recipe.isAvalonian ? <span className="fp-chip fp-avalonian-chip" style={{ marginLeft: 6 }}>Avalon</span> : null}
                              </div>
                              <div className="item-meta">T{row.recipe.tier} · {row.recipe.ingredients.length} ingredients</div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{formatNumber(row.result.outputAmount)}</td>
                      <td className="num">{formatPct(row.result.returnRate * 100)}</td>
                      <td className="num">{priced ? formatNumber(row.result.totalCost) : "--"}</td>
                      <td className="num">{(() => { const p = priceByItemId.get(row.recipe.itemId) ?? 0; return p > 0 ? formatNumber(p) : "--"; })()}</td>
                      <td className={`num ${priced ? (row.result.profit >= 0 ? "profit" : "loss") : ""}`}>{priced ? `${row.result.profit >= 0 ? "+" : ""}${formatNumber(row.result.profit)}` : "--"}</td>
                      <td className={`num ${priced ? (row.result.profit >= 0 ? "profit" : "loss") : ""}`}>{priced ? formatPct(row.result.profitPercent) : "--"}</td>
                      <td className={`num ${priced && (row.result.silverPerFocus ?? 0) >= 0 ? "profit" : priced ? "loss" : ""}`}>{priced && row.result.silverPerFocus !== null ? formatNumber(row.result.silverPerFocus) : "--"}</td>
                      <td className="num">{(() => { const s = soldByItemId[row.recipe.itemId] ?? 0; return s > 0 ? formatNumber(s) : "--"; })()}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <p>Showing {rows.length} {filters.category === "food" ? "food" : "potion"} recipes</p>
              <p>Region {region.toUpperCase()} · profit shown only when prices are complete</p>
            </div>
          </section>
        ) : (
          <section className="fp-crafter-stage fp-crafter-full">
            <div className="fp-crafter-toolbar">
              <div className="fp-recipe-picker">
                <span className="cc-caption">Product</span>
                <select className="fp-control" value={effectiveFamily ?? ""} onChange={(e) => setSelectedFamily(e.target.value || null)}>
                  {families.length === 0 ? <option value="">No products available</option> : null}
                  {families.map((f) => (<option key={f.base} value={f.base}>{f.label}</option>))}
                </select>
              </div>
              <span className="fp-batch-badge">
                Figures shown for <strong>{filters.amount}</strong> craft{filters.amount === 1 ? "" : "s"}
                {crafterSelected ? <> · <strong>{crafterSelected.recipe.outputQty * filters.amount}</strong> items produced</> : null}
              </span>
            </div>

            <div className="fp-tier-wrap table-wrap custom-scrollbar">
              <table>
                <thead>
                  <tr>
                    <th>Tier</th><th>Recipe</th>
                    <th className="num">Output ({filters.amount}×)</th><th className="num">Return</th>
                    <th className="num">Ingredient Cost</th><th className="num">Station Fee</th>
                    <th className="num">Profit</th><th className="num">Profit %</th><th className="num">Silver / Focus</th>
                  </tr>
                </thead>
                <tbody>
                  {familyRows.length === 0 ? (<tr><td colSpan={9}>No tiers for this product.</td></tr>) : null}
                  {familyRows.map((row) => (
                    <tr
                      key={row.rowKey}
                      className={`high-density-row ${crafterSelected?.rowKey === row.rowKey ? "selected-row" : ""} ${row.recipe.isAvalonian ? "fp-avalonian-row" : ""}`}
                      onClick={() => setSelectedRowKey(row.rowKey)}
                    >
                      <td><span className="badge-chip">T{row.recipe.tier}</span></td>
                      <td>
                        <div className="item"><div className="item-info">
                          <div className="fp-item-icon"><img src={iconUrl(row.recipe.itemId)} alt="" loading="lazy" onError={onItemIconError} /></div>
                          <div className="item-name">{row.recipe.name}{row.result.missingIngredientCost ? " *" : ""}{row.recipe.isAvalonian ? <span className="fp-chip fp-avalonian-chip" style={{ marginLeft: 6 }}>Avalon</span> : null}</div>
                        </div></div>
                      </td>
                      <td className="num">{formatNumber(row.result.outputAmount)}</td>
                      <td className="num">{formatPct(row.result.returnRate * 100)}</td>
                      <td className="num">{formatNumber(row.result.grossIngredientCost)}</td>
                      <td className="num muted">{formatNumber(row.result.stationFee)}</td>
                      <td className={`num ${row.result.profit >= 0 ? "profit" : "loss"}`}>{row.result.profit >= 0 ? "+" : ""}{formatNumber(row.result.profit)}</td>
                      <td className={`num ${row.result.profit >= 0 ? "profit" : "loss"}`}>{formatPct(row.result.profitPercent)}</td>
                      <td className={`num ${(row.result.silverPerFocus ?? 0) >= 0 ? "profit" : "loss"}`}>{row.result.silverPerFocus === null ? "--" : formatNumber(row.result.silverPerFocus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {crafterSelected ? (
              <div className="fp-workbench-inline">
                <div className="fp-workbench-title">
                  <span className="material-symbols-outlined">calculate</span>
                  <div>
                    <h3>{crafterSelected.recipe.name} · Calculator</h3>
                    <p>Edit ingredient + sell prices — profit updates live</p>
                  </div>
                </div>
                <div className="detail-grid-12">
                  <div className="bento-card span-8">
                    <div className="bento-card-inner-head">
                      <div className="cc-caption">Output Sell Price (per item)</div>
                      <div className="fp-output-price">
                        <input
                          inputMode="numeric"
                          value={manualPrices[crafterSelected.recipe.itemId] ?? ""}
                          onChange={(e) => updatePrice(crafterSelected.recipe.itemId, e.target.value)}
                          placeholder={livePriceByItemId[crafterSelected.recipe.itemId] ? String(livePriceByItemId[crafterSelected.recipe.itemId]) : "enter sell price"}
                        />
                      </div>
                    </div>
                    <div className="material-head">
                      <span className="cc-caption">Ingredients · edit unit prices</span>
                      <span className="material-total">Total: {formatNumber(crafterSelected.result.grossIngredientCost)}</span>
                    </div>
                    <div className="fp-ingredient-list">
                      {crafterSelected.recipe.ingredients.map((ingredient) => {
                        const isToken = /QUESTITEM_TOKEN_AVALON/.test(ingredient.itemId);
                        const unit = priceByItemId.get(ingredient.itemId) ?? 0;
                        const total = unit * ingredient.qty * filters.amount;
                        const livePlaceholder = livePriceByItemId[ingredient.itemId];
                        const meta = ingredientMeta.get(ingredient.itemId);
                        const rare = ingredient.rare || meta?.rare;
                        return (
                          <div key={ingredient.itemId} className={`fp-ingredient-row ${rare ? "rare" : ""} ${isToken ? "token" : ""}`}>
                            <div className="fp-ingredient-main">
                              <span className="fp-ingredient-icon"><img src={iconUrl(ingredient.itemId)} alt="" loading="lazy" onError={onItemIconError} /></span>
                              <span className="fp-ingredient-qty">{ingredient.qty}×</span>
                              <span className="fp-ingredient-name">{ingredient.name}</span>
                              {rare ? <span className="fp-chip fp-rare-chip">Rare</span> : null}
                              {isToken ? <span className="fp-chip fp-avalonian-chip">Token</span> : null}
                            </div>
                            <div className="fp-ingredient-meta">
                              <input
                                className="fp-ingredient-price"
                                inputMode="numeric"
                                value={manualPrices[ingredient.itemId] ?? ""}
                                onChange={(e) => updatePrice(ingredient.itemId, e.target.value)}
                                placeholder={livePlaceholder ? String(livePlaceholder) : "unit"}
                              />
                              <span className="fp-ingredient-total">{total > 0 ? formatNumber(total) : "-"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bento-card span-4 fp-summary-card">
                    <div className="fp-summary-card-head">
                      <span className="cc-caption">Profit Summary</span>
                      <span className={`fp-summary-pill ${crafterSelected.result.profit >= 0 ? "profit" : "loss"}`}>
                        {crafterSelected.result.profit >= 0 ? "Profit" : "Loss"}
                      </span>
                    </div>
                    <div className="fp-summary-hero">
                      <span className="fp-summary-hero-label">Profit / Craft</span>
                      <strong className={crafterSelected.result.profit >= 0 ? "profit-cell" : "loss-cell"}>
                        {crafterSelected.result.profit >= 0 ? "+" : ""}{formatNumber(crafterSelected.result.profit)}
                      </strong>
                      <span className="fp-summary-hero-sub">ROI {formatPct(crafterSelected.result.profitPercent)}</span>
                    </div>
                    <div className="fp-summary-grid">
                      <div><span>Ingredient Cost</span><strong>{formatNumber(crafterSelected.result.grossIngredientCost)}</strong></div>
                      <div><span>Return Saved</span><strong className="profit-cell">−{formatNumber(crafterSelected.result.returnedIngredientCost)}</strong></div>
                      <div><span>Station Fee</span><strong>{formatNumber(crafterSelected.result.stationFee)}</strong></div>
                      <div><span>Market Tax</span><strong>{formatNumber(crafterSelected.result.marketTax)}</strong></div>
                      <div><span>Total Cost</span><strong>{formatNumber(crafterSelected.result.totalCost)}</strong></div>
                      <div><span>Net Revenue</span><strong>{formatNumber(crafterSelected.result.netRevenue)}</strong></div>
                      <div><span>Return Rate</span><strong>{formatPct(crafterSelected.result.returnRate * 100)}</strong></div>
                      <div><span>Focus Cost</span><strong>{crafterSelected.result.focusCost > 0 ? formatNumber(crafterSelected.result.focusCost) : "--"}</strong></div>
                      <div><span>Silver / Focus</span><strong className={(crafterSelected.result.silverPerFocus ?? 0) >= 0 ? "profit-cell" : "loss-cell"}>{crafterSelected.result.silverPerFocus === null ? "--" : formatNumber(crafterSelected.result.silverPerFocus)}</strong></div>
                      <div><span>Profit / Item</span><strong className={crafterSelected.result.profitPerOutput >= 0 ? "profit-cell" : "loss-cell"}>{formatNumber(crafterSelected.result.profitPerOutput)}</strong></div>
                      <div><span>Sold / Day</span><strong>{(soldByItemId[crafterSelected.recipe.itemId] ?? 0) > 0 ? formatNumber(soldByItemId[crafterSelected.recipe.itemId]) : "--"}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </main>

      <FoodPotionSpecsModal
        open={showSpecsModal}
        category={filters.category}
        progress={specsState.progress}
        activeFamily={activeSpecFamily}
        pendingSync={specsState.pendingSync}
        onMastery={specsState.setMastery}
        onSpec={specsState.setSpec}
        onReset={specsState.resetCategory}
        onClose={() => setShowSpecsModal(false)}
      />
    </div>
  );
}
