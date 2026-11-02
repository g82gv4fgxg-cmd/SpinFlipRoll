import { expect, test } from "@playwright/test";
import { freshApp, saved } from "./helpers";

test("the secret card stays locked and hints at how to open it", async ({ page }) => {
  await freshApp(page);
  await page.getByRole("button", { name: "Locked secret" }).click();
  await expect(page.locator(".toast")).toContainText("title at the top likes being tapped");
  for (const hash of ["#/play", "#/play/pool", "#/play/spin-guard"]) {
    await page.goto(`./${hash}`);
    await expect(page.locator(".mode-screen")).toBeVisible();
    await expect(page.locator(".arcade-screen, .game-screen")).toHaveCount(0);
  }
});

test("tapping the title seven times unlocks the Games room for good", async ({ page }) => {
  await freshApp(page);
  const title = page.getByRole("button", { name: "SpinFlipRoll", exact: true });
  for (let i = 0; i < 4; i++) await title.click();
  await expect(page.locator(".toast")).toContainText("3 more taps");
  for (let i = 0; i < 3; i++) await title.click();
  await expect(page.locator(".toast")).toContainText("Games room is unlocked");
  await expect(page.getByRole("button", { name: /^Games room/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Games room/ })).toBeVisible();
  expect((await saved(page)).settings.secretUnlocked).toBe(true);
});

test("Spin Guard plays, pauses and ends", async ({ page }) => {
  await freshApp(page, { settings: { secretUnlocked: true } });
  await page.getByRole("button", { name: /^Games room/ }).click();
  await page.getByRole("button", { name: /^Spin Guard/ }).click();
  const game = page.locator(".game-screen");
  await expect(game).toHaveAttribute("data-status", "ready");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(game).toHaveAttribute("data-status", "playing");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(game).toHaveAttribute("data-step", "2");
  await page.getByRole("button", { name: "Turn left" }).click();
  await expect(game).toHaveAttribute("data-step", "1");

  await page.keyboard.press("p");
  await expect(game).toHaveAttribute("data-status", "paused");
  await page.getByRole("button", { name: "Resume" }).first().click();
  await expect(game).toHaveAttribute("data-status", "playing");

  // Left alone, orbs keep hitting the wrong colour until the lives run out.
  await expect(game).toHaveAttribute("data-status", "over", { timeout: 50_000 });
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
  await page.getByRole("button", { name: "Back to games" }).click();
  await expect(page.locator(".arcade-hub")).toBeVisible();
  await page.getByRole("button", { name: "Modes" }).click();
  await expect(page.locator(".mode-screen")).toBeVisible();
});
