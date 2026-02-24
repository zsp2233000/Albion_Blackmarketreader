async function ensureToolAuthOrRedirect(nextPath) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const timeoutMs = 6000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.supabase?.auth?.getSession && window.supabase?.auth?.getUser) break;
    await sleep(100);
  }

  const encodedNext = encodeURIComponent(nextPath || "/crafting-calculator");
  const redirectToLogin = () => {
    window.location.href = `/dashboard?next=${encodedNext}`;
  };

  if (!window.supabase?.auth?.getSession || !window.supabase?.auth?.getUser) {
    redirectToLogin();
    return false;
  }

  try {
    const { data } = await window.supabase.auth.getSession();
    if (!data?.session) {
      redirectToLogin();
      return false;
    }
    const userResp = await window.supabase.auth.getUser();
    const user = userResp?.data?.user;
    if (!user?.email_confirmed_at) {
      try { await window.supabase.auth.signOut(); } catch (_) {}
      redirectToLogin();
      return false;
    }
    return true;
  } catch (_) {
    redirectToLogin();
    return false;
  }
}
(function setupCraftingCalculatorHeader() {
  const regionToggle = document.getElementById("regionToggle");
  const regionLabel = document.getElementById("regionLabel");
  const lastUpdated = document.getElementById("lastUpdated");
  const regionConfirm = document.getElementById("regionConfirm");
  const regionConfirmYes = document.getElementById("regionConfirmYes");
  const regionCancel = document.getElementById("regionCancel");
  const accountBtn = document.getElementById("accountBtn");
  const accountMount = document.getElementById("accountMount");
  const avatarIcon = document.getElementById("avatarIcon");
  if (!regionToggle || !regionLabel || !accountBtn || !accountMount || !avatarIcon) return;

  const avatarFallback = "/picture/accountsymbol.png";
  let currentRegion = "eu";
  let pendingRegion = null;
  let accountPanel = null;
  let accountClose = null;
  let accountEmail = null;
  let profileAvatar = null;
  let regionSelectAccount = null;
  let resetPwBtn = null;
  let logoutBtn = null;
  let accountHandlersBound = false;
  let suppressBroadcast = false;
  let suppressAvatarBroadcast = false;

  const regionChannel = ("BroadcastChannel" in window)
    ? new BroadcastChannel("rk-region-sync")
    : null;
  const profileChannel = ("BroadcastChannel" in window)
    ? new BroadcastChannel("rk-profile-sync")
    : null;

  function getStoredRegion() {
    const stored = (localStorage.getItem("region") || "").toLowerCase();
    return stored === "us" || stored === "eu" ? stored : null;
  }

  function sanitizeAvatarUrl(value, fallback = avatarFallback) {
    if (!value) return fallback;
    const trimmed = String(value).trim();
    if (!trimmed) return fallback;
    try {
      const url = new URL(trimmed, window.location.origin);
      const allowedProtocols = new Set(["http:", "https:", "blob:"]);
      if (allowedProtocols.has(url.protocol)) {
        return url.href;
      }
    } catch (_) {
      return fallback;
    }
    return fallback;
  }

  function broadcastRegion(region) {
    if (!regionChannel || suppressBroadcast) return;
    regionChannel.postMessage({ type: "region", value: region });
  }

  function broadcastAvatar(avatar) {
    if (!profileChannel || suppressAvatarBroadcast) return;
    profileChannel.postMessage({ type: "avatar", value: avatar });
  }

  function updateLastUpdated(text) {
    if (!lastUpdated) return;
    if (text) {
      lastUpdated.textContent = text;
      return;
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    lastUpdated.textContent = `${hh}:${mm}`;
  }

  async function saveRegionToProfile() {
    if (!window.supabase?.auth?.getUser) return;
    try {
      const { data } = await window.supabase.auth.getUser();
      if (!data?.user) return;
      await window.supabase.auth.updateUser({ data: { region: currentRegion } });
    } catch (_) {
      // ignore profile save errors
    }
  }

  async function applyRegion(nextRegion) {
    currentRegion = nextRegion === "us" ? "us" : "eu";
    localStorage.setItem("region", currentRegion);
    regionLabel.textContent = currentRegion.toUpperCase();
    if (regionSelectAccount) {
      regionSelectAccount.value = currentRegion;
    }
    updateLastUpdated();
    if (!suppressBroadcast) {
      await saveRegionToProfile();
    }
    broadcastRegion(currentRegion);
    window.dispatchEvent(new CustomEvent("rk-region-changed", { detail: { region: currentRegion } }));
  }

  async function loadAccountPanel() {
    if (!accountPanel) {
      const res = await fetch(`/account-section/account.html?v=${Date.now()}`);
      if (!res.ok) return;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      accountMount.replaceChildren(...doc.body.childNodes);
      accountPanel = document.getElementById("accountPanel");
      accountClose = document.getElementById("accountClose");
      accountEmail = document.getElementById("accountEmail");
      profileAvatar = document.getElementById("profileAvatar");
      regionSelectAccount = document.getElementById("regionSelectAccount");
      resetPwBtn = document.getElementById("resetPw");
      logoutBtn = document.getElementById("logout");
    }
    if (regionSelectAccount) {
      regionSelectAccount.value = currentRegion;
    }
  }

  function bindAccountHandlers() {
    if (accountHandlersBound || !accountPanel) return;
    accountHandlersBound = true;

    accountBtn.onclick = () => {
      accountPanel.classList.add("open");
      document.body.classList.add("panel-open");
    };

    if (accountClose) {
      accountClose.onclick = () => {
        accountPanel.classList.remove("open");
        document.body.classList.remove("panel-open");
      };
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      accountPanel.classList.remove("open");
      document.body.classList.remove("panel-open");
    });

    document.addEventListener("click", (event) => {
      if (!accountPanel.contains(event.target) && !accountBtn.contains(event.target)) {
        accountPanel.classList.remove("open");
        document.body.classList.remove("panel-open");
      }
    });

    if (regionSelectAccount) {
      regionSelectAccount.onchange = (event) => {
        applyRegion(event.target.value);
      };
    }

    if (resetPwBtn && window.supabase?.auth?.resetPasswordForEmail) {
      resetPwBtn.onclick = async () => {
        if (!accountEmail) return;
        const email = accountEmail.textContent?.trim();
        if (!email || email === "-") return;
        try {
          await window.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/dashboard`
          });
          resetPwBtn.textContent = "Email sent";
          setTimeout(() => { resetPwBtn.textContent = "Change password"; }, 3000);
        } catch (_) {
          // ignore
        }
      };
    }

    if (logoutBtn && window.supabase?.auth?.signOut) {
      logoutBtn.onclick = async () => {
        try {
          await window.supabase.auth.signOut();
          window.location.href = "/dashboard";
        } catch (_) {
          window.location.href = "/dashboard";
        }
      };
    }

    accountPanel.querySelectorAll(".avatar-grid img").forEach((img) => {
      img.addEventListener("click", async () => {
        const next = sanitizeAvatarUrl(img.getAttribute("data-avatar"));
        avatarIcon.src = next;
        if (profileAvatar) profileAvatar.src = next;
        localStorage.setItem("avatar", next);
        broadcastAvatar(next);
        if (window.supabase?.auth?.updateUser) {
          try {
            await window.supabase.auth.updateUser({ data: { avatar: next } });
          } catch (_) {
            // ignore save errors
          }
        }
      });
    });
  }

  async function loadAccountProfile() {
    const cachedAvatar = localStorage.getItem("avatar");
    if (cachedAvatar) {
      const safeCached = sanitizeAvatarUrl(cachedAvatar || avatarFallback);
      avatarIcon.src = safeCached;
      if (profileAvatar) profileAvatar.src = safeCached;
    }

    if (!window.supabase?.auth?.getUser) return;
    try {
      const { data } = await window.supabase.auth.getUser();
      const avatar = sanitizeAvatarUrl(data?.user?.user_metadata?.avatar || avatarFallback);
      localStorage.setItem("avatar", avatar);
      avatarIcon.src = avatar;
      if (profileAvatar) profileAvatar.src = avatar;
      if (accountEmail) accountEmail.textContent = data?.user?.email || "-";
    } catch (_) {
      // ignore load errors
    }
  }

  regionToggle.addEventListener("click", () => {
    pendingRegion = currentRegion === "eu" ? "us" : "eu";
    if (regionConfirm) {
      regionConfirm.classList.add("open");
      regionConfirm.setAttribute("aria-hidden", "false");
    } else {
      applyRegion(pendingRegion);
      pendingRegion = null;
    }
  });

  if (regionConfirmYes && regionConfirm) {
    regionConfirmYes.addEventListener("click", () => {
      regionConfirm.classList.remove("open");
      regionConfirm.setAttribute("aria-hidden", "true");
      if (pendingRegion) {
        applyRegion(pendingRegion);
      }
      pendingRegion = null;
    });
  }

  if (regionCancel && regionConfirm) {
    regionCancel.addEventListener("click", () => {
      regionConfirm.classList.remove("open");
      regionConfirm.setAttribute("aria-hidden", "true");
      pendingRegion = null;
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== "region") return;
    const next = (event.newValue || "").toLowerCase();
    if (next !== "us" && next !== "eu") return;
    if (next === currentRegion) return;
    suppressBroadcast = true;
    applyRegion(next).finally(() => {
      suppressBroadcast = false;
    });
  });

  if (regionChannel) {
    regionChannel.onmessage = (event) => {
      const next = (event.data && event.data.value) || "";
      if (next !== "us" && next !== "eu") return;
      if (next === currentRegion) return;
      suppressBroadcast = true;
      applyRegion(next).finally(() => {
        suppressBroadcast = false;
      });
    };
  }

  if (profileChannel) {
    profileChannel.onmessage = (event) => {
      const next = (event.data && event.data.value) || "";
      if (!next) return;
      suppressAvatarBroadcast = true;
      const safe = sanitizeAvatarUrl(next || avatarFallback);
      avatarIcon.src = safe;
      if (profileAvatar) profileAvatar.src = safe;
      localStorage.setItem("avatar", safe);
      suppressAvatarBroadcast = false;
    };
  }

  (async () => {
    const allowed = await ensureToolAuthOrRedirect("/crafting-calculator");
    if (!allowed) return;

    let storedRegion = getStoredRegion();
    if (!storedRegion && window.supabase?.auth?.getUser) {
      try {
        const { data } = await window.supabase.auth.getUser();
        const metaRegion = (data?.user?.user_metadata?.region || "").toLowerCase();
        if (metaRegion === "us" || metaRegion === "eu") {
          localStorage.setItem("region", metaRegion);
          storedRegion = metaRegion;
        }
      } catch (_) {
        // ignore metadata errors
      }
    }

    if (storedRegion) {
      currentRegion = storedRegion;
    }

    regionLabel.textContent = currentRegion.toUpperCase();
    updateLastUpdated(localStorage.getItem("lastUpdatedText") || null);

    await loadAccountPanel();
    bindAccountHandlers();
    await loadAccountProfile();

    if (regionSelectAccount) {
      regionSelectAccount.value = currentRegion;
    }
  })();
})();

(function setupCraftingCalculatorWorkbench() {
  const itemSearchInput = document.getElementById("itemSearchInput");
  const itemSearchResults = document.getElementById("itemSearchResults");
  const selectedItemTitle = document.getElementById("selectedItemTitle");
  const selectedTierBadge = document.getElementById("selectedTierBadge");
  const selectedRarityBadge = document.getElementById("selectedRarityBadge");
  const selectedItemImage = document.getElementById("selectedItemImage");
  const materialInputs = document.getElementById("materialInputs");
  const marketValueInput = document.getElementById("marketValueInput");
  const taxValueInput = document.getElementById("taxValueInput");
  const netResourceCost = document.getElementById("netResourceCost");
  const profitValue = document.getElementById("profitValue");
  const roiValue = document.getElementById("roiValue");
  const roiBar = document.getElementById("roiBar");
  const focusYield = document.getElementById("focusYield");
  const effTier = document.getElementById("effTier");
  const executeCraftBtn = document.getElementById("executeCraftBtn");
  const tableRows = Array.from(document.querySelectorAll(".sub-row"));
  if (
    !itemSearchInput ||
    !itemSearchResults ||
    !selectedItemTitle ||
    !selectedTierBadge ||
    !selectedRarityBadge ||
    !selectedItemImage ||
    !materialInputs ||
    !marketValueInput ||
    !taxValueInput ||
    !netResourceCost ||
    !profitValue ||
    !roiValue ||
    !roiBar ||
    !focusYield ||
    !effTier ||
    !executeCraftBtn
  ) return;

  const FALLBACK_IMAGE = "/picture/accountsymbol.png";
  const ITEM_DATA_PATH = "/Blackmarket-Crafter/items-categorized-crafting.json";
  const MATERIAL_CITY_DATA_PATH = (region) => `/crafting-calculator/data/materials-cities-${region === "us" ? "us" : "eu"}.json`;
  const MATERIAL_BASES = new Set(["METALBAR", "PLANKS", "CLOTH", "LEATHER"]);
  const KNOWN_CITIES = ["Lymhurst", "Caerleon", "Bridgewatch", "Martlock", "Fort Sterling", "Thetford"];
  let allItems = [];
  let selectedItem = null;
  let selectedRow = tableRows.find((row) => row.classList.contains("selected")) || tableRows[0] || null;
  let materialState = [];
  const materialCityCache = { eu: null, us: null };

  function parseCompactNumber(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/,/g, "");
    if (!raw) return 0;
    if (raw.endsWith("k")) return Math.round(parseFloat(raw) * 1000) || 0;
    if (raw.endsWith("m")) return Math.round(parseFloat(raw) * 1000000) || 0;
    return Math.round(parseFloat(raw)) || 0;
  }

  function formatNumber(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-US").format(Math.round(num));
  }

  function formatCompact(value) {
    const num = Number(value) || 0;
    const abs = Math.abs(num);
    if (abs >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
    if (abs >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(Math.round(num));
  }

  function parseSignedCompactNumber(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/,/g, "");
    if (!raw) return 0;
    const sign = raw.startsWith("-") ? -1 : 1;
    const clean = raw.replace(/^[-+]/, "");
    if (clean.endsWith("k")) return sign * (parseFloat(clean) * 1000 || 0);
    if (clean.endsWith("m")) return sign * (parseFloat(clean) * 1000000 || 0);
    return sign * (parseFloat(clean) || 0);
  }

  function getCurrentRegion() {
    const region = (localStorage.getItem("region") || "").toLowerCase();
    return region === "us" ? "us" : "eu";
  }

  function normalizeCityName(raw) {
    const text = String(raw || "").trim().toLowerCase();
    if (!text || text === "all" || text === "all cities") return "ALL";
    const hit = KNOWN_CITIES.find((city) => city.toLowerCase() === text);
    return hit || "ALL";
  }

  function getCurrentCity() {
    const candidates = [
      localStorage.getItem("city"),
      localStorage.getItem("selectedCity"),
      localStorage.getItem("cityFilter"),
      localStorage.getItem("currentCity")
    ];
    for (const value of candidates) {
      const city = normalizeCityName(value);
      if (city !== "ALL") return city;
    }
    return "ALL";
  }

  function getTierEnchantFromUid(uid) {
    const m = String(uid || "").trim().match(/^T?(\d+)(?:\.(\d+))?/i);
    const tier = m ? Number(m[1]) : 4;
    const enchant = m && m[2] ? Number(m[2]) : 0;
    return {
      tier: Number.isFinite(tier) && tier > 0 ? tier : 4,
      enchant: Number.isFinite(enchant) && enchant >= 0 ? enchant : 0
    };
  }

  function materialBaseFromName(name) {
    const normalized = String(name || "")
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/^T\d+_/, "")
      .replace(/^T\d+/, "");
    return MATERIAL_BASES.has(normalized) ? normalized : null;
  }

  function buildMaterialItemId(base, tier, enchant) {
    if (!base || !MATERIAL_BASES.has(base)) return null;
    if (enchant > 0) return `T${tier}_${base}_LEVEL${enchant}@${enchant}`;
    return `T${tier}_${base}`;
  }

  function resolvePriceByCity(priceMap, city) {
    if (!priceMap || typeof priceMap !== "object") return 0;
    if (city !== "ALL") return Number(priceMap[city] || 0);
    const values = KNOWN_CITIES.map((c) => Number(priceMap[c] || 0)).filter((n) => n > 0);
    if (!values.length) return 0;
    return Math.min(...values);
  }

  async function loadMaterialCityData(region) {
    const key = region === "us" ? "us" : "eu";
    if (materialCityCache[key]) return materialCityCache[key];
    try {
      const res = await fetch(MATERIAL_CITY_DATA_PATH(key), { cache: "no-store" });
      if (!res.ok) throw new Error("Failed material city data fetch");
      const payload = await res.json();
      const map = new Map();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      items.forEach((entry) => {
        if (entry?.itemId) map.set(entry.itemId, entry.prices || {});
      });
      const parsed = { map, cities: Array.isArray(payload?.cities) ? payload.cities : KNOWN_CITIES };
      materialCityCache[key] = parsed;
      return parsed;
    } catch (_) {
      const empty = { map: new Map(), cities: KNOWN_CITIES };
      materialCityCache[key] = empty;
      return empty;
    }
  }

  async function applyAutoMaterialPrices() {
    if (!materialState.length) return;
    const region = getCurrentRegion();
    const currentCity = getCurrentCity();
    const data = await loadMaterialCityData(region);
    const { tier, enchant } = getTierEnchantFromUid(getRowValues(selectedRow).uid);

    materialState = materialState.map((mat) => {
      const base = materialBaseFromName(mat.name);
      if (!base) return { ...mat, price: Number(mat.price) || 0 };
      const itemId = buildMaterialItemId(base, tier, enchant);
      if (!itemId) return { ...mat, price: 0 };
      const prices = data.map.get(itemId);
      const price = resolvePriceByCity(prices, currentCity);
      return { ...mat, price: Number(price) || 0 };
    });

    recalcAndRenderTotals();
  }

  async function updateTableMaterialColumns() {
    if (!selectedItem || !tableRows.length) return;
    const region = getCurrentRegion();
    const currentCity = getCurrentCity();
    const data = await loadMaterialCityData(region);

    // Use only non-artifact materials for MATERIAL 1/2 columns.
    const baseMaterials = materialState
      .filter((mat) => !String(mat.key).endsWith("-artifact"))
      .map((mat) => ({ ...mat, base: materialBaseFromName(mat.name) }))
      .filter((mat) => !!mat.base);

    const artifactMaterial = materialState.find((mat) => String(mat.key).endsWith("-artifact")) || null;

    tableRows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (!cells || cells.length < 9) return;

      const { tier, enchant } = getTierEnchantFromUid(cells[0]?.textContent || "");
      const lineCosts = baseMaterials.map((mat) => {
        const itemId = buildMaterialItemId(mat.base, tier, enchant);
        const price = resolvePriceByCity(data.map.get(itemId), currentCity);
        return (Number(mat.qty) || 0) * (Number(price) || 0);
      });

      const mat1 = lineCosts[0] || 0;
      const mat2 = lineCosts[1] || 0;
      const artifact = artifactMaterial ? 0 : 0;
      const totalCost = lineCosts.reduce((sum, n) => sum + n, 0) + artifact;

      cells[1].textContent = formatCompact(mat1);
      cells[2].textContent = formatCompact(mat2);
      cells[3].textContent = formatCompact(artifact);
      cells[8].textContent = formatCompact(totalCost);
    });
  }

  function refreshMaterialPricing() {
    Promise.all([applyAutoMaterialPrices(), updateTableMaterialColumns()]).catch(() => {
      recalcAndRenderTotals();
    });
  }

  function updateProfitGainState(row) {
    if (!row) return;
    const cells = row.querySelectorAll("td");
    const profitCell = cells[6];
    const gainCell = cells[7];
    if (!profitCell || !gainCell) return;
    const profitVal = parseSignedCompactNumber(profitCell.textContent);
    const gainVal = parseSignedCompactNumber(String(gainCell.textContent).replace("%", ""));
    const positive = profitVal >= 0 && gainVal >= 0;
    const remove = positive ? "value-negative" : "value-positive";
    const add = positive ? "value-positive" : "value-negative";
    profitCell.classList.remove(remove);
    gainCell.classList.remove(remove);
    profitCell.classList.add(add);
    gainCell.classList.add(add);
  }

  function setImageFromItemId(itemId) {
    if (!itemId) {
      selectedItemImage.src = FALLBACK_IMAGE;
      return;
    }
    const candidate = `/itemicons/T4_${itemId}.png`;
    selectedItemImage.src = candidate;
    selectedItemImage.onerror = () => {
      selectedItemImage.onerror = null;
      selectedItemImage.src = FALLBACK_IMAGE;
    };
  }

  function getRowValues(row) {
    if (!row) return { tax: 0, market: 0, roi: 0, efficiency: 0, uid: "T?.?" };
    const cells = row.querySelectorAll("td");
    return {
      uid: cells[0]?.textContent?.trim() || "T?.?",
      tax: parseCompactNumber(cells[4]?.textContent),
      market: parseCompactNumber(cells[5]?.textContent),
      roi: parseFloat((cells[7]?.textContent || "0").replace("%", "")) || 0,
      efficiency: parseCompactNumber(cells[8]?.textContent)
    };
  }

  function setTierAndRarity(uid) {
    selectedTierBadge.textContent = `TIER_${uid || "8.4"}`;
    const enchant = String(uid || "").split(".")[1] || "0";
    const rarity = enchant === "4" ? "RELIC_GRADE" : enchant === "3" ? "ARTIFACT_GRADE" : "STANDARD_GRADE";
    selectedRarityBadge.textContent = rarity;
  }

  function calculateNetCost() {
    let total = 0;
    for (const mat of materialState) {
      const qty = Number(mat.qty) || 0;
      const unitPrice = Number(mat.price) || 0;
      total += qty * unitPrice;
    }
    return total;
  }

  function renderMaterialInputs() {
    if (!materialState.length) {
      materialInputs.innerHTML = `<div class="text-[11px] text-slate-500">No materials for this item.</div>`;
      return;
    }
    materialInputs.innerHTML = "";
    for (const mat of materialState) {
      const row = document.createElement("div");
      row.className = "grid grid-cols-[1fr_90px_140px] gap-2 items-end";
      row.innerHTML = `
        <div>
          <div class="text-[11px] text-slate-300">${mat.name}</div>
          <div class="text-[8px] text-slate-500 uppercase">Qty: ${mat.qty}</div>
        </div>
        <div>
          <div class="text-[8px] text-slate-500 uppercase font-bold mb-1">Unit</div>
          <input class="detail-input mat-price" type="number" min="0" step="1" value="${Math.max(0, Math.round(mat.price || 0))}" data-key="${mat.key}">
        </div>
        <div>
          <div class="text-[8px] text-slate-500 uppercase font-bold mb-1">Line Cost</div>
          <div class="detail-input !py-[9px]">${formatNumber((Number(mat.price) || 0) * (Number(mat.qty) || 0))}</div>
        </div>
      `;
      materialInputs.appendChild(row);
    }
    materialInputs.querySelectorAll(".mat-price").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.getAttribute("data-key");
        const target = materialState.find((mat) => mat.key === key);
        if (!target) return;
        target.price = Number(input.value) || 0;
        recalcAndRenderTotals();
      });
    });
  }

  function updateEffTier(efficiency) {
    if (efficiency >= 900) effTier.textContent = "S-CLASS";
    else if (efficiency >= 500) effTier.textContent = "A-CLASS";
    else if (efficiency >= 200) effTier.textContent = "B-CLASS";
    else effTier.textContent = "C-CLASS";
  }

  function recalcAndRenderTotals() {
    renderMaterialInputs();
    const market = Number(marketValueInput.value) || 0;
    const tax = Number(taxValueInput.value) || 0;
    const netCost = calculateNetCost();
    const profit = market - tax - netCost;
    const roi = netCost > 0 ? (profit / netCost) * 100 : 0;
    netResourceCost.textContent = formatNumber(netCost);
    profitValue.textContent = `${profit >= 0 ? "+" : ""}${formatNumber(profit)}`;
    roiValue.textContent = `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
    roiBar.style.width = `${Math.max(0, Math.min(100, Math.abs(roi)))}%`;
    if (profit >= 0) {
      roiValue.classList.remove("text-red-400");
      roiValue.classList.add("text-profit-text");
    } else {
      roiValue.classList.remove("text-profit-text");
      roiValue.classList.add("text-red-400");
    }
  }

  function applyRowSelection(row) {
    if (!row) return;
    tableRows.forEach((entry) => entry.classList.remove("selected"));
    row.classList.add("selected");
    selectedRow = row;
    const values = getRowValues(row);
    setTierAndRarity(values.uid);
    marketValueInput.value = values.market || 0;
    taxValueInput.value = values.tax || 0;
    focusYield.textContent = formatNumber(values.efficiency || 0);
    updateEffTier(values.efficiency || 0);
    if (!selectedItem) {
      selectedItemTitle.textContent = `Selected ${values.uid}`;
    }
    if (selectedItem && materialState.length) {
      refreshMaterialPricing();
    } else {
      recalcAndRenderTotals();
    }
  }

  function normalizeItemMaterials(item) {
    const rawMaterials = Array.isArray(item?.materials) ? item.materials : [];
    const normalized = [];

    rawMaterials.forEach((mat, index) => {
      const sourceId = mat?.itemId || mat?.id || mat?.name || "";
      const materialId = String(sourceId).trim();
      if (!materialId) return;

      const qty = Number(mat?.qty);
      normalized.push({
        key: `${item.id}-${materialId}-${index}`,
        name: materialId.replaceAll("_", " "),
        qty: Number.isFinite(qty) && qty >= 0 ? qty : 0,
        price: 0
      });
    });

    // Some entries only provide artifact label; include it as single required input.
    if (item?.artifactId || item?.artifact) {
      const artifactId = String(item.artifactId || item.artifact || "").trim();
      if (artifactId) {
        normalized.push({
          key: `${item.id}-artifact`,
          name: String(item.artifact || artifactId).replaceAll("_", " "),
          qty: 1,
          price: 0
        });
      }
    }

    return normalized;
  }

  function applySelectedItem(item) {
    if (!item) return;
    selectedItem = item;
    selectedItemTitle.textContent = item.name || item.id || "Selected Item";
    setImageFromItemId(item.id);
    materialState = normalizeItemMaterials(item);
    refreshMaterialPricing();
  }

  function renderSearchResults(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) {
      itemSearchResults.classList.add("hidden");
      itemSearchResults.innerHTML = "";
      return;
    }
    const matches = allItems
      .filter((item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      .slice(0, 15);
    if (!matches.length) {
      itemSearchResults.classList.remove("hidden");
      itemSearchResults.innerHTML = `<div class="px-3 py-2 text-[11px] text-slate-500">No items found.</div>`;
      return;
    }
    itemSearchResults.classList.remove("hidden");
    itemSearchResults.innerHTML = "";
    for (const item of matches) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-result";
      btn.textContent = `${item.name} (${item.id})`;
      btn.addEventListener("click", () => {
        itemSearchInput.value = item.name;
        itemSearchResults.classList.add("hidden");
        applySelectedItem(item);
      });
      itemSearchResults.appendChild(btn);
    }
  }

  async function loadItems() {
    try {
      const response = await fetch(ITEM_DATA_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load items");
      const payload = await response.json();
      const categories = Array.isArray(payload?.categories) ? payload.categories : [];
      allItems = categories.flatMap((category) => Array.isArray(category.items) ? category.items : []);
    } catch (_) {
      allItems = [];
    }
  }

  function bindUi() {
    tableRows.forEach((row) => {
      row.addEventListener("click", () => applyRowSelection(row));
      updateProfitGainState(row);

      const cells = Array.from(row.querySelectorAll("td"));
      cells.forEach((cell, idx) => {
        // Keep UID, PROFIT and GAIN% static; allow inline editing for other columns.
        if (idx === 0 || idx === 6 || idx === 7) return;
        cell.contentEditable = "true";
        cell.spellcheck = false;
        cell.classList.add("editable-cell");
        const originalValue = () => cell.textContent || "";

        cell.addEventListener("focus", () => {
          cell.dataset.beforeEdit = originalValue();
          applyRowSelection(row);
        });
        cell.addEventListener("click", (event) => {
          event.stopPropagation();
          applyRowSelection(row);
        });
        cell.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            cell.blur();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            if (typeof cell.dataset.beforeEdit === "string") {
              cell.textContent = cell.dataset.beforeEdit;
            }
            cell.blur();
          }
        });
        cell.addEventListener("blur", () => {
          const trimmed = (cell.textContent || "").trim();
          cell.textContent = trimmed || (cell.dataset.beforeEdit || "0");
          updateProfitGainState(row);
          if (selectedRow === row) {
            applyRowSelection(row);
          }
        });
      });
    });

    itemSearchInput.addEventListener("input", (event) => {
      renderSearchResults(event.target.value);
    });
    document.addEventListener("click", (event) => {
      if (!itemSearchResults.contains(event.target) && event.target !== itemSearchInput) {
        itemSearchResults.classList.add("hidden");
      }
    });
    marketValueInput.addEventListener("input", recalcAndRenderTotals);
    taxValueInput.addEventListener("input", recalcAndRenderTotals);
    executeCraftBtn.addEventListener("click", () => {
      executeCraftBtn.style.transform = "scale(0.985)";
      setTimeout(() => {
        executeCraftBtn.style.transform = "";
      }, 180);
    });

    window.addEventListener("rk-region-changed", () => {
      refreshMaterialPricing();
    });

    window.addEventListener("storage", (event) => {
      if (event.key === "region" || event.key === "city" || event.key === "selectedCity" || event.key === "cityFilter") {
        refreshMaterialPricing();
      }
    });
  }

  (async () => {
    const allowed = await ensureToolAuthOrRedirect("/crafting-calculator");
    if (!allowed) return;

    bindUi();
    await loadItems();
    applyRowSelection(selectedRow);
    const defaultItem = allItems.find((item) => item.id === "2H_BOW") || allItems[0] || null;
    if (defaultItem) {
      itemSearchInput.value = defaultItem.name;
      applySelectedItem(defaultItem);
    } else {
      setImageFromItemId(null);
      recalcAndRenderTotals();
    }
  })();
})();
