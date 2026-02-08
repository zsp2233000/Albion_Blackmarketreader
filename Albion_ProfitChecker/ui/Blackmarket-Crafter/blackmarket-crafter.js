(function setupCrafterTable() {
  const regionToggle = document.getElementById("regionToggle");
  const regionLabel = document.getElementById("regionLabel");
  const lastUpdated = document.getElementById("lastUpdated");
  const tableBody = document.getElementById("bmTableBody");
  const tableSummary = document.getElementById("tableSummary");
  const tableWrap = document.querySelector(".table-wrap");
  const tierFilter = document.getElementById("tierFilter");
  const enchantFilter = document.getElementById("enchantFilter");
  const soldRange = document.getElementById("soldRange");
  const soldValue = document.getElementById("soldValue");
  const returnRateInput = document.getElementById("returnRateInput");
  const returnRateValue = document.getElementById("returnRateValue");
  const bonusCityToggle = document.getElementById("bonusCityToggle");
  const itemSearch = document.getElementById("itemSearch");
  const sliderFill = document.querySelector(".slider-fill");
  const sliderThumb = document.querySelector(".slider-thumb");
  const regionConfirm = document.getElementById("regionConfirm");
  const regionConfirmYes = document.getElementById("regionConfirmYes");
  const regionCancel = document.getElementById("regionCancel");
  const materialList = document.getElementById("materialList");
  const materialTotal = document.getElementById("materialTotal");
  const artefactRow = document.getElementById("artefactRow");
  const artefactName = document.getElementById("artefactName");
  const artefactQty = document.getElementById("artefactQty");
  const artefactPrice = document.getElementById("artefactPrice");
  const accountBtn = document.getElementById("accountBtn");
  const accountMount = document.getElementById("accountMount");
  const avatarIcon = document.getElementById("avatarIcon");
  if (!regionToggle || !regionLabel || !lastUpdated || !tableBody || !tableSummary || !tierFilter || !enchantFilter || !soldRange || !soldValue || !returnRateInput || !returnRateValue || !itemSearch) return;

  let currentRegion = "eu";
  let pendingRegion = null;
  let allItems = [];
  let materialMap = new Map();
  let artefactMap = new Map();
  let recipeMap = new Map();
  let selectedTier = null;
  let selectedEnchant = null;
  let minSold = 0;
  let returnRate = 0.1525;
  let searchTerm = "";
  let filteredItems = [];
  let visibleCount = 0;
  const batchSize = 60;
  const avatarFallback = "/picture/accountsymbol.png";
  let accountPanel = null;
  let accountClose = null;
  let accountEmail = null;
  let profileAvatar = null;
  let regionSelectAccount = null;
  let resetPwBtn = null;
  let logoutBtn = null;
  let accountHandlersBound = false;

  const nameMap = {
    "OFF_SHIELD": "Beginner's Shield",
    "OFF_TOWERSHIELD_UNDEAD": "Sarcophagus",
    "OFF_SHIELD_HELL": "Caitiff Shield",
    "OFF_SPIKEDSHIELD_MORGANA": "Facebreaker",
    "OFF_SHIELD_AVALON": "Astral Aegis",
    "OFF_SHIELD_CRYSTAL": "Unbreakable Ward",
    "OFF_BOOK": "Tome of Spells",
    "OFF_ORB_MORGANA": "Eye of Secrets",
    "OFF_DEMONSKULL_HELL": "Muisak",
    "OFF_TOTEM_KEEPER": "Taproot",
    "OFF_CENSER_AVALON": "Celestial Censer",
    "OFF_TOME_CRYSTAL": "Timelocked Grimoire",
    "OFF_TORCH": "Torch",
    "OFF_HORN_KEEPER": "Mistcaller",
    "OFF_TALISMAN_AVALON": "Sacred Scepter",
    "OFF_LAMP_UNDEAD": "Cryptcandle",
    "OFF_JESTERCANE_HELL": "Leering Cane",
    "OFF_TORCH_CRYSTAL": "Blueflame Torch",
    "HEAD_PLATE_SET1": "Soldier Helmet",
    "ARMOR_PLATE_SET1": "Soldier Armor",
    "SHOES_PLATE_SET1": "Soldier Boots",
    "HEAD_PLATE_SET2": "Knight Helmet",
    "ARMOR_PLATE_SET2": "Knight Armor",
    "SHOES_PLATE_SET2": "Knight Boots",
    "HEAD_PLATE_SET3": "Guardian Helmet",
    "ARMOR_PLATE_SET3": "Guardian Armor",
    "SHOES_PLATE_SET3": "Guardian Boots",
    "HEAD_PLATE_UNDEAD": "Graveguard Helmet",
    "ARMOR_PLATE_UNDEAD": "Graveguard Armor",
    "SHOES_PLATE_UNDEAD": "Graveguard Boots",
    "HEAD_PLATE_HELL": "Demon Helmet",
    "ARMOR_PLATE_HELL": "Demon Armor",
    "SHOES_PLATE_HELL": "Demon Boots",
    "HEAD_PLATE_KEEPER": "Judicator Helmet",
    "ARMOR_PLATE_KEEPER": "Judicator Armor",
    "SHOES_PLATE_KEEPER": "Judicator Boots",
    "HEAD_PLATE_FEY": "Duskweaver Helmet",
    "ARMOR_PLATE_FEY": "Duskweaver Armor",
    "SHOES_PLATE_FEY": "Duskweaver Boots",
    "HEAD_PLATE_AVALON": "Helmet of Valor",
    "ARMOR_PLATE_AVALON": "Armor of Valor",
    "SHOES_PLATE_AVALON": "Boots of Valor",
    "HEAD_LEATHER_SET1": "Beginner's Mercenary Hood",
    "ARMOR_LEATHER_SET1": "Beginner's Mercenary Jacket",
    "SHOES_LEATHER_SET1": "Beginner's Mercenary Shoes",
    "HEAD_LEATHER_SET2": "Hunter Hood",
    "ARMOR_LEATHER_SET2": "Hunter Jacket",
    "SHOES_LEATHER_SET2": "Hunter Shoes",
    "HEAD_LEATHER_SET3": "Assassin Hood",
    "ARMOR_LEATHER_SET3": "Assassin Jacket",
    "SHOES_LEATHER_SET3": "Assassin Shoes",
    "HEAD_LEATHER_MORGANA": "Stalker Hood",
    "ARMOR_LEATHER_MORGANA": "Stalker Jacket",
    "SHOES_LEATHER_MORGANA": "Stalker Shoes",
    "HEAD_LEATHER_HELL": "Hellion Hood",
    "ARMOR_LEATHER_HELL": "Hellion Jacket",
    "SHOES_LEATHER_HELL": "Hellion Shoes",
    "HEAD_LEATHER_UNDEAD": "Specter Hood",
    "ARMOR_LEATHER_UNDEAD": "Specter Jacket",
    "SHOES_LEATHER_UNDEAD": "Specter Shoes",
    "HEAD_LEATHER_FEY": "Mistwalker Hood",
    "ARMOR_LEATHER_FEY": "Mistwalker Jacket",
    "SHOES_LEATHER_FEY": "Mistwalker Shoes",
    "HEAD_LEATHER_AVALON": "Hood of Tenacity",
    "ARMOR_LEATHER_AVALON": "Jacket of Tenacity",
    "SHOES_LEATHER_AVALON": "Shoes of Tenacity",
    "HEAD_CLOTH_SET1": "Scholar Cowl",
    "ARMOR_CLOTH_SET1": "Scholar Robe",
    "SHOES_CLOTH_SET1": "Scholar Sandals",
    "HEAD_CLOTH_SET2": "Cleric Cowl",
    "ARMOR_CLOTH_SET2": "Cleric Robe",
    "SHOES_CLOTH_SET2": "Cleric Sandals",
    "HEAD_CLOTH_SET3": "Mage Cowl",
    "ARMOR_CLOTH_SET3": "Mage Robe",
    "SHOES_CLOTH_SET3": "Mage Sandals",
    "HEAD_CLOTH_KEEPER": "Druid Cowl",
    "ARMOR_CLOTH_KEEPER": "Druid Robe",
    "SHOES_CLOTH_KEEPER": "Druid Sandals",
    "HEAD_CLOTH_HELL": "Fiend Cowl",
    "ARMOR_CLOTH_HELL": "Fiend Robe",
    "SHOES_CLOTH_HELL": "Fiend Sandals",
    "HEAD_CLOTH_MORGANA": "Cultist Cowl",
    "ARMOR_CLOTH_MORGANA": "Cultist Robe",
    "SHOES_CLOTH_MORGANA": "Cultist Sandals",
    "HEAD_CLOTH_FEY": "Feyscale Hat",
    "ARMOR_CLOTH_FEY": "Feyscale Robe",
    "SHOES_CLOTH_FEY": "Feyscale Sandals",
    "HEAD_CLOTH_AVALON": "Cowl of Purity",
    "ARMOR_CLOTH_AVALON": "Robe of Purity",
    "SHOES_CLOTH_AVALON": "Sandals of Purity",
    "HEAD_CLOTH_ROYAL": "Royal Cowl",
    "ARMOR_CLOTH_ROYAL": "Royal Robe",
    "SHOES_CLOTH_ROYAL": "Royal Sandals",
    "HEAD_LEATHER_ROYAL": "Royal Hood",
    "ARMOR_LEATHER_ROYAL": "Royal Jacket",
    "SHOES_LEATHER_ROYAL": "Royal Shoes",
    "HEAD_PLATE_ROYAL": "Royal Helmet",
    "ARMOR_PLATE_ROYAL": "Royal Armor",
    "SHOES_PLATE_ROYAL": "Royal Boots",
    "HEAD_GATHERER_FIBER": "Harvester Cap",
    "ARMOR_GATHERER_FIBER": "Harvester Garb",
    "SHOES_GATHERER_FIBER": "Harvester Workboots",
    "HEAD_GATHERER_HIDE": "Skinner Cap",
    "ARMOR_GATHERER_HIDE": "Skinner Garb",
    "SHOES_GATHERER_HIDE": "Skinner Workboots",
    "HEAD_GATHERER_ORE": "Miner Cap",
    "ARMOR_GATHERER_ORE": "Miner Garb",
    "SHOES_GATHERER_ORE": "Miner Workboots",
    "HEAD_GATHERER_ROCK": "Quarrier Cap",
    "ARMOR_GATHERER_ROCK": "Quarrier Garb",
    "SHOES_GATHERER_ROCK": "Quarrier Workboots",
    "HEAD_GATHERER_WOOD": "Lumberjack Cap",
    "ARMOR_GATHERER_WOOD": "Lumberjack Garb",
    "SHOES_GATHERER_WOOD": "Lumberjack Workboots",
    "HEAD_GATHERER_FISH": "Fisherman Cap",
    "ARMOR_GATHERER_FISH": "Fisherman Garb",
    "SHOES_GATHERER_FISH": "Fisherman Workboots",
    "2H_BOW": "Bow",
    "2H_WARBOW": "Warbow",
    "2H_LONGBOW": "Longbow",
    "2H_LONGBOW_UNDEAD": "Whispering Bow",
    "2H_BOW_HELL": "Wailing Bow",
    "2H_BOW_KEEPER": "Bow of Badon",
    "2H_BOW_AVALON": "Mistpiercer",
    "2H_BOW_CRYSTAL": "Skystrider Bow",
    "2H_CROSSBOW": "Crossbow",
    "2H_CROSSBOWLARGE": "Heavy Crossbow",
    "MAIN_1HCROSSBOW": "Light Crossbow",
    "2H_REPEATINGCROSSBOW_UNDEAD": "Weeping Repeater",
    "2H_DUALCROSSBOW_HELL": "Boltcasters",
    "2H_CROSSBOWLARGE_MORGANA": "Siegebow",
    "2H_CROSSBOW_CANNON_AVALON": "Energy Shaper",
    "2H_DUALCROSSBOW_CRYSTAL": "Arclight Blasters",
    "MAIN_CURSEDSTAFF": "Cursed Staff",
    "2H_CURSEDSTAFF": "Great Cursed Staff",
    "2H_DEMONICSTAFF": "Demonic Staff",
    "MAIN_CURSEDSTAFF_UNDEAD": "Lifecurse Staff",
    "2H_SKULLORB_HELL": "Cursed Skull",
    "2H_CURSEDSTAFF_MORGANA": "Damnation Staff",
    "MAIN_CURSEDSTAFF_AVALON": "Shadowcaller",
    "MAIN_CURSEDSTAFF_CRYSTAL": "Rotcaller Staff",
    "MAIN_FIRESTAFF": "Fire Staff",
    "2H_FIRESTAFF": "Great Fire Staff",
    "2H_INFERNOSTAFF": "Infernal Staff",
    "MAIN_FIRESTAFF_KEEPER": "Wildfire Staff",
    "2H_FIRESTAFF_HELL": "Brimstone Staff",
    "2H_INFERNOSTAFF_MORGANA": "Blazing Staff",
    "2H_FIRE_RINGPAIR_AVALON": "Dawnsong",
    "MAIN_FIRESTAFF_CRYSTAL": "Flamewalker Staff",
    "MAIN_FROSTSTAFF": "Frost Staff",
    "2H_FROSTSTAFF": "Great Frost Staff",
    "2H_GLACIALSTAFF": "Glacial Staff",
    "MAIN_FROSTSTAFF_KEEPER": "Hoarfrost Staff",
    "2H_ICEGAUNTLETS_HELL": "Icicle Staff",
    "2H_ICECRYSTAL_UNDEAD": "Permafrost Prism",
    "MAIN_FROSTSTAFF_AVALON": "Chillhowl",
    "2H_FROSTSTAFF_CRYSTAL": "Arctic Staff",
    "MAIN_ARCANESTAFF": "Arcane Staff",
    "2H_ARCANESTAFF": "Great Arcane Staff",
    "2H_ENIGMATICSTAFF": "Enigmatic Staff",
    "MAIN_ARCANESTAFF_UNDEAD": "Witchwork Staff",
    "2H_ARCANESTAFF_HELL": "Occult Staff",
    "2H_ENIGMATICORB_MORGANA": "Malevolent Locus",
    "2H_ARCANE_RINGPAIR_AVALON": "Evensong",
    "2H_ARCANESTAFF_CRYSTAL": "Astral Staff",
    "MAIN_HOLYSTAFF": "Holy Staff",
    "2H_HOLYSTAFF": "Great Holy Staff",
    "2H_DIVINESTAFF": "Divine Staff",
    "MAIN_HOLYSTAFF_MORGANA": "Lifetouch Staff",
    "2H_HOLYSTAFF_HELL": "Fallen Staff",
    "2H_HOLYSTAFF_UNDEAD": "Redemption Staff",
    "MAIN_HOLYSTAFF_AVALON": "Hallowfall",
    "2H_HOLYSTAFF_CRYSTAL": "Exalted Staff",
    "MAIN_NATURESTAFF": "Nature Staff",
    "2H_NATURESTAFF": "Great Nature Staff",
    "2H_WILDSTAFF": "Wild Staff",
    "MAIN_NATURESTAFF_KEEPER": "Druidic Staff",
    "2H_NATURESTAFF_HELL": "Blight Staff",
    "2H_NATURESTAFF_KEEPER": "Rampant Staff",
    "MAIN_NATURESTAFF_AVALON": "Ironroot Staff",
    "MAIN_NATURESTAFF_CRYSTAL": "Forgebark Staff",
    "MAIN_DAGGER": "Dagger",
    "2H_DAGGERPAIR": "Dagger Pair",
    "2H_CLAWPAIR": "Claws",
    "MAIN_RAPIER_MORGANA": "Bloodletter",
    "MAIN_DAGGER_HELL": "Demonfang",
    "2H_IRONGAUNTLETS_HELL": "Black Hands",
    "2H_DUALSICKLE_UNDEAD": "Deathgivers",
    "2H_DAGGER_KATAR_AVALON": "Bridled Fury",
    "2H_DAGGERPAIR_CRYSTAL": "Twin Slayers",
    "MAIN_SPEAR": "Spear",
    "2H_SPEAR": "Pike",
    "2H_GLAIVE": "Glaive",
    "MAIN_SPEAR_KEEPER": "Heron Spear",
    "2H_HARPOON_HELL": "Spirithunter",
    "2H_TRIDENT_UNDEAD": "Trinity Spear",
    "MAIN_SPEAR_LANCE_AVALON": "Daybreaker",
    "2H_GLAIVE_CRYSTAL": "Rift Glaive",
    "MAIN_AXE": "Battleaxe",
    "2H_AXE": "Greataxe",
    "2H_HALBERD": "Halberd",
    "2H_HALBERD_MORGANA": "Carrioncaller",
    "2H_SCYTHE_HELL": "Infernal Scythe",
    "2H_DUALAXE_KEEPER": "Bear Paws",
    "2H_AXE_AVALON": "Realmbreaker",
    "2H_SCYTHE_CRYSTAL": "Crystal Reaper",
    "MAIN_SWORD": "Beginner's Broadsword",
    "2H_CLAYMORE": "Claymore",
    "2H_DUALSWORD": "Dual Swords",
    "MAIN_SCIMITAR_MORGANA": "Clarent Blade",
    "2H_CLEAVER_HELL": "Carving Sword",
    "2H_DUALSCIMITAR_UNDEAD": "Galatine Pair",
    "2H_CLAYMORE_AVALON": "Kingmaker",
    "MAIN_SWORD_CRYSTAL": "Infinity Blade",
    "2H_QUARTERSTAFF": "Quarterstaff",
    "2H_IRONCLADEDSTAFF": "Iron-clad Staff",
    "2H_DOUBLEBLADEDSTAFF": "Double Bladed Staff",
    "2H_COMBATSTAFF_MORGANA": "Black Monk Stave",
    "2H_TWINSCYTHE_HELL": "Soulscythe",
    "2H_ROCKSTAFF_KEEPER": "Staff of Balance",
    "2H_QUARTERSTAFF_AVALON": "Grailseeker",
    "2H_DOUBLEBLADEDSTAFF_CRYSTAL": "Phantom Twinblade",
    "MAIN_HAMMER": "Hammer",
    "2H_POLEHAMMER": "Polehammer",
    "2H_HAMMER": "Great Hammer",
    "2H_HAMMER_UNDEAD": "Tombhammer",
    "2H_DUALHAMMER_HELL": "Forge Hammers",
    "2H_RAM_KEEPER": "Grovekeeper",
    "2H_HAMMER_AVALON": "Hand of Justice",
    "2H_HAMMER_CRYSTAL": "Truebolt Hammer",
    "MAIN_MACE": "Mace",
    "2H_MACE": "Heavy Mace",
    "2H_FLAIL": "Morning Star",
    "MAIN_ROCKMACE_KEEPER": "Bedrock Mace",
    "MAIN_MACE_HELL": "Incubus Mace",
    "2H_MACE_MORGANA": "Camlann Mace",
    "2H_DUALMACE_AVALON": "Oathkeepers",
    "MAIN_MACE_CRYSTAL": "Dreadstorm Monarch",
    "2H_KNUCKLES_SET1": "Brawler Gloves",
    "2H_KNUCKLES_SET2": "Battle Bracers",
    "2H_KNUCKLES_SET3": "Spiked Gauntlets",
    "2H_KNUCKLES_KEEPER": "Ursine Maulers",
    "2H_KNUCKLES_HELL": "Hellfire Hands",
    "2H_KNUCKLES_MORGANA": "Ravenstrike Cestus",
    "2H_KNUCKLES_AVALON": "Fists of Avalon",
    "2H_KNUCKLES_CRYSTAL": "Forcepulse Bracers",
    "2H_SHAPESHIFTER_SET1": "Prowling Staff",
    "2H_SHAPESHIFTER_SET2": "Rootbound Staff",
    "2H_SHAPESHIFTER_SET3": "Primal Staff",
    "2H_SHAPESHIFTER_MORGANA": "Bloodmoon Staff",
    "2H_SHAPESHIFTER_HELL": "Hellspawn Staff",
    "2H_SHAPESHIFTER_KEEPER": "Earthrune Staff",
    "2H_SHAPESHIFTER_AVALON": "Lightcaller",
    "2H_SHAPESHIFTER_CRYSTAL": "Stillgaze Staff"
  };

  function formatNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return "--";
    return value.toLocaleString("de-DE");
  }

  function parseTier(id) {
    const match = String(id || "").match(/^T(\d+)_/);
    return match ? Number(match[1]) : null;
  }

  function parseEnchant(id) {
    const match = String(id || "").match(/@(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function normalizeItemId(id) {
    return String(id || "").replace(/^T\d+_/, "").replace(/@\d+$/, "");
  }

  function getRecipe(id) {
    const key = normalizeItemId(id);
    return recipeMap.get(key) || null;
  }

  function buildMaterialId(base, tier, enchant) {
    if (!base || !tier) return null;
    if (Number.isFinite(enchant) && enchant > 0) {
      return `T${tier}_${base}_LEVEL${enchant}@${enchant}`;
    }
    return `T${tier}_${base}`;
  }

  function getMaterialPrice(name, tier, enchant) {
    if (!name) return null;
    const fullKey = buildMaterialId(name, tier, enchant);
    if (fullKey && materialMap.has(fullKey)) return materialMap.get(fullKey);
    if (materialMap.has(name)) return materialMap.get(name);
    return null;
  }

  function buildArtefactId(artefactId, tier) {
    if (!artefactId || !tier) return null;
    return `T${tier}_${artefactId}`;
  }

  function getArtefactPrice(artefactId, tier) {
    const key = buildArtefactId(artefactId, tier);
    if (key && artefactMap.has(key)) return artefactMap.get(key);
    return null;
  }

  const materialNameMap = {
    "METALBAR": "Metal Bars",
    "PLANKS": "Planks",
    "CLOTH": "Cloth",
    "LEATHER": "Leather"
  };

  function formatMaterialLabel(key, tier, enchant) {
    const base = materialNameMap[key] || key || "Material";
    const tierLabel = tier ? `T${tier}` : "";
    const enchantLabel = Number.isFinite(enchant) ? `.${enchant}` : "";
    return `${tierLabel} ${base} ${enchantLabel}`.trim();
  }

  function renderMaterialBreakdown(item) {
    if (!materialList || !materialTotal) return;
    materialList.replaceChildren();
    materialTotal.textContent = "Total: --";
    if (artefactRow) {
      artefactRow.setAttribute("aria-hidden", "true");
    }

    const recipe = getRecipe(item.id);
    if (!recipe || !Array.isArray(recipe.materials)) return;
    const tier = parseTier(item.id);
    const enchant = parseEnchant(item.id);
    let sum = 0;
    let hasPrice = false;

    recipe.materials.forEach((mat) => {
      const materialKey = mat.itemId || mat.name;
      const unit = getMaterialPrice(materialKey, tier, enchant);
      const qty = Number(mat.qty || 0);
      const row = document.createElement("div");
      row.className = "material-row";
      const name = document.createElement("div");
      name.className = "material-name";
      name.textContent = formatMaterialLabel(materialKey, tier, enchant);
      const meta = document.createElement("div");
      meta.className = "material-meta";
      const qtyEl = document.createElement("span");
      qtyEl.className = "material-qty";
      qtyEl.textContent = `x${qty}`;
      const priceEl = document.createElement("span");
      priceEl.className = "material-price";
      if (typeof unit === "number") {
        const total = unit * qty;
        priceEl.textContent = formatNumber(Math.round(total));
        sum += total;
        hasPrice = true;
      } else {
        priceEl.textContent = "--";
      }
      meta.appendChild(qtyEl);
      meta.appendChild(priceEl);
      row.appendChild(name);
      row.appendChild(meta);
      materialList.appendChild(row);

      const unitRow = document.createElement("div");
      unitRow.className = "material-row material-unit-row";
      const unitName = document.createElement("div");
      unitName.className = "material-name";
      unitName.textContent = `${formatMaterialLabel(materialKey, tier, enchant)} · Unit`;
      const unitMeta = document.createElement("div");
      unitMeta.className = "material-meta";
      const unitQty = document.createElement("span");
      unitQty.className = "material-qty";
      unitQty.textContent = "x1";
      const unitPrice = document.createElement("span");
      unitPrice.className = "material-price";
      unitPrice.textContent = typeof unit === "number" ? formatNumber(Math.round(unit)) : "--";
      unitMeta.appendChild(unitQty);
      unitMeta.appendChild(unitPrice);
      unitRow.appendChild(unitName);
      unitRow.appendChild(unitMeta);
      materialList.appendChild(unitRow);
    });

    if (hasPrice) {
      let craftCost = sum;
      if (recipe.artifactId) {
        const artefactPrice = getArtefactPrice(recipe.artifactId, tier);
        if (Number.isFinite(artefactPrice)) {
          craftCost += artefactPrice;
        }
      }
      craftCost = craftCost * (1 - returnRate);
      materialTotal.textContent = `Total: ${formatNumber(Math.round(craftCost))}`;
    }

    if (recipe.artifactId && artefactRow && artefactName && artefactQty && artefactPrice) {
      const artefactLabel = recipe.artifact || recipe.artifactId;
      artefactName.textContent = artefactLabel;
      artefactQty.textContent = "x1";
      const price = getArtefactPrice(recipe.artifactId, tier);
      artefactPrice.textContent = Number.isFinite(price) ? formatNumber(Math.round(price)) : "--";
      artefactRow.setAttribute("aria-hidden", "false");
    }
  }

  function renderEmpty() {
    tableBody.replaceChildren();
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No data loaded yet.";
    row.appendChild(cell);
    tableBody.appendChild(row);
    tableSummary.textContent = "Showing 0 items";
  }

  function renderRows(items, reset = false) {
    if (reset) {
      tableBody.replaceChildren();
      visibleCount = 0;
    }
    if (!items.length) {
      renderEmpty();
      return;
    }
    if (visibleCount >= items.length) return;
    const list = items.slice(visibleCount, visibleCount + batchSize);
    list.forEach((item, idx) => {
      const row = document.createElement("tr");
      row.className = `high-density-row${(visibleCount + idx) % 2 ? " alt" : ""}`;
      row.addEventListener("click", () => updateInsight(item));

      const baseId = normalizeItemId(item.id);

      const nameCell = document.createElement("td");
      const nameWrap = document.createElement("div");
      nameWrap.className = "item";
      const infoWrap = document.createElement("div");
      infoWrap.className = "item-info";
      const icon = document.createElement("div");
      icon.className = "item-icon";
      const iconImg = document.createElement("img");
      iconImg.loading = "lazy";
      iconImg.alt = "";
      iconImg.decoding = "async";
      iconImg.src = `/itemicons/T4_${baseId}.png`;
      iconImg.addEventListener("error", () => {
        iconImg.remove();
      });
      icon.appendChild(iconImg);
      const tier = document.createElement("span");
      tier.className = "item-tier";
      const itemTier = parseTier(item.id);
      const itemEnchant = parseEnchant(item.id);
      tier.textContent = itemTier ? `T${itemTier}.${itemEnchant}` : "--";
      icon.appendChild(tier);
      const meta = document.createElement("div");
      const name = document.createElement("div");
      name.className = "item-name";
      name.textContent = nameMap[baseId] || baseId || "Unknown Item";
      const sub = document.createElement("div");
      sub.className = "item-meta";
      sub.textContent = `${currentRegion.toUpperCase()} • ${baseId || "--"}`;
      meta.appendChild(name);
      meta.appendChild(sub);
      infoWrap.appendChild(icon);
      infoWrap.appendChild(meta);
      const tierBadge = document.createElement("span");
      tierBadge.className = "item-tier-pill";
      if (itemTier) {
        tierBadge.setAttribute("data-tier", String(itemTier));
      }
      if (itemEnchant) {
        tierBadge.setAttribute("data-enchant", String(itemEnchant));
      }
      tierBadge.textContent = itemTier ? `T${itemTier}.${itemEnchant}` : "--";
      nameWrap.appendChild(infoWrap);
      nameWrap.appendChild(tierBadge);
      nameCell.appendChild(nameWrap);

      const bmCell = document.createElement("td");
      bmCell.className = "num";
      bmCell.textContent = formatNumber(item.bm);

      const craftCell = document.createElement("td");
      craftCell.className = "num muted";
      const recipe = getRecipe(item.id);
      let craftCost = Number.isFinite(item._craftCost) ? item._craftCost : null;
      if (!Number.isFinite(craftCost) && recipe && Array.isArray(recipe.materials)) {
        let sum = 0;
        let hasPrice = false;
        const itemTier = parseTier(item.id);
        const itemEnchant = parseEnchant(item.id);
        for (const mat of recipe.materials) {
          const materialKey = mat.itemId || mat.name;
          const unit = getMaterialPrice(materialKey, itemTier, itemEnchant);
          if (typeof unit === "number") {
            sum += unit * Number(mat.qty || 0);
            hasPrice = true;
          }
        }
        if (hasPrice) {
          if (recipe.artifactId) {
            const artefactPrice = getArtefactPrice(recipe.artifactId, itemTier);
            if (!Number.isFinite(artefactPrice)) {
              craftCost = null;
            } else {
              craftCost = (sum + artefactPrice) * (1 - returnRate);
            }
          } else {
            craftCost = sum * (1 - returnRate);
          }
        }
      }
      craftCell.textContent = Number.isFinite(craftCost) ? formatNumber(Math.round(craftCost)) : "--";

      const profitCell = document.createElement("td");
      profitCell.className = "num";
      const profitValue = Number.isFinite(item._profit) ? item._profit : null;
      if (Number.isFinite(craftCost) && Number.isFinite(item.bm)) {
        const profit = Number.isFinite(profitValue) ? profitValue : (item.bm - craftCost);
        profitCell.textContent = formatNumber(Math.round(profit));
        profitCell.classList.toggle("profit", profit > 0);
        profitCell.classList.toggle("loss", profit < 0);
      } else {
        profitCell.textContent = "--";
      }

      const soldCell = document.createElement("td");
      soldCell.className = "center";
      const soldPill = document.createElement("span");
      soldPill.className = "pill";
      soldPill.textContent = item.sold ?? "--";
      soldCell.appendChild(soldPill);

      const dailyCell = document.createElement("td");
      dailyCell.className = "num";
      if (Number.isFinite(craftCost) && Number.isFinite(item.bm) && Number.isFinite(item.sold)) {
        const profit = Number.isFinite(profitValue) ? profitValue : (item.bm - craftCost);
        const daily = profit * item.sold;
        dailyCell.textContent = formatNumber(Math.round(daily));
        dailyCell.classList.toggle("profit", daily > 0);
        dailyCell.classList.toggle("loss", daily < 0);
      } else {
        dailyCell.textContent = "--";
      }

      const percentCell = document.createElement("td");
      percentCell.className = "num";
      if (Number.isFinite(craftCost) && craftCost > 0 && Number.isFinite(item.bm)) {
        const profit = Number.isFinite(profitValue) ? profitValue : (item.bm - craftCost);
        const pct = Number.isFinite(item._profitPct) ? item._profitPct : ((profit / craftCost) * 100);
        percentCell.textContent = `${pct.toFixed(1)}%`;
        percentCell.classList.toggle("profit", pct > 0);
        percentCell.classList.toggle("loss", pct < 0);
      } else {
        percentCell.textContent = "--";
      }

      row.appendChild(nameCell);
      row.appendChild(bmCell);
      row.appendChild(craftCell);
      row.appendChild(profitCell);
      row.appendChild(soldCell);
      row.appendChild(dailyCell);
      row.appendChild(percentCell);
      tableBody.appendChild(row);
    });
    visibleCount += list.length;
    tableSummary.textContent = `Showing ${visibleCount} of ${items.length} items`;
  }

  const insightName = document.getElementById("insightName");
  const insightTier = document.getElementById("insightTier");
  const insightRegion = document.getElementById("insightRegion");
  const insightBm = document.getElementById("insightBm");
  const insightSold = document.getElementById("insightSold");
  const insightId = document.getElementById("insightId");
  const insightIcon = document.getElementById("insightIcon");
  const insightHero = document.getElementById("insightHero");
  const insightIconWrap = document.getElementById("insightIconWrap");
  const insightCraft = document.getElementById("insightCraft");
  const insightProfit = document.getElementById("insightProfit");
  const insightProfitPct = document.getElementById("insightProfitPct");
  const insightDaily = document.getElementById("insightDaily");

  function updateInsight(item) {
    if (!insightName) return;
    const tier = parseTier(item.id);
    const enchant = parseEnchant(item.id);
    const baseId = normalizeItemId(item.id);
    insightName.textContent = nameMap[baseId] || baseId || "Unknown Item";
    insightTier.textContent = tier ? `Tier ${tier}.${enchant}` : "Tier --";
    insightRegion.textContent = currentRegion.toUpperCase();
    insightBm.textContent = formatNumber(item.bm);
    insightSold.textContent = item.sold ?? "--";
    insightId.textContent = item.id || "--";
    if (insightHero) {
      if (tier) {
        insightHero.setAttribute("data-tier", String(tier));
      } else {
        insightHero.removeAttribute("data-tier");
      }
    }
    if (insightIconWrap) {
      if (enchant) {
        insightIconWrap.setAttribute("data-enchant", String(enchant));
      } else {
        insightIconWrap.removeAttribute("data-enchant");
      }
    }
    if (insightIcon) {
      insightIcon.src = baseId ? `/itemicons/T4_${baseId}.png` : "";
      insightIcon.addEventListener("error", () => {
        insightIcon.removeAttribute("src");
      }, { once: true });
    }
    if (insightCraft) insightCraft.textContent = "--";
    if (insightProfit) insightProfit.textContent = "--";
    if (insightProfitPct) insightProfitPct.textContent = "--";
    if (insightDaily) insightDaily.textContent = "--";

    const recipe = getRecipe(item.id);
    if (recipe && Array.isArray(recipe.materials) && Number.isFinite(item.bm)) {
      const itemTier = parseTier(item.id);
      const itemEnchant = parseEnchant(item.id);
      let sum = 0;
      let hasPrice = false;
      for (const mat of recipe.materials) {
        const materialKey = mat.itemId || mat.name;
        const unit = getMaterialPrice(materialKey, itemTier, itemEnchant);
        if (typeof unit === "number") {
          sum += unit * Number(mat.qty || 0);
          hasPrice = true;
        }
      }
      if (hasPrice) {
        let craftCost = sum;
        if (recipe.artifactId) {
          const artefactPrice = getArtefactPrice(recipe.artifactId, itemTier);
          if (Number.isFinite(artefactPrice)) {
            craftCost += artefactPrice;
          } else {
            craftCost = null;
          }
        }
        if (!Number.isFinite(craftCost)) return;
        craftCost = craftCost * (1 - returnRate);
        const profit = item.bm - craftCost;
        const daily = Number.isFinite(item.sold) ? profit * item.sold : null;
        if (insightCraft) insightCraft.textContent = formatNumber(Math.round(craftCost));
        if (insightProfit) {
          insightProfit.textContent = formatNumber(Math.round(profit));
          insightProfit.classList.toggle("profit", profit > 0);
          insightProfit.classList.toggle("loss", profit < 0);
        }
        if (insightProfitPct && craftCost > 0) {
          const pct = (profit / craftCost) * 100;
          insightProfitPct.textContent = `${pct.toFixed(1)}%`;
          insightProfitPct.classList.toggle("profit", pct > 0);
          insightProfitPct.classList.toggle("loss", pct < 0);
        }
        if (insightDaily && daily !== null) {
          insightDaily.textContent = formatNumber(Math.round(daily));
          insightDaily.classList.toggle("profit", daily > 0);
          insightDaily.classList.toggle("loss", daily < 0);
        }
      }
    }
    renderMaterialBreakdown(item);
  }

  function applyFilters() {
    const filtered = allItems.filter((item) => {
      const idValue = item.id || "";
      if (/_ROYAL(\b|_)/i.test(idValue)) return false;
      if (/SHAPESHIFTER/i.test(idValue)) return false;
      const tier = parseTier(item.id);
      const enchant = parseEnchant(item.id);
      if (selectedTier !== null && tier !== selectedTier) return false;
      if (selectedEnchant !== null && enchant !== selectedEnchant) return false;
      const sold = Number(item.sold || 0);
      if (sold < minSold) return false;
      if (searchTerm) {
        const baseId = normalizeItemId(item.id);
        const recipe = getRecipe(item.id);
        const displayName = nameMap[baseId] || (recipe && recipe.name) || baseId || "";
        if (!String(displayName).toLowerCase().includes(searchTerm)) return false;
      }
      const recipe = getRecipe(item.id);
      if (!recipe || !Array.isArray(recipe.materials) || !Number.isFinite(item.bm)) return false;
      let sum = 0;
      let hasPrice = false;
      for (const mat of recipe.materials) {
        const materialKey = mat.itemId || mat.name;
        const unit = getMaterialPrice(materialKey, tier, enchant);
        if (typeof unit === "number") {
          sum += unit * Number(mat.qty || 0);
          hasPrice = true;
        }
      }
      if (!hasPrice) return false;
      let craftCost = sum;
      if (recipe.artifactId) {
        const artefactPrice = getArtefactPrice(recipe.artifactId, tier);
        if (!Number.isFinite(artefactPrice)) return false;
        craftCost += artefactPrice;
      }
      craftCost = craftCost * (1 - returnRate);
      const profit = item.bm - craftCost;
      if (!Number.isFinite(profit) || profit < 0) return false;
      const profitPct = craftCost > 0 ? (profit / craftCost) * 100 : null;
      item._craftCost = craftCost;
      item._profit = profit;
      item._profitPct = Number.isFinite(profitPct) ? profitPct : null;
      return true;
    });
    filteredItems = [...filtered].sort((a, b) => {
      const aPct = Number.isFinite(a._profitPct) ? a._profitPct : -Infinity;
      const bPct = Number.isFinite(b._profitPct) ? b._profitPct : -Infinity;
      return bPct - aPct;
    });
    if (tableWrap) tableWrap.scrollTop = 0;
    renderRows(filteredItems, true);
    if (filteredItems.length) {
      updateInsight(filteredItems[0]);
    } else {
      updateInsight({ id: "--", bm: null, sold: null });
    }
  }

  function setActive(container, attr, value) {
    container.querySelectorAll(".chip").forEach((chip) => {
      const match = chip.getAttribute(attr) === String(value);
      chip.classList.toggle("active", match);
    });
  }

  function updateSlider() {
    soldValue.textContent = `${minSold}+`;
    const max = Number(soldRange.max) || 200;
    const ratio = max ? Math.min(1, minSold / max) : 0;
    sliderFill.style.width = `${ratio * 100}%`;
    sliderThumb.style.left = `${ratio * 100}%`;
  }

  function updateReturnRate() {
    const raw = Number(returnRateInput.value || 15.25);
    const clamped = Math.max(15.25, Math.min(60, raw));
    returnRate = clamped / 100;
    returnRateInput.value = clamped;
    returnRateValue.textContent = `${clamped}%`;
  }

  async function fetchJsonWithFallback(paths) {
    for (const path of paths) {
      try {
        const res = await fetch(`${path}?v=${Date.now()}`);
        if (!res.ok) continue;
        return await res.json();
      } catch (_) {
        // try next path
      }
    }
    return null;
  }

  function buildLocalUrl(file) {
    const base = window.location.href.endsWith("/") ? window.location.href : `${window.location.href}/`;
    return new URL(file, base).toString();
  }

  async function loadMaterials(region) {
    const dataPath = region === "us"
      ? "/Blackmarket-Crafter/data/materials-us.json"
      : "/Blackmarket-Crafter/data/materials-eu.json";
    const relativePath = region === "us"
      ? "./data/materials-us.json"
      : "./data/materials-eu.json";
    const localPath = region === "us"
      ? buildLocalUrl("data/materials-us.json")
      : buildLocalUrl("data/materials-eu.json");
    const legacyPath = region === "us"
      ? "/Blackmarket-Crafter/materials-us.json"
      : "/Blackmarket-Crafter/materials-eu.json";
    try {
      const payload = await fetchJsonWithFallback([dataPath, localPath, relativePath, legacyPath]);
      if (!payload) throw new Error("materials load failed");
      const items = Array.isArray(payload.items) ? payload.items : [];
      const grouped = new Map();
      items.forEach((row) => {
        const price = Number(row.price);
        if (!row.itemId || !Number.isFinite(price)) return;
        const list = grouped.get(row.itemId) || [];
        list.push(price);
        grouped.set(row.itemId, list);
      });
      materialMap = new Map();
      grouped.forEach((prices, key) => {
        const avg = prices.reduce((sum, v) => sum + v, 0) / prices.length;
        materialMap.set(key, avg);
      });
    } catch (_) {
      materialMap = new Map();
    }
  }

  async function loadArtefacts(region) {
    const dataPath = region === "us"
      ? "/Blackmarket-Crafter/data/artefacts-us.json"
      : "/Blackmarket-Crafter/data/artefacts-eu.json";
    const relativePath = region === "us"
      ? "./data/artefacts-us.json"
      : "./data/artefacts-eu.json";
    const localPath = region === "us"
      ? buildLocalUrl("data/artefacts-us.json")
      : buildLocalUrl("data/artefacts-eu.json");
    try {
      const payload = await fetchJsonWithFallback([dataPath, localPath, relativePath]);
      if (!payload) throw new Error("artefacts load failed");
      const items = Array.isArray(payload.items) ? payload.items : [];
      const grouped = new Map();
      items.forEach((row) => {
        const price = Number(row.price);
        if (!row.itemId || !Number.isFinite(price)) return;
        const list = grouped.get(row.itemId) || [];
        list.push(price);
        grouped.set(row.itemId, list);
      });
      artefactMap = new Map();
      grouped.forEach((prices, key) => {
        const avg = prices.reduce((sum, v) => sum + v, 0) / prices.length;
        artefactMap.set(key, avg);
      });
    } catch (_) {
      artefactMap = new Map();
    }
  }

  async function loadRecipes() {
    const file = "/Blackmarket-Crafter/items-categorized-crafting.json";
    const relativeFile = "./items-categorized-crafting.json";
    const localFile = buildLocalUrl("items-categorized-crafting.json");
    try {
      const payload = await fetchJsonWithFallback([file, localFile, relativeFile]);
      if (!payload) throw new Error("recipes load failed");
      const map = new Map();
      (payload.categories || []).forEach((cat) => {
        (cat.items || []).forEach((item) => {
          if (item.id && item.materials) {
            map.set(item.id, item);
          }
        });
      });
      recipeMap = map;
    } catch (_) {
      recipeMap = new Map();
    }
  }

  function getStoredRegion() {
    const stored = (localStorage.getItem("region") || "").toLowerCase();
    return stored === "us" || stored === "eu" ? stored : null;
  }

  function sanitizeAvatarUrl(value, fallback = avatarFallback) {
    if (!value) return fallback;
    const trimmed = String(value).trim();
    if (!trimmed) return fallback;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("file:")) {
      return fallback;
    }
    try {
      const url = new URL(trimmed, window.location.origin);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") {
        return url.href;
      }
    } catch (_) {
      return fallback;
    }
    return fallback;
  }

  async function loadAccountPanel() {
    if (!accountMount) return;
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
    if (accountBtn) {
      accountBtn.onclick = () => {
        accountPanel.classList.add("open");
        document.body.classList.add("panel-open");
      };
    }
    if (accountClose) {
      accountClose.onclick = () => {
        accountPanel.classList.remove("open");
        document.body.classList.remove("panel-open");
      };
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        accountPanel.classList.remove("open");
        document.body.classList.remove("panel-open");
      }
    });
    document.addEventListener("click", (event) => {
      if (!accountPanel.contains(event.target) && !accountBtn?.contains(event.target)) {
        accountPanel.classList.remove("open");
        document.body.classList.remove("panel-open");
      }
    });
    if (regionSelectAccount) {
      regionSelectAccount.onchange = (event) => {
        loadRegion(event.target.value);
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
        if (avatarIcon) avatarIcon.src = next;
        if (profileAvatar) profileAvatar.src = next;
        localStorage.setItem("avatar", next);
        broadcastAvatar(next);
        if (window.supabase?.auth?.updateUser) {
          try {
            await window.supabase.auth.updateUser({ data: { avatar: next } });
          } catch (_) {
            // ignore profile save errors
          }
        }
      });
    });
  }

  async function loadAccountProfile() {
    const cachedAvatar = localStorage.getItem("avatar");
    if (cachedAvatar) {
      const safeCached = sanitizeAvatarUrl(cachedAvatar || avatarFallback);
      if (avatarIcon) avatarIcon.src = safeCached;
      if (profileAvatar) profileAvatar.src = safeCached;
    }
    if (!window.supabase?.auth?.getUser) return;
    try {
      const { data } = await window.supabase.auth.getUser();
      const avatar = sanitizeAvatarUrl(data?.user?.user_metadata?.avatar || avatarFallback);
      localStorage.setItem("avatar", avatar);
      if (avatarIcon) avatarIcon.src = avatar;
      if (profileAvatar) profileAvatar.src = avatar;
      if (accountEmail) accountEmail.textContent = data?.user?.email || "-";
    } catch (_) {
      // ignore profile load errors
    }
  }

  const regionChannel = ("BroadcastChannel" in window)
    ? new BroadcastChannel("rk-region-sync")
    : null;
  const profileChannel = ("BroadcastChannel" in window)
    ? new BroadcastChannel("rk-profile-sync")
    : null;
  let suppressBroadcast = false;
  let suppressAvatarBroadcast = false;

  function broadcastRegion(region) {
    if (!regionChannel || suppressBroadcast) return;
    regionChannel.postMessage({ type: "region", value: region });
  }
  function broadcastAvatar(avatar) {
    if (!profileChannel || suppressAvatarBroadcast) return;
    profileChannel.postMessage({ type: "avatar", value: avatar });
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

  async function loadRegion(region) {
    currentRegion = region === "us" ? "us" : "eu";
    localStorage.setItem("region", currentRegion);
    regionLabel.textContent = currentRegion.toUpperCase();
    if (regionSelectAccount) regionSelectAccount.value = currentRegion;
    const dataPath = currentRegion === "us"
      ? "/Blackmarket-Crafter/data/bm-crafter-us.json"
      : "/Blackmarket-Crafter/data/bm-crafter-eu.json";
    const relativePath = currentRegion === "us"
      ? "./data/bm-crafter-us.json"
      : "./data/bm-crafter-eu.json";
    const localPath = currentRegion === "us"
      ? buildLocalUrl("data/bm-crafter-us.json")
      : buildLocalUrl("data/bm-crafter-eu.json");
    const legacyPath = currentRegion === "us"
      ? "/Blackmarket-Crafter/bm-crafter-us.json"
      : "/Blackmarket-Crafter/bm-crafter-eu.json";
    try {
      const payload = await fetchJsonWithFallback([dataPath, localPath, relativePath, legacyPath]);
      if (!payload) throw new Error("load failed");
      const items = Array.isArray(payload.items) ? payload.items : [];
      const uniqueMap = new Map();
      items.forEach((item) => {
        if (!item || !item.id) return;
        if (!uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
          return;
        }
        const existing = uniqueMap.get(item.id);
        const existingSold = Number(existing.sold || 0);
        const nextSold = Number(item.sold || 0);
        if (nextSold > existingSold) {
          uniqueMap.set(item.id, item);
        }
      });
      allItems = Array.from(uniqueMap.values());
      const stamp = payload.generatedAt ? new Date(payload.generatedAt) : null;
      lastUpdated.textContent = stamp ? stamp.toISOString().slice(11, 16) : "--:--";
      await loadRecipes();
      await loadMaterials(currentRegion);
      await loadArtefacts(currentRegion);
      applyFilters();
      if (!suppressBroadcast) {
        await saveRegionToProfile();
      }
      broadcastRegion(currentRegion);
    } catch (_) {
      renderEmpty();
    }
  }

  regionToggle.addEventListener("click", () => {
    pendingRegion = currentRegion === "eu" ? "us" : "eu";
    if (regionConfirm) {
      regionConfirm.classList.add("open");
      regionConfirm.setAttribute("aria-hidden", "false");
    } else {
      loadRegion(pendingRegion);
      pendingRegion = null;
    }
  });

  if (regionConfirmYes && regionConfirm) {
    regionConfirmYes.addEventListener("click", () => {
      regionConfirm.classList.remove("open");
      regionConfirm.setAttribute("aria-hidden", "true");
      if (pendingRegion) {
        loadRegion(pendingRegion);
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

  tierFilter.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-tier]");
    if (!btn) return;
    const next = Number(btn.getAttribute("data-tier"));
    selectedTier = selectedTier === next ? null : next;
    setActive(tierFilter, "data-tier", selectedTier);
    applyFilters();
  });

  enchantFilter.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-enchant]");
    if (!btn) return;
    const next = Number(btn.getAttribute("data-enchant"));
    selectedEnchant = selectedEnchant === next ? null : next;
    setActive(enchantFilter, "data-enchant", selectedEnchant);
    applyFilters();
  });

  soldRange.addEventListener("input", () => {
    minSold = Number(soldRange.value || 0);
    updateSlider();
    applyFilters();
  });

  returnRateInput.addEventListener("input", () => {
    updateReturnRate();
    applyFilters();
  });

  if (bonusCityToggle) {
    bonusCityToggle.addEventListener("change", () => {
      if (bonusCityToggle.checked) {
        returnRateInput.value = 24.81;
      } else {
        returnRateInput.value = 15.25;
      }
      updateReturnRate();
      applyFilters();
    });
  }

  itemSearch.addEventListener("input", () => {
    searchTerm = itemSearch.value.trim().toLowerCase();
    applyFilters();
  });

  if (tableWrap) {
    tableWrap.addEventListener("scroll", () => {
      const nearBottom = tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - 120;
      if (nearBottom) renderRows(filteredItems, false);
    });
  }

  setActive(tierFilter, "data-tier", selectedTier);
  setActive(enchantFilter, "data-enchant", selectedEnchant);
  updateSlider();
  updateReturnRate();
  renderEmpty();
  loadAccountPanel()
    .then(() => {
      bindAccountHandlers();
      return loadAccountProfile();
    })
    .catch(() => {});
  (async () => {
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
        // ignore metadata load errors
      }
    }
    if (storedRegion) currentRegion = storedRegion;
    await loadRegion(currentRegion);
  })();

  window.addEventListener("storage", (event) => {
    if (event.key !== "region") return;
    const next = (event.newValue || "").toLowerCase();
    if (next !== "us" && next !== "eu") return;
    if (next === currentRegion) return;
    suppressBroadcast = true;
    loadRegion(next).finally(() => {
      suppressBroadcast = false;
    });
  });

  if (regionChannel) {
    regionChannel.onmessage = (event) => {
      const next = (event.data && event.data.value) || "";
      if (next !== "us" && next !== "eu") return;
      if (next === currentRegion) return;
      suppressBroadcast = true;
      loadRegion(next).finally(() => {
        suppressBroadcast = false;
      });
    };
  }

  if (profileChannel) {
    profileChannel.onmessage = (event) => {
      const next = (event.data && event.data.value) || "";
      if (!next) return;
      const safe = sanitizeAvatarUrl(next || avatarFallback);
      suppressAvatarBroadcast = true;
      localStorage.setItem("avatar", safe);
      if (avatarIcon) avatarIcon.src = safe;
      if (profileAvatar) profileAvatar.src = safe;
      suppressAvatarBroadcast = false;
    };
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== "avatar") return;
    const next = event.newValue || "";
    if (!next) return;
    const safe = sanitizeAvatarUrl(next || avatarFallback);
    suppressAvatarBroadcast = true;
    if (avatarIcon) avatarIcon.src = safe;
    if (profileAvatar) profileAvatar.src = safe;
    suppressAvatarBroadcast = false;
  });
})();

