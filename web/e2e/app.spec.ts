import { expect, test } from "@playwright/test";
import { freshApp, openMode, saved, storageKey } from "./helpers";

test.describe("theme", () => {
  test.use({ colorScheme: "light" });

  test("follows the device until the user picks one", async ({ page }) => {
    await freshApp(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0b1020");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test("the sound setting is remembered", async ({ page }) => {
  await freshApp(page);
  await openMode(page, "Wheel");
  const sound = page.getByRole("button", { name: "Sound" });
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  expect((await saved(page)).settings.sound).toBe(false);
});

test("older saved data still loads", async ({ page }) => {
  await freshApp(page, {
    lists: [{ id: "l1", name: "Old wheel", entries: [{ id: "e1", label: "A" }, { id: "e2", label: "B", colorHex: "#5baa7c", weight: "2" }] }],
    history: [{ id: "h1", label: "A", listId: "l1", listName: "Old wheel", timestamp: "not a date" }],
    settings: { weighted: true },
  });
  await openMode(page, "Wheel");
  await expect(page.getByLabel("Wheel name", { exact: true })).toHaveValue("Old wheel");
  await expect(page.getByLabel("Color for B")).toHaveValue("#5baa7c");
  await expect(page.getByText("No spins yet")).toBeVisible();
});

test("works when storage is blocked and crypto.randomUUID is missing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });
  });
  await page.goto("./");
  await openMode(page, "Wheel");
  await page.getByPlaceholder("Add option").fill("Still works");
  await page.getByPlaceholder("Add option").press("Enter");
  await expect(page.getByLabel("Name of option 4")).toHaveValue("Still works");
  expect(errors).toEqual([]);
});

test("nothing scrolls sideways at common screen widths", async ({ page }) => {
  await freshApp(page, { settings: { secretUnlocked: true } });
  for (const screen of ["", "#/wheel", "#/coin", "#/dice", "#/play", "#/play/blackjack", "#/play/poker", "#/play/pool"]) {
    await page.goto(`./${screen}`);
    for (const width of [360, 768, 950, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `${screen || "home"} at ${width}px`).toBeLessThanOrEqual(width);
    }
  }
});

test("opens offline after the first visit", async ({ page, context }) => {
  await freshApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the service worker controls the page, then go offline.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Choose your picker" })).toBeVisible();
  await openMode(page, "Dice");
  await context.setOffline(false);
});

test("the web manifest is valid for installing", async ({ request }) => {
  const manifest = await (await request.get("./manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) expect((await request.get(`./${icon.src}`)).ok()).toBe(true);
});

test.describe("full animations", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a full-length spin still lands on the winner", async ({ page }) => {
    await freshApp(page);
    await openMode(page, "Wheel");
    await page.getByRole("button", { name: "Spin", exact: true }).click();
    await expect(page.getByRole("button", { name: "Spinning..." })).toBeVisible();
    await page.locator(".win-overlay").waitFor({ timeout: 8000 });
    const winner = await page.locator(".win-card h2").textContent();
    expect(["Pizza", "Sushi", "Tacos"]).toContain(winner);
    expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).history.length, storageKey))).toBe(1);
  });
});
