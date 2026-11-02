import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { freshApp, saved } from "./helpers";

async function openGame(page: Page, name: RegExp) {
  await freshApp(page, { settings: { secretUnlocked: true } });
  await page.getByRole("button", { name: /^Games room/ }).click();
  await expect(page.locator(".arcade-hub")).toBeVisible();
  await expect(page.getByText("Play chips only")).toBeVisible();
  await page.getByRole("button", { name }).click();
}

test("the Games room opens each game and the back buttons step back through it", async ({ page }) => {
  await openGame(page, /^Blackjack/);
  await expect(page).toHaveURL(/#\/play\/blackjack$/);
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await expect(page.locator(".arcade-hub")).toBeVisible();
  await page.getByRole("button", { name: /^Texas Hold'em/ }).click();
  await expect(page.locator(".poker-screen")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".arcade-hub")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".mode-screen")).toBeVisible();
});

test("blackjack deals, coaches each decision and pays out", async ({ page }) => {
  await openGame(page, /^Blackjack/);
  const screen = page.locator(".blackjack-screen");
  await expect(screen).toHaveAttribute("data-chips", "1000");
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "Add 100" }).click();
  await page.getByRole("button", { name: "Add 10", exact: true }).click();
  await expect(page.locator(".bet-amount")).toContainText("110");

  // Deal until a hand needs a decision (a blackjack on the deal settles straight away).
  let decided = false;
  for (let attempt = 0; attempt < 8 && !decided; attempt++) {
    const dealButton = page.getByRole("button", { name: /^Deal/ });
    await dealButton.first().click();
    await expect(screen).not.toHaveAttribute("data-phase", "betting");
    if ((await screen.getAttribute("data-phase")) === "player") {
      await expect(page.locator(".coach-hint")).toContainText("Try:");
      await page.keyboard.press("s");
      await expect(page.locator(".coach-feedback")).toBeVisible();
      decided = true;
    }
    await expect(screen).toHaveAttribute("data-phase", "done", { timeout: 15_000 });
  }
  expect(decided).toBe(true);
  await expect(page.locator(".result-badge").first()).toBeVisible();
  await expect(page.locator(".coach-stat")).toContainText("of");
  const data = await saved(page);
  expect(data.arcade.coachTotal).toBeGreaterThan(0);
  expect(Number(await screen.getAttribute("data-chips"))).toBe(data.arcade.blackjackChips);

  await page.getByRole("button", { name: "Learn" }).click();
  await expect(page.getByRole("table").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".learn-panel")).toHaveCount(0);
});

test("poker plays a full hand against the computer players", async ({ page }) => {
  await openGame(page, /^Texas Hold'em/);
  const screen = page.locator(".poker-screen");
  await page.getByRole("button", { name: "Deal the first hand" }).click();
  await expect(screen).toHaveAttribute("data-hand", "1");
  // Fold as soon as it's our turn (or wait for the hand to end), then skip to the end.
  await expect
    .poll(async () => {
      const turn = await screen.getAttribute("data-turn");
      const street = await screen.getAttribute("data-street");
      return turn === "You" || street === "showdown";
    }, { timeout: 20_000 })
    .toBe(true);
  if ((await screen.getAttribute("data-turn")) === "You") {
    await expect(page.locator(".coach-numbers")).toContainText("Win chance");
    await page.getByRole("button", { name: "Fold" }).click();
    await expect(page.locator(".coach-feedback")).toBeVisible();
    const skip = page.getByRole("button", { name: "Skip to the end" });
    if (await skip.isVisible()) await skip.click();
  }
  await expect(screen).toHaveAttribute("data-street", "showdown", { timeout: 20_000 });
  await expect(page.locator(".results-list li").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible();
  const data = await saved(page);
  expect(data.arcade.pokerChips).toBe(Number(await screen.getAttribute("data-chips")));
});

test("pool breaks with real physics and passes the turn by the rules", async ({ page }) => {
  await openGame(page, /^8-ball pool/);
  const screen = page.locator(".pool-screen");
  await expect(screen).toHaveAttribute("data-phase", "aim");
  await expect(page.locator(".pool-message")).toContainText("Break");
  await page.getByRole("button", { name: "Suggest a shot" }).click();
  await expect(page.locator(".coach-feedback")).toContainText("Break");
  await page.getByRole("button", { name: "Shoot" }).click();
  await expect(screen).toHaveAttribute("data-phase", "rolling");
  await expect(screen).toHaveAttribute("data-shots", "1", { timeout: 30_000 });
  await expect(page.locator(".pool-message")).not.toContainText("Break!");
  // Whoever is up next, play continues: either it's our aim again or the computer takes its shot.
  await expect.poll(async () => Number(await screen.getAttribute("data-shots")) >= 2 || (await screen.getAttribute("data-phase")) === "aim", { timeout: 40_000 }).toBe(true);
  await page.getByRole("button", { name: "Learn" }).click();
  await expect(page.getByRole("heading", { name: "Fouls" })).toBeVisible();
});
