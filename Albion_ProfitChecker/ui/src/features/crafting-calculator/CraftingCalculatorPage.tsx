import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { assetUrl } from "@shared/assets/assets";
import { createAuthService, type AuthService } from "@shared/auth/authService";
import { RegionService } from "@shared/region/regionService";
import "../bm-crafter/ui/bmCrafter.css";
import "./craftingCalculator.css";

type MarketRegion = "eu" | "us";

type UserState = {
  id: string;
  email: string | null;
  avatar: string;
  region: MarketRegion | null;
};

type MaterialDraft = {
  key: string;
  name: string;
  qty: number;
  price: number;
};

type CraftingItem = {
  id: string;
  name: string;
  materials?: Array<{ itemId?: string; id?: string; name?: string; qty?: number }>;
  artifact?: string | null;
  artifactId?: string | null;
};

type TableRow = {
  key: string;
  uid: string;
  mat1: string;
  mat2: string;
  artefact: string;
  tax: string;
  market: string;
  profit: string;
  gain: string;
  focus: string;
};

type TableSection = {
  key: string;
  label: string;
  fogClass: string;
  stripClass: string;
  rows: TableRow[];
};

type RowEdit = {
  mat1: number;
  mat2: number;
  artefact: number;
  tax: number;
  market: number;
};

type MaterialsCityPayload = {
  items?: Array<{ itemId?: string; prices?: Record<string, number> }>;
};

declare global {
  interface Window {
    env?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }
}

const MATERIAL_BASES = new Set(["METALBAR", "PLANKS", "CLOTH", "LEATHER"]);
const KNOWN_CITIES = ["Lymhurst", "Caerleon", "Bridgewatch", "Martlock", "Fort Sterling", "Thetford"];

const allowedAvatars = [
  "/picture/accountsymbol.png",
  "/picture/Bridgewatch.png",
  "/picture/Carleon.png",
  "/picture/Martlockwappen.png",
  "/picture/Lymhurstwappen.png",
  "/picture/Thefortwappen.png"
];

const TABLE_SECTIONS: TableSection[] = [
  {
    key: "t4",
    label: "TIER 4 ADEPT_CLASS",
    fogClass: "fog-t4",
    stripClass: "bg-t4-blue",
    rows: [
      { key: "t4-0", uid: "T4.0", mat1: "1.2k", mat2: "840", artefact: "0", tax: "420", market: "12.5k", profit: "10.0k", gain: "80.3%", focus: "24.5" },
      { key: "t4-1", uid: "T4.1", mat1: "2.9k", mat2: "1.6k", artefact: "0", tax: "850", market: "21.0k", profit: "15.7k", gain: "74.6%", focus: "32.1" },
      { key: "t4-2", uid: "T4.2", mat1: "6.4k", mat2: "4.2k", artefact: "0", tax: "1.2k", market: "48.0k", profit: "36.2k", gain: "75.4%", focus: "48.2" },
      { key: "t4-3", uid: "T4.3", mat1: "24.2k", mat2: "18.5k", artefact: "0", tax: "4.5k", market: "152k", profit: "104k", gain: "68.4%", focus: "85.4" },
      { key: "t4-4", uid: "T4.4", mat1: "124k", mat2: "98k", artefact: "42k", tax: "18k", market: "820k", profit: "538k", gain: "65.6%", focus: "112.5" }
    ]
  },
  {
    key: "t5",
    label: "TIER 5 EXPERT_CLASS",
    fogClass: "fog-t5",
    stripClass: "bg-t5-red",
    rows: [
      { key: "t5-0", uid: "T5.0", mat1: "8.4k", mat2: "6.2k", artefact: "0", tax: "2.4k", market: "42k", profit: "25k", gain: "59.5%", focus: "64.2" },
      { key: "t5-1", uid: "T5.1", mat1: "18k", mat2: "14k", artefact: "0", tax: "5.2k", market: "98k", profit: "60k", gain: "61.2%", focus: "88.4" },
      { key: "t5-2", uid: "T5.2", mat1: "45k", mat2: "32k", artefact: "0", tax: "12k", market: "240k", profit: "151k", gain: "63%", focus: "142" },
      { key: "t5-3", uid: "T5.3", mat1: "112k", mat2: "88k", artefact: "0", tax: "24k", market: "620k", profit: "396k", gain: "63.8%", focus: "210" },
      { key: "t5-4", uid: "T5.4", mat1: "410k", mat2: "295k", artefact: "120k", tax: "65k", market: "2.4M", profit: "1.5M", gain: "62%", focus: "340" }
    ]
  },
  {
    key: "t6",
    label: "TIER 6 MASTER_CLASS",
    fogClass: "fog-t6",
    stripClass: "bg-t6-orange",
    rows: [
      { key: "t6-0", uid: "T6.0", mat1: "12k", mat2: "8.4k", artefact: "0", tax: "8.5k", market: "112k", profit: "83k", gain: "74%", focus: "92.1" },
      { key: "t6-1", uid: "T6.1", mat1: "32k", mat2: "24k", artefact: "0", tax: "14k", market: "310k", profit: "240k", gain: "77%", focus: "125" },
      { key: "t6-2", uid: "T6.2", mat1: "84k", mat2: "62k", artefact: "0", tax: "32k", market: "820k", profit: "642k", gain: "78%", focus: "195" },
      { key: "t6-3", uid: "T6.3", mat1: "320k", mat2: "280k", artefact: "0", tax: "120k", market: "2.2M", profit: "1.4M", gain: "63%", focus: "284" },
      { key: "t6-4", uid: "T6.4", mat1: "1.1M", mat2: "820k", artefact: "440k", tax: "210k", market: "8.4M", profit: "5.8M", gain: "69%", focus: "480" }
    ]
  },
  {
    key: "t7",
    label: "TIER 7 GRANDMASTER_CLASS",
    fogClass: "fog-t7",
    stripClass: "bg-t7-yellow",
    rows: [
      { key: "t7-0", uid: "T7.0", mat1: "42k", mat2: "32k", artefact: "0", tax: "35k", market: "420k", profit: "311k", gain: "74%", focus: "110" },
      { key: "t7-1", uid: "T7.1", mat1: "110k", mat2: "85k", artefact: "0", tax: "62k", market: "1.1M", profit: "843k", gain: "76%", focus: "182" },
      { key: "t7-2", uid: "T7.2", mat1: "280k", mat2: "210k", artefact: "0", tax: "110k", market: "2.4M", profit: "1.8M", gain: "75%", focus: "295" },
      { key: "t7-3", uid: "T7.3", mat1: "840k", mat2: "650k", artefact: "0", tax: "320k", market: "7.8M", profit: "5.9M", gain: "75%", focus: "540" },
      { key: "t7-4", uid: "T7.4", mat1: "2.4M", mat2: "1.9M", artefact: "1.2M", tax: "620k", market: "22M", profit: "15.8M", gain: "71%", focus: "820" }
    ]
  },
  {
    key: "t8",
    label: "TIER 8 ELDER_CLASS",
    fogClass: "fog-t8",
    stripClass: "bg-t8-silver",
    rows: [
      { key: "t8-0", uid: "T8.0", mat1: "95k", mat2: "82k", artefact: "0", tax: "65k", market: "1.1M", profit: "858k", gain: "78%", focus: "185" },
      { key: "t8-1", uid: "T8.1", mat1: "340k", mat2: "290k", artefact: "0", tax: "140k", market: "3.2M", profit: "2.4M", gain: "75%", focus: "310" },
      { key: "t8-2", uid: "T8.2", mat1: "920k", mat2: "810k", artefact: "0", tax: "380k", market: "9.5M", profit: "7.3M", gain: "76%", focus: "580" },
      { key: "t8-3", uid: "T8.3", mat1: "2.8M", mat2: "2.4M", artefact: "0", tax: "1.1M", market: "32M", profit: "25.7M", gain: "80%", focus: "920" },
      { key: "t8-4", uid: "T8.4", mat1: "1.2M", mat2: "1.1M", artefact: "3.5M", tax: "850k", market: "44.2M", profit: "37.5M", gain: "84.8%", focus: "1240" }
    ]
  }
];

function readStoredRegion(): MarketRegion | null {
  const stored = (localStorage.getItem("region") || "").toLowerCase();
  return stored === "eu" || stored === "us" ? stored : null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}

function formatCompact(value: number): string {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(num));
}

function parseCompactNumber(value: string): number {
  const raw = String(value || "").trim().toLowerCase().replace(/,/g, "");
  if (!raw) return 0;
  if (raw.endsWith("k")) return (Number.parseFloat(raw) || 0) * 1000;
  if (raw.endsWith("m")) return (Number.parseFloat(raw) || 0) * 1000000;
  return Number.parseFloat(raw) || 0;
}

function parseTierEnchant(uid: string): { tier: number; enchant: number } {
  const m = String(uid || "").match(/^T?(\d+)(?:\.(\d+))?/i);
  const tier = m ? Number(m[1]) : 4;
  const enchant = m && m[2] ? Number(m[2]) : 0;
  return { tier: Number.isFinite(tier) ? tier : 4, enchant: Number.isFinite(enchant) ? enchant : 0 };
}

function normalizeCityName(raw: string | null): string {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "all" || text === "all cities") return "ALL";
  const hit = KNOWN_CITIES.find((city) => city.toLowerCase() === text);
  return hit || "ALL";
}

function getCurrentCity(): string {
  const keys = ["city", "selectedCity", "cityFilter", "currentCity"];
  for (const key of keys) {
    const city = normalizeCityName(localStorage.getItem(key));
    if (city !== "ALL") return city;
  }
  return "ALL";
}

function buildMaterialItemId(base: string, tier: number, enchant: number): string | null {
  if (!MATERIAL_BASES.has(base)) return null;
  if (enchant > 0) return `T${tier}_${base}_LEVEL${enchant}@${enchant}`;
  return `T${tier}_${base}`;
}

function resolvePriceByCity(prices: Record<string, number> | undefined, city: string): number {
  if (!prices) return 0;
  if (city !== "ALL") return Number(prices[city] || 0);
  const values = KNOWN_CITIES.map((c) => Number(prices[c] || 0)).filter((n) => n > 0);
  return values.length ? Math.min(...values) : 0;
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

export function CraftingCalculatorPage() {
  const configuredGatePassword = "testo";
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(() => sessionStorage.getItem("ccPasswordUnlocked") === "1");
  const [gatePasswordInput, setGatePasswordInput] = useState("");
  const [gateError, setGateError] = useState("");

  const [region, setRegion] = useRegion();
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showRegionConfirm, setShowRegionConfirm] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<MarketRegion | null>(null);
  const [accountActionMsg, setAccountActionMsg] = useState("");
  const accountPanelRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);
  const profileChannelRef = useRef<BroadcastChannel | null>(null);

  const [allItems, setAllItems] = useState<CraftingItem[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState("t8-4");
  const [selectedItem, setSelectedItem] = useState<CraftingItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [materialState, setMaterialState] = useState<MaterialDraft[]>([]);
  const [materialPriceMap, setMaterialPriceMap] = useState<Map<string, Record<string, number>>>(new Map());
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>(() => {
    const entries: Array<[string, RowEdit]> = TABLE_SECTIONS
      .flatMap((section) => section.rows)
      .map((row) => [
        row.key,
        {
          mat1: parseCompactNumber(row.mat1),
          mat2: parseCompactNumber(row.mat2),
          artefact: parseCompactNumber(row.artefact),
          tax: parseCompactNumber(row.tax),
          market: parseCompactNumber(row.market)
        }
      ]);
    return Object.fromEntries(entries);
  });

  const selectedRow = useMemo(() => TABLE_SECTIONS.flatMap((s) => s.rows).find((r) => r.key === selectedRowKey) || TABLE_SECTIONS[5].rows[4], [selectedRowKey]);
  const selectedRowValues = useMemo<RowEdit>(() => {
    return rowEdits[selectedRow.key] || {
      mat1: parseCompactNumber(selectedRow.mat1),
      mat2: parseCompactNumber(selectedRow.mat2),
      artefact: parseCompactNumber(selectedRow.artefact),
      tax: parseCompactNumber(selectedRow.tax),
      market: parseCompactNumber(selectedRow.market)
    };
  }, [rowEdits, selectedRow]);

  useEffect(() => {
    document.body.classList.add("crafting-calculator-body");
    document.body.classList.remove("landing-body");
    document.body.classList.remove("dashboard-body");
    document.body.classList.remove("bm-crafter");
    return () => {
      document.body.classList.remove("crafting-calculator-body");
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
        const next = encodeURIComponent(window.location.pathname || "/crafting-calculator");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const profile = await authService.getUserProfile().catch(() => {
        const currentUser = session.user;
        if (!currentUser) return null;
        const meta = (currentUser.user_metadata || {}) as Record<string, unknown>;
        const regionRaw = String(meta.region || "").toLowerCase();
        const normalizedRegion = regionRaw === "eu" || regionRaw === "us" ? (regionRaw as MarketRegion) : null;
        return {
          id: currentUser.id,
          email: currentUser.email || null,
          emailConfirmed: Boolean(currentUser.email_confirmed_at),
          avatar: typeof meta.avatar === "string" ? meta.avatar : null,
          region: normalizedRegion
        };
      });
      if (cancelled) return;
      if (!profile?.emailConfirmed) {
        await authService.signOut().catch(() => undefined);
        const next = encodeURIComponent(window.location.pathname || "/crafting-calculator");
        window.location.href = `/login?next=${next}`;
        return;
      }
      const safeRegion = readStoredRegion() || profile.region || "eu";
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
  }, [authService, setRegion]);

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
    (async () => {
      try {
        const response = await fetch("/items-categorized-crafting.json");
        if (!response.ok) return;
        const payload = await response.json();
        const categories = Array.isArray(payload?.categories) ? payload.categories : [];
        const items = categories.flatMap((category: { items?: CraftingItem[] }) => (Array.isArray(category.items) ? category.items : []));
        setAllItems(items);
        const defaultItem = items.find((item: CraftingItem) => item.id === "2H_BOW") || items[0] || null;
        setSelectedItem(defaultItem);
        setSearchTerm(defaultItem?.name || "");
      } catch {
        setAllItems([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`/data/materials-cities-${region}.json`);
        if (!response.ok) {
          setMaterialPriceMap(new Map());
          return;
        }
        const payload = (await response.json()) as MaterialsCityPayload;
        const map = new Map<string, Record<string, number>>();
        const items = Array.isArray(payload.items) ? payload.items : [];
        items.forEach((entry) => {
          if (entry?.itemId) map.set(entry.itemId, entry.prices || {});
        });
        setMaterialPriceMap(map);
      } catch {
        setMaterialPriceMap(new Map());
      }
    })();
  }, [region]);

  useEffect(() => {
    if (!selectedItem) {
      setMaterialState([]);
      return;
    }

    const baseMaterials = Array.isArray(selectedItem.materials) ? selectedItem.materials : [];
    const next: MaterialDraft[] = [];

    baseMaterials.forEach((mat, index) => {
      const source = mat.itemId || mat.id || mat.name || "";
      const name = String(source).trim();
      if (!name) return;
      next.push({
        key: `${selectedItem.id}-${name}-${index}`,
        name: name.replace(/_/g, " "),
        qty: Number(mat.qty) || 0,
        price: 0
      });
    });

    if (selectedItem.artifactId || selectedItem.artifact) {
      const artifactName = String(selectedItem.artifact || selectedItem.artifactId || "Artifact").replace(/_/g, " ");
      next.push({ key: `${selectedItem.id}-artifact`, name: artifactName, qty: 1, price: 0 });
    }

    setMaterialState(next);
  }, [selectedItem]);

  useEffect(() => {
    if (!materialState.length) return;
    const city = getCurrentCity();
    const { tier, enchant } = parseTierEnchant(selectedRow.uid);

    setMaterialState((prev) =>
      prev.map((mat) => {
        if (mat.key.endsWith("-artifact")) return mat;
        const normalized = mat.name.toUpperCase().replace(/\s+/g, "_").replace(/^T\d+_/, "").replace(/^T\d+/, "");
        if (!MATERIAL_BASES.has(normalized)) return mat;
        const itemId = buildMaterialItemId(normalized, tier, enchant);
        if (!itemId) return mat;
        const price = resolvePriceByCity(materialPriceMap.get(itemId), city);
        return { ...mat, price };
      })
    );
  }, [selectedRow.uid, materialPriceMap]);

  useEffect(() => {
    if (!selectedItem || !materialPriceMap.size) return;
    const currentCity = getCurrentCity();
    const baseMaterials = (Array.isArray(selectedItem.materials) ? selectedItem.materials : [])
      .map((mat) => String(mat.itemId || mat.id || mat.name || "").trim())
      .map((name) => name.toUpperCase().replace(/\s+/g, "_").replace(/^T\d+_/, "").replace(/^T\d+/, ""))
      .filter((name) => MATERIAL_BASES.has(name))
      .slice(0, 2);
    const quantities = (Array.isArray(selectedItem.materials) ? selectedItem.materials : []).map((mat) => Number(mat.qty) || 0);

    if (!baseMaterials.length) return;

    setRowEdits((prev) => {
      const next = { ...prev };
      TABLE_SECTIONS.flatMap((section) => section.rows).forEach((row) => {
        const { tier, enchant } = parseTierEnchant(row.uid);
        const mat1Id = buildMaterialItemId(baseMaterials[0], tier, enchant);
        const mat2Id = baseMaterials[1] ? buildMaterialItemId(baseMaterials[1], tier, enchant) : null;
        const mat1 = resolvePriceByCity(mat1Id ? materialPriceMap.get(mat1Id) : undefined, currentCity) * (quantities[0] || 0);
        const mat2 = resolvePriceByCity(mat2Id ? materialPriceMap.get(mat2Id) : undefined, currentCity) * (quantities[1] || 0);
        const current = next[row.key] || {
          mat1: parseCompactNumber(row.mat1),
          mat2: parseCompactNumber(row.mat2),
          artefact: parseCompactNumber(row.artefact),
          tax: parseCompactNumber(row.tax),
          market: parseCompactNumber(row.market)
        };
        next[row.key] = {
          ...current,
          mat1: mat1 > 0 ? mat1 : current.mat1,
          mat2: mat2 > 0 ? mat2 : current.mat2
        };
      });
      return next;
    });
  }, [selectedItem, materialPriceMap, region]);

  const totals = useMemo(() => {
    const netCost = materialState.reduce((sum, mat) => sum + (Number(mat.qty) || 0) * (Number(mat.price) || 0), 0);
    const profit = (Number(selectedRowValues.market) || 0) - (Number(selectedRowValues.tax) || 0) - netCost;
    const roi = netCost > 0 ? (profit / netCost) * 100 : 0;
    return { netCost, profit, roi };
  }, [materialState, selectedRowValues.market, selectedRowValues.tax]);
  const focusValue = useMemo(() => parseCompactNumber(selectedRow.focus), [selectedRow.focus]);
  const roiBarWidth = useMemo(() => `${Math.max(0, Math.min(100, Math.abs(totals.roi)))}%`, [totals.roi]);

  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return allItems.filter((item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)).slice(0, 15);
  }, [allItems, searchTerm]);

  async function onRegionSave(next: MarketRegion) {
    setRegion(next);
    setUser((prev) => (prev ? { ...prev, region: next } : prev));
    if (!authService) return;
    await authService.updateUserMetadata({ region: next }).catch(() => undefined);
  }

  async function onAvatarChange(next: string) {
    if (!authService || !user) return;
    const avatar = sanitizeAvatarUrl(next);
    await authService.updateUserMetadata({ avatar }).catch(() => undefined);
    localStorage.setItem("avatar", avatar);
    profileChannelRef.current?.postMessage({ type: "avatar", value: avatar });
    setUser({ ...user, avatar });
  }

  async function onResetPassword() {
    if (!authService || !user?.email) return;
    setAccountActionMsg("");
    const { error } = await authService.client.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/login?next=%2Fcrafting-calculator`
    });
    if (error) {
      setAccountActionMsg(error.message || "Password reset failed.");
      return;
    }
    setAccountActionMsg("Email sent");
    window.setTimeout(() => setAccountActionMsg(""), 3000);
  }

  async function onLogout() {
    if (!authService) return;
    await authService.signOut().catch(() => undefined);
    setUser(null);
    setShowAccount(false);
    window.location.href = "/login?next=%2Fcrafting-calculator";
  }

  async function confirmRegionSwitch() {
    setShowRegionConfirm(false);
    const next = pendingRegion ?? (region === "eu" ? "us" : "eu");
    setPendingRegion(null);
    await onRegionSave(next);
  }

  function updateRowField(rowKey: string, field: keyof RowEdit, rawValue: string) {
    const parsed = Math.max(0, parseCompactNumber(rawValue));
    setRowEdits((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || { mat1: 0, mat2: 0, artefact: 0, tax: 0, market: 0 }),
        [field]: parsed
      }
    }));
  }

  function onUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gatePasswordInput === configuredGatePassword) {
      sessionStorage.setItem("ccPasswordUnlocked", "1");
      setIsPasswordUnlocked(true);
      setGateError("");
      setGatePasswordInput("");
      return;
    }
    setGateError("Incorrect password.");
  }

  if (!isPasswordUnlocked) {
    return (
      <div className="cc-page cc-gate-page">
        <div className="cc-gate-backdrop" />
        <div className="cc-gate-modal" role="dialog" aria-modal="true" aria-labelledby="ccGateTitle">
          <h2 id="ccGateTitle">Crafting Calculator</h2>
          <p>This feature is still in development and currently password-protected.</p>
          <form onSubmit={onUnlockSubmit} className="cc-gate-form">
            <input
              type="password"
              value={gatePasswordInput}
              onChange={(event) => {
                setGatePasswordInput(event.target.value);
                if (gateError) setGateError("");
              }}
              placeholder="Enter access password"
              autoComplete="off"
            />
            <button type="submit">Unlock</button>
          </form>
          {gateError ? <div className="cc-gate-error">{gateError}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="cc-page">
      <div className={`modal-overlay ${showRegionConfirm ? "open" : ""}`} aria-hidden={showRegionConfirm ? "false" : "true"}>
        <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="regionConfirmTitle">
          <h3 id="regionConfirmTitle">Switch region?</h3>
          <p>Do you really want to switch the region?</p>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={() => { setShowRegionConfirm(false); setPendingRegion(null); }}>Cancel</button>
            <button type="button" className="modal-btn primary" onClick={confirmRegionSwitch}>Switch</button>
          </div>
        </div>
      </div>

      <header className="bm-header">
        <div className="bm-header-row">
          <div className="bm-brand">
            <div className="bm-brand-home">
              <div className="bm-logo" aria-hidden="true">
                <img src={assetUrl("picture/testo ohne background.png")} alt="" />
              </div>
              <h1>RomulusKings Crafting Tools</h1>
            </div>
            <div className="bm-nav bm-nav-switch">
              <Link className="nav-tab" to="/">Home</Link>
              <Link className="nav-tab" to="/dashboard">Dashboard</Link>
              <Link className="nav-tab" to="/bm-crafter">Blackmarket Crafter</Link>
              <span className="nav-tab active">Crafting Calculator</span>
            </div>
          </div>
          <div className="bm-meta">
            <button className="bm-pill" type="button" onClick={() => { setPendingRegion(region === "eu" ? "us" : "eu"); setShowRegionConfirm(true); }}>
              <span className="material-symbols-outlined">language</span>
              Region: <span>{region.toUpperCase()}</span>
            </button>
            <div className="bm-status">
              <span className="pulse"></span>
              Last updated: <span>{new Date().toISOString().slice(11, 16)}</span>
            </div>
            <div className="account-wrap">
              <button ref={accountBtnRef} className="account-btn" type="button" onClick={() => setShowAccount(true)} aria-label="Account">
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
            {allowedAvatars.filter((src) => !src.includes("accountsymbol")).map((src) => (
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

      <div className="workbench-container">
        <main className="matrix-side">
          <table className="spreadsheet-table">
            <thead>
              <tr>
                <th>UID</th><th>Material 1</th><th>Material 2</th><th>Artefact</th><th>Tax + Fees</th><th>Market Value</th><th>Profit</th><th>Gain %</th><th>Focus</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_SECTIONS.map((section) => (
                <Fragment key={section.key}>
                  <tr className="tier-header-row" key={`${section.key}-head`}><td colSpan={9}><label><span className={`neon-strip ${section.stripClass}`}></span>{section.label}</label></td></tr>
                  {section.rows.map((row) => {
                    const selected = row.key === selectedRowKey;
                    const values = rowEdits[row.key] || {
                      mat1: parseCompactNumber(row.mat1),
                      mat2: parseCompactNumber(row.mat2),
                      artefact: parseCompactNumber(row.artefact),
                      tax: parseCompactNumber(row.tax),
                      market: parseCompactNumber(row.market)
                    };
                    const rowCost = values.mat1 + values.mat2 + values.artefact;
                    const rowProfit = values.market - values.tax - rowCost;
                    const rowGain = rowCost > 0 ? (rowProfit / rowCost) * 100 : 0;
                    return (
                      <tr key={row.key} className={`sub-row ${section.fogClass} ${selected ? "selected" : ""}`} onClick={() => setSelectedRowKey(row.key)}>
                        <td>{row.uid}</td>
                        <td className="mono-num editable-cell" contentEditable suppressContentEditableWarning onBlur={(e) => updateRowField(row.key, "mat1", e.currentTarget.textContent || "0")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}>{formatCompact(values.mat1)}</td>
                        <td className="mono-num editable-cell" contentEditable suppressContentEditableWarning onBlur={(e) => updateRowField(row.key, "mat2", e.currentTarget.textContent || "0")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}>{formatCompact(values.mat2)}</td>
                        <td className="mono-num editable-cell" contentEditable suppressContentEditableWarning onBlur={(e) => updateRowField(row.key, "artefact", e.currentTarget.textContent || "0")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}>{formatCompact(values.artefact)}</td>
                        <td className="mono-num editable-cell" contentEditable suppressContentEditableWarning onBlur={(e) => updateRowField(row.key, "tax", e.currentTarget.textContent || "0")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}>{formatCompact(values.tax)}</td>
                        <td className="mono-num editable-cell" contentEditable suppressContentEditableWarning onBlur={(e) => updateRowField(row.key, "market", e.currentTarget.textContent || "0")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}>{formatCompact(values.market)}</td>
                        <td className={`mono-num ${rowProfit >= 0 ? "value-positive" : "value-negative"}`}>{formatCompact(rowProfit)}</td>
                        <td className={`mono-num ${rowGain >= 0 ? "value-positive" : "value-negative"}`}>{rowGain.toFixed(1)}%</td>
                        <td className="mono-num">{row.focus}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </main>

        <aside className="detail-side">
          <div className="detail-grid-12">
            <div className="bento-card span-8">
              <span className="cc-caption">Selection Focus</span>
              <h2 id="selectedItemTitle">{selectedItem?.name || `Selected ${selectedRow.uid}`}</h2>
              <div className="badge-row">
                <span className="badge-chip">{selectedRow.uid}</span>
                <span className="badge-chip muted">{totals.roi >= 0 ? "PROFIT" : "LOSS"}</span>
              </div>
            </div>
            <div className="bento-card span-4 item-preview-card">
              <img
                className="cc-item-image"
                src={selectedItem ? `/itemicons/T4_${selectedItem.id}.png` : assetUrl("picture/accountsymbol.png")}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = assetUrl("picture/accountsymbol.png"); }}
                alt="item"
              />
            </div>
          </div>

          <div className="metric-grid-2">
            <div className="bento-card metric-card">
              <div className="cc-caption">ROI Analysis</div>
              <div className={`metric-value ${totals.roi >= 0 ? "profit-cell" : "loss-cell"}`}>
                {totals.roi >= 0 ? "+" : ""}{totals.roi.toFixed(1)}%
              </div>
              <div className="roi-track">
                <div className="roi-fill" style={{ width: roiBarWidth }} />
              </div>
            </div>

            <div className="bento-card metric-card">
              <div className="cc-caption">Focus Yield</div>
              <div className="metric-value profit-cell">{formatNumber(focusValue)}</div>
              <div className="metric-sub">Efficiency Tier</div>
            </div>
          </div>

          <div className="bento-card search-card">
            <div className="cc-caption">Item Search</div>
            <input className="detail-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search item" />
            {searchTerm ? (
              <div className="search-results">
                {searchResults.length ? searchResults.map((item) => (
                  <button key={item.id} className="search-result" onClick={() => { setSelectedItem(item); setSearchTerm(item.name); }}>
                    {item.name} ({item.id})
                  </button>
                )) : <div className="search-empty">No items found.</div>}
              </div>
            ) : null}
          </div>

          <div className="bento-card">
            <div className="cc-caption">Input Bill of Materials</div>
            <div id="materialInputs" className="material-inputs">
              {materialState.length ? materialState.map((mat) => (
                <div key={mat.key} className="mat-row">
                  <div>
                    <div className="mat-name">{mat.name}</div>
                    <div className="mat-qty">Qty: {mat.qty}</div>
                  </div>
                  <input className="detail-input" type="number" min={0} step={1} value={Math.round(mat.price)} onChange={(e) => {
                    const price = Number(e.target.value) || 0;
                    setMaterialState((prev) => prev.map((entry) => entry.key === mat.key ? { ...entry, price } : entry));
                  }} />
                  <div className="mat-line">{formatNumber(mat.qty * mat.price)}</div>
                </div>
              )) : <div className="search-empty">Choose an item to load materials.</div>}
            </div>

            <div className="cc-grid-2">
              <div>
                <div className="cc-caption">Market Value</div>
                <input className="detail-input" type="number" min={0} step={1} value={Math.round(selectedRowValues.market)} onChange={(e) => updateRowField(selectedRow.key, "market", e.target.value)} />
              </div>
              <div>
                <div className="cc-caption">Tax + Fees</div>
                <input className="detail-input" type="number" min={0} step={1} value={Math.round(selectedRowValues.tax)} onChange={(e) => updateRowField(selectedRow.key, "tax", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="bento-card totals">
            <div><span>Net Resource Cost</span><strong>{formatNumber(totals.netCost)}</strong></div>
            <div><span>Profit</span><strong className={totals.profit >= 0 ? "profit-cell" : "loss-cell"}>{totals.profit >= 0 ? "+" : ""}{formatNumber(totals.profit)}</strong></div>
            <div><span>ROI</span><strong className={totals.roi >= 0 ? "profit-cell" : "loss-cell"}>{totals.roi >= 0 ? "+" : ""}{totals.roi.toFixed(1)}%</strong></div>
          </div>

          <button className="execute-btn" type="button">
            EXECUTE MASTER CRAFT: {totals.profit >= 0 ? "+" : ""}{formatNumber(totals.profit)}
          </button>
        </aside>
      </div>
    </div>
  );
}
