import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketRegion } from "../domain";
import { BmCrafterDataService, type BmCrafterDataBundle } from "../data";

interface UseBmCrafterDataState {
  loading: boolean;
  error: string | null;
  data: BmCrafterDataBundle | null;
}

interface UseBmCrafterDataOptions {
  cacheBust?: boolean;
}

const dataService = new BmCrafterDataService();

export function useBmCrafterData(
  region: MarketRegion,
  options: UseBmCrafterDataOptions = {}
) {
  const [state, setState] = useState<UseBmCrafterDataState>({
    loading: true,
    error: null,
    data: null
  });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    dataService
      .loadAll(region, { cacheBust: options.cacheBust })
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load BM crafter data.";
        setState((prev) => ({ ...prev, loading: false, error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [region, options.cacheBust, reloadTick]);

  const reload = useCallback(() => setReloadTick((v) => v + 1), []);

  return useMemo(
    () => ({
      loading: state.loading,
      error: state.error,
      data: state.data,
      reload
    }),
    [state.loading, state.error, state.data, reload]
  );
}
