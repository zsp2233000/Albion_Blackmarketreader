import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthService } from "@shared/auth/authService";
import type { CraftingProgress } from "./types";
import { clampSpecLevel, normalizeProgress } from "./data";

const STORAGE_KEY = "craftingProgressV3";
const SYNC_CHANNEL = "rk-crafting-progress-sync";
const SAVE_DEBOUNCE_MS = 700;
const REMOTE_KEY = "craftingProgress";

function readFromStorage(): CraftingProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { specs: {}, masteries: {} };
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return { specs: {}, masteries: {} };
  }
}

function writeToStorage(value: CraftingProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

interface UseCraftingSpecsOptions {
  authService: AuthService | null;
  enabled: boolean;
}

export interface UseCraftingSpecsResult {
  progress: CraftingProgress;
  setSpecLevel: (specKey: string, level: number) => void;
  setMasteryLevel: (groupKey: string, level: number) => void;
  resetAll: () => void;
  pendingSync: boolean;
  loaded: boolean;
}

export function useCraftingSpecs({ authService, enabled }: UseCraftingSpecsOptions): UseCraftingSpecsResult {
  const [progress, setProgress] = useState<CraftingProgress>(() => readFromStorage());
  const [loaded, setLoaded] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastRemoteRef = useRef<string>(JSON.stringify(progress));

  useEffect(() => {
    if (!enabled || !authService) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await authService.client.auth.getUser();
        if (error || cancelled) return;
        const meta = (data.user?.user_metadata || {}) as Record<string, unknown>;
        // Try new V3 key first; fallback to legacy keys.
        const remoteRaw = meta[REMOTE_KEY] ?? meta.craftingItemNodes ?? meta.craftingItemSpecs;
        if (!remoteRaw) {
          setLoaded(true);
          return;
        }
        const next = normalizeProgress(remoteRaw);
        const serialized = JSON.stringify(next);
        lastRemoteRef.current = serialized;
        setProgress(next);
        writeToStorage(next);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authService, enabled]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ type?: string; value?: CraftingProgress }>) => {
      if (event.data?.type !== "progress" || !event.data.value) return;
      const next = normalizeProgress(event.data.value);
      setProgress(next);
      writeToStorage(next);
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = normalizeProgress(JSON.parse(event.newValue));
        setProgress(parsed);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistRemote = useCallback(
    (next: CraftingProgress) => {
      if (!authService) return;
      const serialized = JSON.stringify(next);
      if (serialized === lastRemoteRef.current) {
        setPendingSync(false);
        return;
      }
      setPendingSync(true);
      authService
        .updateUserMetadata({ [REMOTE_KEY]: next })
        .then(() => {
          lastRemoteRef.current = serialized;
        })
        .catch(() => undefined)
        .finally(() => setPendingSync(false));
    },
    [authService]
  );

  const scheduleSave = useCallback(
    (next: CraftingProgress) => {
      writeToStorage(next);
      channelRef.current?.postMessage({ type: "progress", value: next });
      if (!authService) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      setPendingSync(true);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        persistRemote(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [authService, persistRemote]
  );

  const setSpecLevel = useCallback(
    (specKey: string, level: number) => {
      const normalizedKey = String(specKey || "").toUpperCase();
      if (!normalizedKey) return;
      setProgress((prev) => {
        const safeLevel = clampSpecLevel(level);
        const currentSpec = prev.specs[normalizedKey] ?? 0;
        if (currentSpec === safeLevel) return prev;
        const nextSpecs = { ...prev.specs };
        if (safeLevel <= 0) delete nextSpecs[normalizedKey];
        else nextSpecs[normalizedKey] = safeLevel;
        const next: CraftingProgress = { specs: nextSpecs, masteries: prev.masteries };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const setMasteryLevel = useCallback(
    (groupKey: string, level: number) => {
      const trimmed = String(groupKey || "").trim();
      if (!trimmed) return;
      setProgress((prev) => {
        const safeLevel = clampSpecLevel(level);
        const current = prev.masteries[trimmed] ?? 0;
        if (current === safeLevel) return prev;
        const nextMasteries = { ...prev.masteries };
        if (safeLevel <= 0) delete nextMasteries[trimmed];
        else nextMasteries[trimmed] = safeLevel;
        const next: CraftingProgress = { specs: prev.specs, masteries: nextMasteries };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const resetAll = useCallback(() => {
    setProgress(() => {
      const next: CraftingProgress = { specs: {}, masteries: {} };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  return { progress, setSpecLevel, setMasteryLevel, resetAll, pendingSync, loaded };
}
