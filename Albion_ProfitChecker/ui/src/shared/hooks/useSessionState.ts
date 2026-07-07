import { useEffect, useRef, useState } from "react";

/**
 * Like useState, but the value is persisted to sessionStorage under `key` so it survives
 * component unmount/remount within the same browser session (e.g. navigating to another
 * page and pressing Back). It is intentionally NOT localStorage: settings live only for the
 * session, so a fresh visit starts from the defaults.
 *
 * The stored value is read once on mount; it is not synced across tabs. Serialization uses
 * JSON, so only JSON-safe values should be stored.
 */
export function useSessionState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  // Skip writing on the very first render (nothing changed yet) to avoid clobbering the
  // stored value with the default before a genuine update happens.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [key, value]);

  return [value, setValue];
}
