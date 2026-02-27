import { useEffect, useMemo, useState } from "react";
import { returnRatePercentToDecimal } from "../domain";
import type { BmCrafterDataBundle } from "../data";
import { deriveBmCrafterRows } from "./deriveRows";

export function useBmCrafterState(bundle: BmCrafterDataBundle | null) {
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [selectedEnchant, setSelectedEnchant] = useState<number | null>(null);
  const [minSold, setMinSold] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortByDailyTop, setSortByDailyTop] = useState(false);
  const [showOnlyProfitable, setShowOnlyProfitable] = useState(true);
  const [bonusCity, setBonusCity] = useState(false);
  const [returnRatePercent, setReturnRatePercent] = useState(15.25);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const setBonusCityPreset = (enabled: boolean) => {
    setBonusCity(enabled);
    setReturnRatePercent(enabled ? 24.81 : 15.25);
  };

  const returnRate = useMemo(() => returnRatePercentToDecimal(returnRatePercent), [returnRatePercent]);

  const rows = useMemo(
    () =>
      deriveBmCrafterRows(bundle, {
        selectedTier,
        selectedEnchant,
        minSold,
        searchTerm,
        returnRate,
        sortByDailyTop,
        showOnlyProfitable
      }),
    [bundle, selectedTier, selectedEnchant, minSold, searchTerm, returnRate, sortByDailyTop, showOnlyProfitable]
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

  const toggleTier = (tier: number) => setSelectedTier((prev) => (prev === tier ? null : tier));
  const toggleEnchant = (enchant: number) => setSelectedEnchant((prev) => (prev === enchant ? null : enchant));

  const resetFilters = () => {
    setSelectedTier(null);
    setSelectedEnchant(null);
    setMinSold(0);
    setSearchTerm("");
    setSortByDailyTop(false);
    setShowOnlyProfitable(true);
  };

  return {
    rows,
    selectedRow,
    selectedRowKey,
    setSelectedRowKey,
    filters: {
      selectedTier,
      setSelectedTier,
      selectedEnchant,
      setSelectedEnchant,
      minSold,
      setMinSold,
      searchTerm,
      setSearchTerm,
      sortByDailyTop,
      setSortByDailyTop,
      showOnlyProfitable,
      setShowOnlyProfitable,
      bonusCity,
      setBonusCity,
      setBonusCityPreset,
      returnRatePercent,
      setReturnRatePercent,
      returnRate,
      toggleTier,
      toggleEnchant,
      resetFilters
    }
  };
}
