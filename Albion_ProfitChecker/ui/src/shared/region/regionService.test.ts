import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegionService } from "./regionService";

function installBrowserStubs() {
  const store = new Map<string, string>();
  const windowStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (globalThis as unknown as { window: typeof windowStub }).window = windowStub;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  } as Storage;
}

beforeEach(() => installBrowserStubs());

describe("RegionService Asia support", () => {
  it("restores Asia from localStorage", () => {
    localStorage.setItem("region", "asia");
    const service = new RegionService();
    expect(service.getRegion()).toBe("asia");
    service.destroy();
  });

  it("stores and notifies Asia selection", () => {
    const service = new RegionService("eu");
    const subscriber = vi.fn();
    service.subscribe(subscriber);
    service.setRegion("asia");

    expect(service.getRegion()).toBe("asia");
    expect(localStorage.getItem("region")).toBe("asia");
    expect(subscriber).toHaveBeenLastCalledWith("asia");
    service.destroy();
  });
});
