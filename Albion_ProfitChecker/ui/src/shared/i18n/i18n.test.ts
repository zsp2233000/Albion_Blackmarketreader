import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  detectLocale,
  translate,
  type Locale,
} from "./i18n";
import { getItemDisplayName, getItemSearchNames, getOfficialItemName } from "./itemNames";

describe("i18n core", () => {
  it("defaults to English when no locale is stored or detected", () => {
    expect(detectLocale({ getItem: () => null }, "fr-FR")).toBe(DEFAULT_LOCALE);
  });

  it("recognizes Traditional Chinese browser and stored locale values", () => {
    const storage = { getItem: () => "en" };
    expect(detectLocale(storage, "zh-TW")).toBe("en");
    expect(detectLocale({ getItem: () => null }, "zh-Hant-TW")).toBe("zh-TW");
  });

  it("translates known messages and falls back to English", () => {
    expect(translate("zh-TW", "nav.dashboard")).toBe("儀表板");
    expect(translate("zh-TW", "message.showingItems", { shown: 3, total: 10 })).toBe("顯示 3 / 10 個道具");
    expect(translate("zh-TW", "missing.key" as never)).toBe("missing.key");
  });
});

describe("official item names", () => {
  it("uses the extracted official Traditional Chinese name", () => {
    expect(getOfficialItemName("T4_BAG")).toBe("老手級背包");
  });

  it("keeps tier and enchant metadata while displaying the official name", () => {
    expect(getItemDisplayName("T4_BAG@2", "zh-TW")).toBe("4.2 老手級背包");
  });

  it("uses a readable English fallback for tiered base materials", () => {
    expect(getItemDisplayName("T4_METALBAR", "en")).toBe("4.0 Metal Bar");
  });

  it("keeps localized, English, and ID search terms available", () => {
    const names = getItemSearchNames("T4_BAG", "zh-TW");
    expect(names).toContain("4.0 老手級背包");
    expect(names).toContain("T4_BAG");
  });

  it("falls back safely for unknown IDs", () => {
    expect(getItemDisplayName("T4_UNKNOWN_ITEM", "zh-TW")).toBe("4.0 UNKNOWN ITEM");
  });
});

const _localeTypeCheck: Locale = "zh-TW";
void _localeTypeCheck;
