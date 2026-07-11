import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthService } from "@shared/auth/authService";
import { isGuest } from "@shared/auth/guestMode";
import type { ConsumableCategory } from "../core";
import { clampSpecLevel, normalizeProgress } from "./data";
import type { CraftingProgress } from "./data";

const STORAGE_KEY = "foodPotionSpecsV1";
const SYNC_CHANNEL = "rk-food-potion-specs-sync";
const REMOTE_KEY = "foodPotionSpecs";
const SAVE_DEBOUNCE_MS = 700;

function readFromStorage(): CraftingProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeProgress(null);
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return normalizeProgress(null);
  }
}

function writeToStorage(value: CraftingProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export interface UseFoodPotionSpecsResult {
  progress: CraftingProgress;
  setMastery: (category: ConsumableCategory, level: number) => void;
  setSpec: (category: ConsumableCategory, familyKey: string, level: number) => void;
  resetCategory: (category: ConsumableCategory) => void;
  pendingSync: boolean;
}

export function useFoodPotionSpecs(authService: AuthService | null, enabled: boolean): UseFoodPotionSpecsResult {
  const [progress, setProgress] = useState<CraftingProgress>(() => readFromStorage());
  const [pendingSync, setPendingSync] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastRemoteRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !authService) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!user || cancelled) return;
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const remoteRaw = meta[REMOTE_KEY];
        if (!remoteRaw) return;
        const next = normalizeProgress(remoteRaw);
        lastRemoteRef.current = JSON.stringify(next);
        setProgress(next);
        writeToStorage(next);
      } catch {
        /* ignore */
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
      if (isGuest()) return; // guests don't persist specs (read-only); UI is disabled too
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

  const setMastery = useCallback(
    (category: ConsumableCategory, level: number) => {
      setProgress((prev) => {
        const safe = clampSpecLevel(level);
        if (prev[category].mastery === safe) return prev;
        const next: CraftingProgress = { ...prev, [category]: { ...prev[category], mastery: safe } };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const setSpec = useCallback(
    (category: ConsumableCategory, familyKey: string, level: number) => {
      setProgress((prev) => {
        const safe = clampSpecLevel(level);
        const specs = { ...prev[category].specs };
        if ((specs[familyKey] ?? 0) === safe) return prev;
        if (safe <= 0) delete specs[familyKey];
        else specs[familyKey] = safe;
        const next: CraftingProgress = { ...prev, [category]: { ...prev[category], specs } };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const resetCategory = useCallback(
    (category: ConsumableCategory) => {
      setProgress((prev) => {
        const next: CraftingProgress = { ...prev, [category]: { mastery: 0, specs: {} } };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { progress, setMastery, setSpec, resetCategory, pendingSync };
}
