import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { freshApp, openMode } from "./helpers";

const enhanced = { settings: { visuals: "enhanced" } };

/** Which of three equal slices sits under the pointer for a wheel rotation in degrees. */
function sliceUnderPointer(rotation: number) {
  return ["Pizza", "Sushi", "Tacos"][Math.floor(((((-rotation) % 360) + 360) % 360) / 120)];
}

/** Drags the wheel along an arc with real-device timing (a pointer event every 12 ms). */
function dragWheel(page: Page, stepRadians: number, steps: number) {
  return page.evaluate(
    ([step, count]) => {
      const canvas = document.querySelector(".physics-wheel")!;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2 + Math.min(rect.width, rect.height) * 0.035;
      const r = rect.width * 0.3;
      const fire = (type: string, a: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "touch", clientX: cx + Math.cos(a) * r, clientY: cy + Math.sin(a) * r })
        );
      const wait = (ms: number) => {
        const end = performance.now() + ms;
        while (performance.now() < end);
      };
      let a = Math.PI;
      fire("pointerdown", a);
      for (let i = 0; i < count; i++) {
        wait(12);
        a += step;
        fire("pointermove", a);
      }
      wait(4);
      fire("pointerup", a);
    },
    [stepRadians, steps] as const
  );
}

test.describe("physics wheel", () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page, enhanced);
    await openMode(page, "Wheel");
    await expect(page.locator(".physics-wheel")).toBeVisible();
  });

  test("lands on the winner it announces", async ({ page }) => {
    const wheel = page.locator(".physics-wheel");
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Spin", exact: true }).click();
      await expect(wheel).toHaveAttribute("data-state", "spinning");
      await page.locator(".win-overlay").waitFor({ timeout: 10_000 });
      await expect(wheel).toHaveAttribute("data-state", "idle");
      const winner = await page.locator(".win-card h2").textContent();
      expect(sliceUnderPointer(Number(await wheel.getAttribute("data-rotation")))).toBe(winner);
      await page.getByRole("button", { name: "Done" }).click();
    }
  });

  test("a flick spins it from the release speed", async ({ page }) => {
    const wheel = page.locator(".physics-wheel");
    await dragWheel(page, 0.22, 7);
    expect(Number(await wheel.getAttribute("data-release"))).toBeGreaterThan(6);
    await expect(page.getByRole("button", { name: "Spinning..." })).toBeVisible();
    await page.locator(".win-overlay").waitFor({ timeout: 15_000 });
    const winner = await page.locator(".win-card h2").textContent();
    expect(sliceUnderPointer(Number(await wheel.getAttribute("data-rotation")))).toBe(winner);
  });

  test("a gentle nudge just turns it, without picking anything", async ({ page }) => {
    await dragWheel(page, 0.01, 5);
    await page.waitForTimeout(1500);
    await expect(page.locator(".win-overlay")).toHaveCount(0);
    await expect(page.locator(".history li")).toHaveCount(0);
  });
});

test("the physics coin lands on the side it reports", async ({ page }) => {
  await freshApp(page, enhanced);
  await openMode(page, "Coin");
  const coin = page.locator(".physics-coin");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Flip", exact: true }).click();
    await expect(page.locator(".coin-result")).toBeVisible({ timeout: 8000 });
    const label = await page.locator(".coin-result strong").textContent();
    await expect(coin).toHaveAttribute("data-face", label === "Heads" ? "0" : "1");
  }
});

test("physics dice show the values they report, and held dice keep theirs", async ({ page }) => {
  await freshApp(page, { ...enhanced, dice: { count: 3, sides: 6 } });
  await openMode(page, "Dice");
  const table = page.locator(".dice-table");
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(page.locator(".dice-total")).toBeVisible({ timeout: 8000 });
  const chips = (await page.locator(".die-chip").allTextContents()).map(Number);
  await expect(table).toHaveAttribute("data-values", chips.join(","));
  expect(await page.locator(".dice-total").textContent()).toBe(`Total ${chips.reduce((a, b) => a + b, 0)}`);

  await page.locator(".die-chip").first().click();
  await expect(page.locator(".die-chip").first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Roll the rest" }).click();
  await expect(page.locator(".dice-total")).toBeVisible({ timeout: 8000 });
  const after = (await page.locator(".die-chip").allTextContents()).map(Number);
  expect(after[0]).toBe(chips[0]);
  await expect(table).toHaveAttribute("data-values", after.join(","));

  for (const sides of ["d20", "d4"]) {
    await page.getByRole("button", { name: sides, exact: true }).click();
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await expect(page.locator(".dice-total")).toBeVisible({ timeout: 8000 });
    await expect(table).toHaveAttribute("data-values", (await page.locator(".die-chip").allTextContents()).join(","));
  }
});

test("the visuals toggle switches between physics and classic", async ({ page }) => {
  await freshApp(page, enhanced);
  await openMode(page, "Wheel");
  const toggle = page.getByRole("button", { name: "Enhanced visuals" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(page.locator(".physics-wheel")).toHaveCount(0);
  await expect(page.locator("svg.wheel")).toBeVisible();
  await toggle.click();
  await expect(page.locator(".physics-wheel")).toBeVisible();
});

test.describe("with full motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("enhanced visuals are on by default, with confetti for the winner", async ({ page }) => {
    await freshApp(page);
    await openMode(page, "Wheel");
    await expect(page.locator(".physics-wheel")).toBeVisible();
    await page.getByRole("button", { name: "Spin", exact: true }).click();
    await page.locator(".win-overlay").waitFor({ timeout: 10_000 });
    await expect(page.locator(".confetti-canvas")).toBeVisible();
  });
});
