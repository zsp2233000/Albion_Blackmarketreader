import type { Region, UserProfile } from "../types";
import { normalizeRegion } from "../region/regions";

// Guest mode lets a visitor use every tool without a Supabase account. It is a purely local
// flag: nothing is written server-side, and per-device settings (region, avatar, filters) fall
// back to localStorage exactly as they already do for signed-in users. The signed-in flow is
// never affected — the guest branch is only ever entered when there is no real session.
const GUEST_KEY = "guest:active";
export const GUEST_USER_ID = "guest";

export function isGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function enterGuest(): void {
  try {
    localStorage.setItem(GUEST_KEY, "1");
  } catch {
    /* storage disabled — guest mode simply won't persist across reloads */
  }
}

export function exitGuest(): void {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
}

function readStoredRegion(): Region | null {
  try {
    return normalizeRegion(localStorage.getItem("region"));
  } catch {
    return null;
  }
}

function readStoredAvatar(): string | null {
  try {
    const raw = localStorage.getItem("avatar");
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Synthetic profile for a guest, shaped like a real UserProfile so each page's existing
 * profile→user mapping works unchanged. `emailConfirmed` is true so the pages skip the
 * confirm-email gate; there is no account to confirm.
 */
export function buildGuestProfile(): UserProfile {
  return {
    id: GUEST_USER_ID,
    email: null,
    emailConfirmed: true,
    avatar: readStoredAvatar(),
    region: readStoredRegion(),
  };
}
