import { afterEach, describe, expect, it, vi } from "vitest";
import { isCrawler } from "./crawler";

function withUserAgent(ua: string | undefined) {
  vi.stubGlobal("navigator", ua === undefined ? {} : { userAgent: ua });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "Mozilla/5.0 (compatible; DuckDuckBot/1.1; +http://duckduckgo.com/duckduckbot.html)",
  "Discordbot/2.0 (+https://discordapp.com)",
  "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Mozilla/5.0 (compatible; Mediapartners-Google/2.1; +http://www.google.com/bot.html)",
  "Mediapartners-Google",
  "Mozilla/5.0 (compatible; AdsBot-Google; +http://www.google.com/adsbot.html)",
  "AdsBot-Google-Mobile (+http://www.google.com/mobile/adsbot.html) Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
];

const HUMANS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
];

describe("isCrawler", () => {
  it.each(BOTS)("detects crawler: %s", (ua) => {
    withUserAgent(ua);
    expect(isCrawler()).toBe(true);
  });

  it.each(HUMANS)("passes human browser: %s", (ua) => {
    withUserAgent(ua);
    expect(isCrawler()).toBe(false);
  });

  it("returns false when userAgent is missing", () => {
    withUserAgent(undefined);
    expect(isCrawler()).toBe(false);
  });
});
