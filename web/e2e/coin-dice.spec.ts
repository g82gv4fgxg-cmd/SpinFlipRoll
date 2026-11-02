import { expect, test } from "@playwright/test";
import { freshApp, openMode, saved } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test.describe("coin", () => {
  test.beforeEach(async ({ page }) => openMode(page, "Coin"));

  test("a flip lands on a side and is counted", async ({ page }) => {
    await page.getByRole("button", { name: "Flip", exact: true }).click();
    await expect(page.getByLabel("Label for side 1")).toBeDisabled();
    const result = page.locator(".coin-result strong");
    await expect(result).toHaveText(/^(Heads|Tails)$/, { timeout: 5000 });
    await expect(page.locator(".history li")).toHaveCount(1);
    await expect(page.locator(".coin-split p")).toContainText(/Heads \d.*Tails \d/);
  });

  test("names and side labels keep spaces, and empty labels are restored", async ({ page }) => {
    const name = page.getByLabel("Coin name", { exact: true });
    await name.fill("");
    await name.pressSequentially("Lunch coin");
    await expect(name).toHaveValue("Lunch coin");
    await page.getByLabel("Label for side 1").fill("");
    await page.getByLabel("Label for side 2").click();
    await expect(page.getByLabel("Label for side 1")).toHaveValue("Heads");
  });

  test("switching coins doesn't spin the coin backwards", async ({ page }) => {
    await page.getByRole("button", { name: "Flip", exact: true }).click();
    await expect(page.locator(".coin-result")).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder("New coin").fill("Second");
    await page.getByPlaceholder("New coin").press("Enter");
    await page.locator(".wheel-list button", { hasText: "Classic Coin" }).click();
    const transform = await page.locator(".coin").evaluate((el) => getComputedStyle(el).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
  });

  test("deleting a coin can be undone", async ({ page }) => {
    await page.getByPlaceholder("New coin").fill("Second");
    await page.getByPlaceholder("New coin").press("Enter");
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(".wheel-list button")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".wheel-list button")).toHaveCount(2);
  });
});

test.describe("dice", () => {
  test.beforeEach(async ({ page }) => openMode(page, "Dice"));

  test("rolling shows each die, the total and history", async ({ page }) => {
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.locator(".dice-total")).toHaveText(/^Total \d+$/, { timeout: 5000 });
    const labels = await page.locator(".die").evaluateAll((dice) => dice.map((die) => die.getAttribute("aria-label")));
    const values = labels.map((label) => Number(label!.match(/: (\d+)/)![1]));
    expect(values).toHaveLength(2);
    values.forEach((value) => expect(value).toBeGreaterThanOrEqual(1));
    values.forEach((value) => expect(value).toBeLessThanOrEqual(6));
    const total = Number((await page.locator(".dice-total").textContent())!.replace("Total ", ""));
    expect(total).toBe(values[0] + values[1]);
    await expect(page.locator(".history li")).toHaveCount(1);
  });

  test("a held die keeps its value", async ({ page }) => {
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.locator(".dice-total")).toBeVisible({ timeout: 5000 });
    const first = page.locator(".die").first();
    const before = await first.getAttribute("aria-label");
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Roll the rest" }).click();
      await expect(page.locator(".dice-total")).toBeVisible({ timeout: 5000 });
      expect(await first.getAttribute("aria-label")).toBe(`${before}, held`);
    }
  });

  test("presets, die count and sides are saved", async ({ page }) => {
    await page.getByRole("button", { name: /^D20/ }).click();
    await page.getByRole("button", { name: "More dice" }).click();
    await expect(page.locator(".die")).toHaveCount(2);
    await expect(page.locator(".die-d20")).toHaveCount(2);
    expect((await saved(page)).dice).toEqual({ count: 2, sides: 20 });
    await page.getByRole("button", { name: "d4", exact: true }).click();
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.locator(".dice-total")).toBeVisible({ timeout: 5000 });
    const values = await page.locator(".die").evaluateAll((dice) => dice.map((die) => Number(die.getAttribute("aria-label")!.match(/: (\d+)/)![1])));
    values.forEach((value) => expect(value).toBeLessThanOrEqual(4));
  });
});
