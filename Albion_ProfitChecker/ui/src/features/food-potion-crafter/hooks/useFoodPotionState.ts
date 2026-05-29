import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_STATION_FEE,
  PRODUCTION_BONUS_CITY,
} from "../core";
import type {
  City,
  ConsumableCategory,
  ConsumableRecipe,
  ReturnRatePreset,
  StationKind,
} from "../core";
import { deriveFoodPotionRows } from "./deriveRows";
import type { CraftingProgress } from "../specs/data";

const SELL_CITY_DEFAULT: City = "Caerleon";

export function useFoodPotionState(
  recipes: ConsumableRecipe[],
  priceByItemId: Map<string, number>,
  specProgress?: CraftingProgress
) {
  const [category, setCategoryState] = useState<ConsumableCategory>("food");
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [craftCity, setCraftCity] = useState<City>(PRODUCTION_BONUS_CITY.food);
  const [buyCity, setBuyCity] = useState<City>(PRODUCTION_BONUS_CITY.food);
  const [sellCity, setSellCity] = useState<City>(SELL_CITY_DEFAULT);
  const [stationKind, setStationKind] = useState<StationKind>("city");
  const [returnRatePreset, setReturnRatePreset] = useState<ReturnRatePreset>("focus");
  const [customReturnRatePct, setCustomReturnRatePct] = useState<number>(43.5);
  const [amount, setAmount] = useState(1);
  const [stationFeePerCraft, setStationFeePerCraft] = useState<number>(DEFAULT_STATION_FEE.food);
  const [marketTaxRate, setMarketTaxRate] = useState(0.065);
  const [demandPerDay, setDemandPerDay] = useState(0);
  const [showOnlyProfitable, setShowOnlyProfitable] = useState(false);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const setCategory = (next: ConsumableCategory) => {
    setCategoryState(next);
    setCraftCity(PRODUCTION_BONUS_CITY[next]);
    setStationFeePerCraft(DEFAULT_STATION_FEE[next]);
  };

  const toggleTier = (tier: number) => setSelectedTier((prev) => (prev === tier ? null : tier));

  const rows = useMemo(
    () =>
      deriveFoodPotionRows(
        recipes,
        {
          category,
          selectedTier,
          searchTerm,
          craftCity,
          buyCity,
          sellCity,
          stationKind,
          returnRatePreset,
          customReturnRatePct,
          amount,
          stationFeePerCraft,
          marketTaxRate,
          demandPerDay,
          showOnlyProfitable,
          specProgress,
        },
        priceByItemId
      ),
    [
      recipes,
      priceByItemId,
      category,
      selectedTier,
      searchTerm,
      craftCity,
      buyCity,
      sellCity,
      stationKind,
      returnRatePreset,
      customReturnRatePct,
      amount,
      stationFeePerCraft,
      marketTaxRate,
      demandPerDay,
      showOnlyProfitable,
      specProgress,
    ]
  );

  useEffect(() => {
    if (!rows.length) {
      setSelectedRowKey(null);
      return;
    }
    if (selectedRowKey && rows.some((row) => row.rowKey === selectedRowKey)) return;
    setSelectedRowKey(rows[0].rowKey);
  }, [rows, selectedRowKey]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.rowKey === selectedRowKey) ?? (rows[0] ?? null),
    [rows, selectedRowKey]
  );

  return {
    rows,
    selectedRow,
    selectedRowKey,
    setSelectedRowKey,
    filters: {
      category,
      setCategory,
      selectedTier,
      setSelectedTier,
      toggleTier,
      searchTerm,
      setSearchTerm,
      craftCity,
      setCraftCity,
      buyCity,
      setBuyCity,
      sellCity,
      setSellCity,
      stationKind,
      setStationKind,
      returnRatePreset,
      setReturnRatePreset,
      customReturnRatePct,
      setCustomReturnRatePct,
      amount,
      setAmount,
      stationFeePerCraft,
      setStationFeePerCraft,
      marketTaxRate,
      setMarketTaxRate,
      demandPerDay,
      setDemandPerDay,
      showOnlyProfitable,
      setShowOnlyProfitable,
    },
  };
}
