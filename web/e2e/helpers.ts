import type { Page } from "@playwright/test";

export const storageKey = "spinfliproll:web:v1";

/** Opens the app with empty storage, or with the given saved data. */
export async function freshApp(page: Page, saved?: unknown) {
  await page.goto("./");
  await page.evaluate(
    ([key, value]) => {
      localStorage.clear();
      if (value) localStorage.setItem(key as string, JSON.stringify(value));
    },
    [storageKey, saved ?? null] as const
  );
  await page.reload();
}

export async function openMode(page: Page, mode: "Wheel" | "Coin" | "Dice") {
  await page.getByRole("button", { name: new RegExp(`^${mode}`) }).click();
  await page.locator(`.${mode.toLowerCase()}-app`).waitFor();
}

export function optionNames(page: Page) {
  return page.locator(".entry-row input:not([type])").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

export async function spinAndWait(page: Page) {
  await page.getByRole("button", { name: "Spin", exact: true }).click();
  await page.locator(".win-overlay").waitFor({ timeout: 10_000 });
}

export function saved(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), storageKey);
}
