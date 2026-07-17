import { describe, expect, it } from "vitest";
import { formatSilver } from "./dashboard.formatters";

describe("formatSilver", () => {
  it("uses the active UI locale for thousands separators", () => {
    expect(formatSilver(4288, "en")).toBe("4,288");
    expect(formatSilver(4288, "zh-TW")).toBe("4,288");
  });
});
