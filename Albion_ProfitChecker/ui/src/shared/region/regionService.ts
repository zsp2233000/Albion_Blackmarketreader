import type { Region } from "../types";
import { normalizeRegion } from "./regions";

type RegionSubscriber = (region: Region) => void;

const REGION_KEY = "region";
const CHANNEL_NAME = "rk-region-sync";

export class RegionService {
  private readonly subscribers = new Set<RegionSubscriber>();
  private readonly channel: BroadcastChannel | null;
  private region: Region;

  constructor(defaultRegion: Region = "eu") {
    this.region = this.readRegion(defaultRegion);
    this.channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

    window.addEventListener("storage", this.onStorage);
    this.channel?.addEventListener("message", this.onChannelMessage as EventListener);
  }

  destroy() {
    window.removeEventListener("storage", this.onStorage);
    this.channel?.removeEventListener("message", this.onChannelMessage as EventListener);
    this.channel?.close();
    this.subscribers.clear();
  }

  getRegion(): Region {
    return this.region;
  }

  setRegion(next: Region, options?: { broadcast?: boolean }): void {
    const normalized = normalizeRegion(next);
    if (!normalized) return;
    if (normalized === this.region) return;

    this.region = normalized;
    localStorage.setItem(REGION_KEY, normalized);
    this.notify();

    if (options?.broadcast !== false) {
      this.channel?.postMessage({ type: "region", value: normalized });
    }
  }

  subscribe(fn: RegionSubscriber): () => void {
    this.subscribers.add(fn);
    fn(this.region);
    return () => this.subscribers.delete(fn);
  }

  private readRegion(defaultRegion: Region): Region {
    return normalizeRegion(localStorage.getItem(REGION_KEY)) ?? defaultRegion;
  }

  private notify() {
    this.subscribers.forEach((fn) => fn(this.region));
  }

  private onStorage = (event: StorageEvent) => {
    if (event.key !== REGION_KEY) return;
    const next = normalizeRegion(event.newValue);
    if (!next) return;
    if (next === this.region) return;
    this.region = next;
    this.notify();
  };

  private onChannelMessage = (event: MessageEvent) => {
    if (event.data?.type !== "region") return;
    const next = normalizeRegion(event.data?.value);
    if (!next) return;
    if (next === this.region) return;
    this.region = next;
    localStorage.setItem(REGION_KEY, next);
    this.notify();
  };
}

