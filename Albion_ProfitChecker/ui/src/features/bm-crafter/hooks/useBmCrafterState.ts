import { useEffect, useMemo, useState } from "react";
import { returnRatePercentToDecimal } from "../domain";
import type { BmCrafterDataBundle } from "../data";
import { deriveBmCrafterRows } from "./deriveRows";

export function useBmCrafterState(bundle: BmCrafterDataBundle | null) {
  const [selectedTiers, setSelectedTiers] = useState<number[]>([]);
  const [selectedEnchants, setSelectedEnchants] = useState<number[]>([]);
  const [minSold, setMinSold] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortByDailyTop, setSortByDailyTop] = useState(false);
  const [showOnlyProfitable, setShowOnlyProfitable] = useState(true);
  const [nonArtefactOnly, setNonArtefactOnly] = useState(false);
  const [bonusCity, setBonusCity] = useState(false);
  const [returnRatePercent, setReturnRatePercent] = useState(15.25);
  const [craftCity, setCraftCity] = useState<string>("Lymhurst");
  const [usageFeePer100, setUsageFeePer100] = useState<number>(1500);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const setBonusCityPreset = (enabled: boolean) => {
    setBonusCity(enabled);
    setReturnRatePercent(enabled ? 24.81 : 15.25);
  };

  const returnRate = useMemo(() => returnRatePercentToDecimal(returnRatePercent), [returnRatePercent]);

  const rows = useMemo(
    () =>
      deriveBmCrafterRows(bundle, {
        selectedTiers,
        selectedEnchants,
        minSold,
        searchTerm,
        returnRate,
        sortByDailyTop,
        showOnlyProfitable,
        nonArtefactOnly,
        craftCity,
        usageFeePer100
      }),
    [bundle, selectedTiers, selectedEnchants, minSold, searchTerm, returnRate, sortByDailyTop, showOnlyProfitable, nonArtefactOnly, craftCity, usageFeePer100]
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

  const toggleTier = (tier: number) =>
    setSelectedTiers((prev) => (prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]));
  const toggleEnchant = (enchant: number) =>
    setSelectedEnchants((prev) => (prev.includes(enchant) ? prev.filter((e) => e !== enchant) : [...prev, enchant]));

  const resetFilters = () => {
    setSelectedTiers([]);
    setSelectedEnchants([]);
    setMinSold(0);
    setSearchTerm("");
    setSortByDailyTop(false);
    setShowOnlyProfitable(true);
    setNonArtefactOnly(false);
  };

  return {
    rows,
    selectedRow,
    selectedRowKey,
    setSelectedRowKey,
    filters: {
      selectedTiers,
      setSelectedTiers,
      selectedEnchants,
      setSelectedEnchants,
      minSold,
      setMinSold,
      searchTerm,
      setSearchTerm,
      sortByDailyTop,
      setSortByDailyTop,
      showOnlyProfitable,
      setShowOnlyProfitable,
      nonArtefactOnly,
      setNonArtefactOnly,
      bonusCity,
      setBonusCity,
      setBonusCityPreset,
      returnRatePercent,
      setReturnRatePercent,
      returnRate,
      craftCity,
      setCraftCity,
      usageFeePer100,
      setUsageFeePer100,
      toggleTier,
      toggleEnchant,
      resetFilters
    }
  };
}
