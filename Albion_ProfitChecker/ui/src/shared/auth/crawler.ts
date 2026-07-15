/**
 * Detects well-known search-engine, social, and AI crawlers by user agent.
 *
 * Tool pages redirect unauthenticated humans to /login. For a crawler that
 * redirect makes Google treat the page as "Page with redirect" and drop it from
 * the index. Instead we let crawlers fall into the same public read-only render a
 * guest sees — the content is identical to what a real guest visitor gets, so this
 * is not cloaking.
 */
// `mediapartners` + `adsbot` are Google's AdSense crawlers (Mediapartners-Google reads
// page content to pick relevant ads; AdsBot-Google checks ad landing quality). They must
// reach the login-gated tool pages or AdSense cannot approve/serve on them.
const CRAWLER_RE =
  /bot|crawler|spider|crawling|googlebot|google-inspectiontool|mediapartners|adsbot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebookexternalhit|facebot|ia_archiver|twitterbot|applebot|linkedinbot|embedly|slackbot|discordbot|telegrambot|whatsapp|pinterest|petalbot|gptbot|chatgpt|claudebot|ccbot|w3c_validator/i;

/** True when the current visitor's user agent looks like a crawler/bot. */
export function isCrawler(): boolean {
  try {
    const ua = navigator.userAgent;
    if (!ua) return false;
    return CRAWLER_RE.test(ua);
  } catch {
    return false;
  }
}
