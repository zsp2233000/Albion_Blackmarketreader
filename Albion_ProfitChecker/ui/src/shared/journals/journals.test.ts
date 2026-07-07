import { describe, expect, it } from "vitest";
import {
  computeJournalProfit,
  journalItemIds,
  professionForItem,
  resolveCraftFameFactor,
} from "./journals";

describe("journal profession mapping", () => {
  it("maps weapon categories to the right crafting station journal", () => {
    expect(professionForItem("swords", "T4_MAIN_SWORD")).toBe("warrior");
    expect(professionForItem("daggers", "T4_MAIN_DAGGER")).toBe("warrior");
    expect(professionForItem("quarterstaffs", "T4_2H_QUARTERSTAFF")).toBe("warrior");
    expect(professionForItem("gloves", "T4_2H_KNUCKLES_SET1")).toBe("warrior");
    expect(professionForItem("bows", "T4_2H_BOW")).toBe("hunter");
    expect(professionForItem("spears", "T4_2H_GLAIVE")).toBe("hunter");
    expect(professionForItem("fire", "T4_2H_FIRESTAFF")).toBe("mage");
    expect(professionForItem("shapeshifter", "T4_2H_SHAPESHIFTER_SET1")).toBe("mage");
    expect(professionForItem("offhand", "T4_OFF_SHIELD")).toBe("toolmaker");
    expect(professionForItem("tools", "T4_2H_TOOL_AXE")).toBe("toolmaker");
  });

  it("resolves armor profession from the material in the id", () => {
    expect(professionForItem("armor-chest", "T4_ARMOR_PLATE_SET1")).toBe("warrior");
    expect(professionForItem("armor-head", "T4_HEAD_LEATHER_SET1")).toBe("hunter");
    expect(professionForItem("armor-shoes", "T4_SHOES_CLOTH_SET1")).toBe("mage");
  });

  it("returns null for unknown categories", () => {
    expect(professionForItem("mounts", "T4_MOUNT_HORSE")).toBeNull();
    expect(professionForItem(null, "T4_SOMETHING")).toBeNull();
  });
});

describe("craft fame factor (artifacts)", () => {
  it("is 1.0 for plain items and scales for artifact lines", () => {
    expect(resolveCraftFameFactor(null)).toBe(1);
    expect(resolveCraftFameFactor("ARTEFACT_2H_AXE_KEEPER")).toBe(1.1);
    expect(resolveCraftFameFactor("ARTEFACT_2H_MACE_HELL")).toBe(1.2);
    expect(resolveCraftFameFactor("ARTEFACT_2H_INFERNOSTAFF_MORGANA")).toBe(1.3);
    expect(resolveCraftFameFactor("ARTEFACT_2H_AXE_AVALON")).toBe(1.4);
  });
});

describe("journal item ids", () => {
  it("builds empty/full ids for a profession and tier", () => {
    expect(journalItemIds("hunter", 4)).toEqual({ empty: "T4_JOURNAL_HUNTER_EMPTY", full: "T4_JOURNAL_HUNTER_FULL" });
    expect(journalItemIds("mage", 8)).toEqual({ empty: "T8_JOURNAL_MAGE_EMPTY", full: "T8_JOURNAL_MAGE_FULL" });
  });
});

describe("computeJournalProfit", () => {
  it("reproduces the reference example: T4, 32 resources -> 720 fame, 0.2 journals", () => {
    const r = computeJournalProfit({
      tier: 4,
      totalResourceCount: 32,
      journalEmptyBuy: 100,
      journalFullSell: 1000,
    });
    expect(r.famePerCraft).toBeCloseTo(720, 6);
    expect(r.journalsFilled).toBeCloseTo(0.2, 6); // 720 / 3600
    // profitPerJournal = 1000 * 0.935 - 100 = 835 ; journalProfit = 0.2 * 835 = 167
    expect(r.profitPerJournal).toBeCloseTo(835, 6);
    expect(r.journalProfit).toBeCloseTo(167, 6);
    expect(r.available).toBe(true);
  });

  it("applies the artifact fame factor to the fame produced", () => {
    const r = computeJournalProfit({
      tier: 4,
      totalResourceCount: 32,
      craftFameFactor: 1.4,
      journalEmptyBuy: 100,
      journalFullSell: 1000,
    });
    expect(r.famePerCraft).toBeCloseTo(720 * 1.4, 6); // 1008
    expect(r.journalsFilled).toBeCloseTo(0.28, 6);
  });

  it("still reports fame but is unavailable when journal prices are missing", () => {
    const r = computeJournalProfit({ tier: 4, totalResourceCount: 32, journalEmptyBuy: 0, journalFullSell: 0 });
    expect(r.famePerCraft).toBeCloseTo(720, 6);
    expect(r.available).toBe(false);
    expect(r.journalProfit).toBe(0);
  });

  it("never subtracts profit when the journal is loss-making (full sells below empty)", () => {
    const r = computeJournalProfit({
      tier: 4,
      totalResourceCount: 32,
      journalEmptyBuy: 5000,
      journalFullSell: 1000, // 1000*0.935 = 935 < 5000 empty -> loss per journal
    });
    expect(r.profitPerJournal).toBeLessThan(0); // real (negative) margin still reported
    expect(r.journalProfit).toBe(0); // but the craft is never penalised
    expect(r.available).toBe(true);
  });

  it("is empty for tiers without a journal", () => {
    const r = computeJournalProfit({ tier: 1, totalResourceCount: 10, journalEmptyBuy: 100, journalFullSell: 1000 });
    expect(r.available).toBe(false);
    expect(r.famePerCraft).toBe(0);
  });
});
