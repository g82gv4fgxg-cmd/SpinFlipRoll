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
