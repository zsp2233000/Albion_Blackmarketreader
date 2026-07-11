import { beforeEach, describe, expect, it } from "vitest";
import { buildGuestProfile, enterGuest, exitGuest, GUEST_USER_ID, isGuest } from "./guestMode";

// The test environment is "node" (no DOM), so provide a minimal in-memory localStorage.
function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installLocalStorage();
});

describe("guestMode", () => {
  it("defaults to not-guest", () => {
    expect(isGuest()).toBe(false);
  });

  it("enterGuest / exitGuest toggle the flag", () => {
    enterGuest();
    expect(isGuest()).toBe(true);
    exitGuest();
    expect(isGuest()).toBe(false);
  });

  it("buildGuestProfile is a confirmed, account-less profile", () => {
    const p = buildGuestProfile();
    expect(p.id).toBe(GUEST_USER_ID);
    expect(p.email).toBeNull();
    expect(p.emailConfirmed).toBe(true);
  });

  it("buildGuestProfile picks up locally stored region + avatar", () => {
    localStorage.setItem("region", "us");
    localStorage.setItem("avatar", "http://x/y.png");
    const p = buildGuestProfile();
    expect(p.region).toBe("us");
    expect(p.avatar).toBe("http://x/y.png");
  });

  it("buildGuestProfile rejects an invalid stored region", () => {
    localStorage.setItem("region", "asia");
    expect(buildGuestProfile().region).toBeNull();
  });
});
