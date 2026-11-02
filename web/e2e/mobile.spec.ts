import { expect, test } from "@playwright/test";
import { freshApp, openMode } from "./helpers";

test("the wheel works by touch on a phone", async ({ page }) => {
  await freshApp(page);
  await openMode(page, "Wheel");
  await expect(page.locator(".shortcut-hint")).toBeHidden();
  // The stacked top bar once made the name box hundreds of pixels tall.
  expect((await page.locator(".title-input").boundingBox())!.height).toBeLessThan(100);
  await page.getByRole("button", { name: "Spin", exact: true }).tap();
  await page.locator(".win-overlay").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Done" }).tap();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("Spin Guard can be steered by tapping", async ({ page }) => {
  await freshApp(page, { settings: { secretUnlocked: true } });
  await page.getByRole("button", { name: /^Games room/ }).tap();
  await page.getByRole("button", { name: /^Spin Guard/ }).tap();
  await page.getByRole("button", { name: "Start" }).tap();
  const game = page.locator(".game-screen");
  const canvas = page.locator(".game-canvas");
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height / 2);
  await expect(game).toHaveAttribute("data-step", "1");
  await page.touchscreen.tap(box.x + box.width * 0.15, box.y + box.height / 2);
  await page.touchscreen.tap(box.x + box.width * 0.15, box.y + box.height / 2);
  await expect(game).toHaveAttribute("data-step", "-1");
});

test("the card tables and pool fit a phone and respond to taps", async ({ page }) => {
  await freshApp(page, { settings: { secretUnlocked: true } });
  await page.goto("./#/play/blackjack");
  await page.getByRole("button", { name: "Deal", exact: true }).tap();
  await expect(page.locator(".blackjack-screen")).not.toHaveAttribute("data-phase", "betting");
  await page.goto("./#/play/pool");
  const canvas = page.locator(".pool-canvas");
  const box = (await canvas.boundingBox())!;
  // On a tall screen the table stands upright.
  expect(box.height).toBeGreaterThan(box.width);
  await page.getByRole("button", { name: "Shoot" }).tap();
  await expect(page.locator(".pool-screen")).toHaveAttribute("data-shots", "1", { timeout: 30_000 });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test.describe("with full motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("opening a mode never makes the page scroll sideways", async ({ page }) => {
    await freshApp(page);
    for (const mode of ["Wheel", "Coin", "Dice"] as const) {
      await page.goto("./");
      await openMode(page, mode);
      await page.waitForTimeout(900);
      // A page that ever grew wider than the screen leaves the layout viewport wider than the visible one.
      const widths = await page.evaluate(() => ({ layout: window.innerWidth, visible: Math.round(window.visualViewport!.width), scroll: document.documentElement.scrollWidth }));
      expect(widths.layout, mode).toBe(widths.visible);
      expect(widths.scroll, mode).toBeLessThanOrEqual(widths.visible);
    }
  });
});
