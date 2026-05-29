import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { assetUrl, onItemIconError } from "@shared/assets/assets";
import { RegionService } from "@shared/region/regionService";
import { useSeo } from "../../../shared/seo/useSeo";
import type { City, ConsumableCategory, ConsumableRecipe, MarketRegion, RecipeIngredient } from "../core";
import { buildConsumablePriceSnapshot, ingredientPricesPath, loadIngredients, loadRecipes, outputPricesPath } from "../data";
import { deriveFoodPotionRows, useFoodPotionState } from "../hooks";
import "../../bm-crafter/ui/bmCrafter.css";
import "../../crafting-calculator/craftingCalculator.css";
import "./foodPotionCrafter.css";

const KNOWN_CITIES: City[] = ["Caerleon", "Brecilien", "Bridgewatch", "Lymhurst", "Fort Sterling", "Martlock", "Thetford"];
const PRICE_STORAGE_KEY = "food-potion-prices-v1";

/** Local-first icon; onItemIconError falls back to the Albion CDN, then a placeholder. */
function iconUrl(itemId: string): string {
  return `/itemicons/${itemId}.png`;
}

/** Strips the tier prefix so all tiers of a product share one family key (e.g. T4_POTION_ENERGY -> POTION_ENERGY). */
function familyBase(itemId: string): string {
  return itemId.replace(/^T\d+_/, "");
}

/** Tier-neutral display label for a product family. */
function familyLabel(base: string, category: ConsumableCategory): string {
  const avalon = /_AVALON$/.test(base);
  let label = base.replace(/^POTION_/, "").replace(/^MEAL_/, "").replace(/_AVALON$/, "").replace(/_LEVEL\d+$/, "");
  label = label.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  if (category === "potion") label = `${label} Potion`;
  if (avalon) label = `${label} (Avalon)`;
  return label.trim();
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

export function FoodPotionCrafterPage() {
  const [region, setRegion] = useRegion();
  const [recipes, setRecipes] = useState<ConsumableRecipe[]>([]);
  const [ingredientMeta, setIngredientMeta] = useState<Map<string, RecipeIngredient>>(new Map());
  const [manualPrices, setManualPrices] = useState<Record<string, string>>(() => readManualPrices());
  const [livePriceByItemId, setLivePriceByItemId] = useState<Record<string, number>>({});
  const [buyCity, setBuyCity] = useState<City>("Caerleon");
  const [sellCity, setSellCity] = useState<City>("Caerleon");
  const [mode, setMode] = useState<"scanner" | "crafter">("scanner");
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [isControlsOpen, setIsControlsOpen] = useState(true);

  useSeo({
    title: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    description:
      "Albion Online Food and Potion crafting profit calculator with ingredient costs, return rate, station fees, focus, and per-recipe profit analysis.",
    keywords:
      "Albion Online Food Crafter, Albion Potion Crafter, Albion cooking calculator, Albion alchemy calculator, Albion consumable profit",
    canonical: "https://blackmarketreader.com/food-potion-crafter",
    ogTitle: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    ogDescription:
      "Calculate Albion Online food and potion crafting profit with ingredient prices, return rate, station fees, and focus.",
    ogUrl: "https://blackmarketreader.com/food-potion-crafter",
    ogImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
    twitterTitle: "Albion Online Food & Potion Crafter | Blackmarket Reader",
    twitterDescription:
      "Calculate Albion Online food and potion crafting profit with ingredient prices, return rate, station fees, and focus.",
    twitterImage: "https://blackmarketreader.com/picture/Profit-Dashboard.png",
  });

  useEffect(() => {
    document.body.classList.add("food-potion-crafter-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "crafting-calculator-body", "refining-calculator-body");
    return () => document.body.classList.remove("food-potion-crafter-body");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [food, potions, ingredients] = await Promise.all([
        loadRecipes("food"),
        loadRecipes("potion"),
        loadIngredients(),
      ]);
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

  // Optional live price snapshot — gracefully no-ops if the price files don't exist yet.
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
    })();
    return () => {
      cancelled = true;
    };
  }, [region, buyCity, sellCity]);

  const priceByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [itemId, price] of Object.entries(livePriceByItemId)) {
      if (price > 0) map.set(itemId, price);
    }
    for (const [itemId, value] of Object.entries(manualPrices)) {
      const price = parsePrice(value);
      if (price > 0) map.set(itemId, price);
    }
    return map;
  }, [livePriceByItemId, manualPrices]);

  const { rows, selectedRow, selectedRowKey, setSelectedRowKey, filters } = useFoodPotionState(recipes, priceByItemId);

  const updatePrice = (itemId: string, value: string) => {
    setManualPrices((prev) => ({ ...prev, [itemId]: value }));
  };

  const profitableCount = rows.filter((row) => row.result.profit > 0).length;

  const selectedTiers = useMemo(() => {
    const tiers = new Set<number>();
    recipes.forEach((recipe) => {
      if (recipe.category === filters.category) tiers.add(recipe.tier);
    });
    return [...tiers].sort((a, b) => a - b);
  }, [recipes, filters.category]);

  // --- Crafter: group recipes into product families (all tiers of e.g. "Energy Potion") ---
  const families = useMemo(() => {
    const map = new Map<string, number>();
    recipes.forEach((recipe) => {
      if (recipe.category !== filters.category) return;
      const base = familyBase(recipe.itemId);
      map.set(base, (map.get(base) ?? 0) + 1);
    });
    return [...map.keys()]
      .map((base) => ({ base, label: familyLabel(base, filters.category) }))
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
    return deriveFoodPotionRows(famRecipes, { ...filters, selectedTier: null, searchTerm: "", showOnlyProfitable: false }, priceByItemId)
      .sort((a, b) => a.recipe.tier - b.recipe.tier);
  }, [effectiveFamily, recipes, filters, priceByItemId]);

  const crafterSelected = useMemo(
    () => familyRows.find((row) => row.rowKey === selectedRowKey) ?? familyRows[0] ?? null,
    [familyRows, selectedRowKey]
  );

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
            <div className="bm-status"><span className="pulse"></span>Manual pricing</div>
          </div>
        </div>
      </header>

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
        <span className="fp-category-hint">
          {filters.category === "food" ? "Cook · bonus city Caerleon" : "Alchemist · bonus city Brecilien"}
          {mode === "scanner" ? " · scan profitable recipes" : " · calculate a recipe"}
        </span>
      </div>

      <section className="fp-controls">
        <div className="fp-controls-head">
          <div>
            <h2>Crafting Controls</h2>
            <p>{isControlsOpen ? "Adjust pricing, bonuses and filters" : "Filters hidden"}</p>
          </div>
          <button type="button" className="fp-toggle" onClick={() => setIsControlsOpen((prev) => !prev)}>
            <span className="material-symbols-outlined">{isControlsOpen ? "expand_less" : "expand_more"}</span>
            {isControlsOpen ? "Hide" : "Show"}
          </button>
        </div>
        {isControlsOpen ? (
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
              <label>Station Kind</label>
              <select className="fp-control" value={filters.stationKind} onChange={(e) => filters.setStationKind(e.target.value as typeof filters.stationKind)}>
                <option value="city">City</option>
                <option value="hideout">Hideout</option>
                <option value="island">Island</option>
              </select>
            </div>
            <div className="fp-field">
              <label>Return Profile</label>
              <select className="fp-control" value={filters.returnRatePreset} onChange={(e) => filters.setReturnRatePreset(e.target.value as typeof filters.returnRatePreset)}>
                <option value="base">Royal Base</option>
                <option value="city">Auto City Bonus</option>
                <option value="focus">Auto City + Focus</option>
              </select>
            </div>
            <div className="fp-field">
              <label>Market Tax %</label>
              <input className="fp-control" inputMode="decimal" value={(filters.marketTaxRate * 100).toFixed(1)} onChange={(e) => filters.setMarketTaxRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} />
            </div>
            <div className="fp-field">
              <label>Demand / Day</label>
              <input className="fp-control" inputMode="numeric" value={filters.demandPerDay} onChange={(e) => filters.setDemandPerDay(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="fp-field fp-field-wide">
              <label>Tier</label>
              <div className="chip-row">
                {selectedTiers.map((tier) => (
                  <button key={tier} type="button" className={`chip ${filters.selectedTier === tier ? "active" : ""}`} onClick={() => filters.toggleTier(tier)}>T{tier}</button>
                ))}
              </div>
            </div>
            <div className="fp-field fp-field-wide">
              <label>Search</label>
              <div className="search-field">
                <input type="search" value={filters.searchTerm} onChange={(e) => filters.setSearchTerm(e.target.value)} placeholder="Recipe or ingredient" />
                <span className="material-symbols-outlined">search</span>
              </div>
            </div>
            <div className="fp-field">
              <label>Profitable Only</label>
              <label className="fp-toggle-field">
                <input type="checkbox" checked={filters.showOnlyProfitable} onChange={(e) => filters.setShowOnlyProfitable(e.target.checked)} />
                <span>Hide losses</span>
              </label>
            </div>
          </div>
        ) : null}
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
          <div className="table-wrap custom-scrollbar">
            <table>
              <thead>
                <tr>
                  <th>Recipe</th><th className="num">Output</th><th className="num">Return</th>
                  <th className="num">Craft Cost</th><th className="num">Net Revenue</th>
                  <th className="num">Profit</th><th className="num">Profit %</th><th className="num">Profit/Item</th><th className="num">Daily</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length ? (<tr><td colSpan={9}>No recipes match — enter ingredient prices or adjust filters.</td></tr>) : null}
                {rows.map((row, index) => (
                  <tr
                    key={row.rowKey}
                    className={`high-density-row ${index % 2 === 1 ? "alt" : ""} ${selectedRowKey === row.rowKey ? "selected-row" : ""} ${row.recipe.isAvalonian ? "fp-avalonian-row" : ""}`}
                    onClick={() => setSelectedRowKey(row.rowKey)}
                  >
                    <td>
                      <div className="item">
                        <div className="item-info">
                          <div className="fp-item-icon"><img src={iconUrl(row.recipe.itemId)} alt="" loading="lazy" onError={onItemIconError} /></div>
                          <div>
                            <div className="item-name">
                              {row.recipe.name}{row.result.missingIngredientCost ? " *" : ""}
                              {row.recipe.isAvalonian ? <span className="fp-chip fp-avalonian-chip" style={{ marginLeft: 6 }}>Avalon</span> : null}
                            </div>
                            <div className="item-meta">T{row.recipe.tier} · {row.recipe.ingredients.length} ingredients</div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{formatNumber(row.result.outputAmount)}</td>
                    <td className="num">{formatPct(row.result.returnRate * 100)}</td>
                    <td className="num">{formatNumber(row.result.totalCost)}</td>
                    <td className="num">{formatNumber(row.result.netRevenue)}</td>
                    <td className={`num ${row.result.profit >= 0 ? "profit" : "loss"}`}>{row.result.profit >= 0 ? "+" : ""}{formatNumber(row.result.profit)}</td>
                    <td className={`num ${row.result.profit >= 0 ? "profit" : "loss"}`}>{formatPct(row.result.profitPercent)}</td>
                    <td className={`num ${row.result.profitPerOutput >= 0 ? "profit" : "loss"}`}>{formatNumber(row.result.profitPerOutput)}</td>
                    <td className={`num ${(row.result.dailyPotential ?? 0) >= 0 ? "profit" : "loss"}`}>{row.result.dailyPotential === null ? "--" : formatNumber(row.result.dailyPotential)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <p>Showing {rows.length} {filters.category === "food" ? "food" : "potion"} recipes</p>
            <p>Region {region.toUpperCase()} · prices entered manually</p>
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
            <span className="fp-category-hint">All tiers shown · edit sell price inline, click a tier for ingredient prices</span>
          </div>

          <div className="fp-tier-wrap table-wrap custom-scrollbar">
            <table>
              <thead>
                <tr>
                  <th>Tier</th><th>Recipe</th><th className="num">Output</th><th className="num">Return</th>
                  <th className="num">Ingredient Cost</th><th className="num">Station Fee</th>
                  <th className="num">Sell / Item</th><th className="num">Net Revenue</th>
                  <th className="num">Profit</th><th className="num">Profit %</th><th className="num">Profit / Item</th>
                </tr>
              </thead>
              <tbody>
                {familyRows.length === 0 ? (<tr><td colSpan={11}>No tiers for this product.</td></tr>) : null}
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
                    <td
                      className="num editable-cell"
                      contentEditable
                      suppressContentEditableWarning
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => updatePrice(row.recipe.itemId, e.currentTarget.textContent || "0")}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
                    >
                      {manualPrices[row.recipe.itemId] ?? (livePriceByItemId[row.recipe.itemId] ? String(livePriceByItemId[row.recipe.itemId]) : "")}
                    </td>
                    <td className="num">{formatNumber(row.result.netRevenue)}</td>
                    <td className={`num ${row.result.profit >= 0 ? "profit" : "loss"}`}>{row.result.profit >= 0 ? "+" : ""}{formatNumber(row.result.profit)}</td>
                    <td className={`num ${row.result.profit >= 0 ? "profit" : "loss"}`}>{formatPct(row.result.profitPercent)}</td>
                    <td className={`num ${row.result.profitPerOutput >= 0 ? "profit" : "loss"}`}>{formatNumber(row.result.profitPerOutput)}</td>
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

                <div className="bento-card span-4 totals">
                  <div><span>Ingredient Cost</span><strong>{formatNumber(crafterSelected.result.grossIngredientCost)}</strong></div>
                  <div><span>Return Saved</span><strong className="profit-cell">-{formatNumber(crafterSelected.result.returnedIngredientCost)}</strong></div>
                  <div><span>Station Fee</span><strong>{formatNumber(crafterSelected.result.stationFee)}</strong></div>
                  <div><span>Market Tax</span><strong>{formatNumber(crafterSelected.result.marketTax)}</strong></div>
                  <div><span>Total Cost</span><strong>{formatNumber(crafterSelected.result.totalCost)}</strong></div>
                  <div><span>Net Revenue</span><strong>{formatNumber(crafterSelected.result.netRevenue)}</strong></div>
                  <div>
                    <span>Profit</span>
                    <strong className={crafterSelected.result.profit >= 0 ? "profit-cell" : "loss-cell"}>
                      {crafterSelected.result.profit >= 0 ? "+" : ""}{formatNumber(crafterSelected.result.profit)}
                    </strong>
                  </div>
                  <div>
                    <span>ROI</span>
                    <strong className={crafterSelected.result.profitPercent >= 0 ? "profit-cell" : "loss-cell"}>{formatPct(crafterSelected.result.profitPercent)}</strong>
                  </div>
                  <div>
                    <span>Profit / Item</span>
                    <strong className={crafterSelected.result.profitPerOutput >= 0 ? "profit-cell" : "loss-cell"}>{formatNumber(crafterSelected.result.profitPerOutput)}</strong>
                  </div>
                  <div>
                    <span>Daily Potential</span>
                    <strong className={(crafterSelected.result.dailyPotential ?? 0) >= 0 ? "profit-cell" : "loss-cell"}>{crafterSelected.result.dailyPotential === null ? "--" : formatNumber(crafterSelected.result.dailyPotential)}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
        )}
      </main>
    </div>
  );
}
