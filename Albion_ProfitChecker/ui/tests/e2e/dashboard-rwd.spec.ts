import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 1024, height: 768 }, { width: 768, height: 1024 },
  { width: 390, height: 844 }, { width: 360, height: 800 },
  { width: 320, height: 568 }
] as const;

async function openDashboard(page: Page, locale = "en") {
  await page.addInitScript(({ selectedLocale }) => {
    localStorage.setItem("guest:active", "1");
    localStorage.setItem("region", "us");
    localStorage.setItem("ui:locale", selectedLocale);
    sessionStorage.setItem("rk-maintenance-shown", "1");
  }, { selectedLocale: locale });
  await page.route(/results(?:-(?:eu|asia))?(?:-[12])?\.js/, (route) => route.fulfill({
    contentType: "text/javascript",
    body: 'window.results = [["Lymhurst","T4_MAIN_SWORD",100,250,5,150,"14d"]];'
  }));
  await page.route(/avg-profit-history\.json/, (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.goto("/dashboard");
  await expect(page.locator(".dashboard .page")).toBeVisible();
  await expect(page.locator(".loading-overlay")).toBeHidden({ timeout: 15_000 });
}

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} has no page overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDashboard(page);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    const rail = page.locator(".tool-rail");
    const burger = page.locator(".mnav-burger");
    if (viewport.width > 1100) {
      await expect(rail).toBeVisible();
      await expect(burger).toBeHidden();
    } else {
      await expect(rail).toBeHidden();
      await expect(burger).toBeVisible();
    }
    if (viewport.width <= 640) {
      await expect(page.locator(".kpi-card").nth(1)).toBeHidden();
      await expect(page.locator(".chart-panel")).toBeHidden();
      const cards = await page.locator(".grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
      expect(cards).toBe(1);
    }
  });
}

test("desktop rail expands without moving content", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);
  const main = page.locator(".dash-main");
  const before = await main.boundingBox();
  const collapsedRail = await page.locator(".tool-rail").boundingBox();
  expect(collapsedRail?.x).toBeLessThan(0);
  const pagePaddingLeft = await page.locator(".dashboard .page").evaluate((element) => getComputedStyle(element).paddingLeft);
  expect(Number.parseFloat(pagePaddingLeft)).toBeLessThan(68);
  const topbarLeft = await page.locator(".topbar").evaluate((element) => getComputedStyle(element).left);
  expect(Number.parseFloat(topbarLeft)).toBeLessThan(68);
  const headerStyles = await page.locator(".topbar").evaluate((element) => {
    const styles = getComputedStyle(element);
    return { backgroundImage: styles.backgroundImage, backdropFilter: styles.backdropFilter };
  });
  expect(headerStyles.backgroundImage).toContain("linear-gradient");
  expect(headerStyles.backdropFilter).toContain("blur");
  await page.locator(".tool-rail").hover({ position: { x: 66, y: 20 } });
  await expect(page.locator(".tool-rail")).toHaveCSS("width", "272px");
  expect((await main.boundingBox())?.x).toBe(before?.x);
});

test("drawers, account panel and filters fit long translated text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, "zh-TW");
  await page.locator(".mnav-burger").click();
  await expect(page.locator(".mnav-drawer")).toBeVisible();
  await page.locator(".mnav-overlay").click({ position: { x: 380, y: 400 } });
  await page.locator(".account-btn").click();
  const accountPanel = page.locator(".account-panel.open");
  await accountPanel.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const panel = await accountPanel.boundingBox();
  expect(panel?.x).toBeGreaterThanOrEqual(0);
  expect((panel?.x ?? 0) + (panel?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await page.locator(".resp-filters-fab").click();
  const sheet = await page.locator(".resp-filters-sheet").boundingBox();
  expect(sheet?.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
