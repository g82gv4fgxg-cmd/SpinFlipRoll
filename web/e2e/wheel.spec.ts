import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { freshApp, openMode, optionNames, saved, spinAndWait } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshApp(page);
  await openMode(page, "Wheel");
});

test("wheel names keep spaces and empty names are restored", async ({ page }) => {
  const title = page.getByLabel("Wheel name", { exact: true });
  await title.fill("");
  await title.pressSequentially("Friday night dinner");
  await expect(title).toHaveValue("Friday night dinner");
  await title.press("Enter");
  await title.fill("");
  await page.getByPlaceholder("Add option").click();
  await expect(title).toHaveValue("Friday night dinner");
  await expect(page.locator(".wheel-list .selected span")).toHaveText("Friday night dinner");
});

test("adding a duplicate option explains why nothing happened", async ({ page }) => {
  const add = page.getByPlaceholder("Add option");
  await add.fill("pizza");
  await add.press("Enter");
  await expect(page.locator("#entry-error")).toHaveText('"pizza" is already on this wheel.');
  await add.fill("Ramen");
  await expect(page.locator("#entry-error")).toBeEmpty();
});

test("a spin shows the winner, records it and returns focus", async ({ page }) => {
  await spinAndWait(page);
  await expect(page.getByRole("button", { name: "Done" })).toBeFocused();
  const winner = await page.locator(".win-card h2").textContent();
  await page.keyboard.press("Escape");
  await expect(page.locator(".win-overlay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Spin", exact: true })).toBeFocused();
  await expect(page.locator(".winner-banner strong")).toHaveText(winner!);
  await expect(page.locator(".history li span").first()).toHaveText(winner!);
});

test("options and settings are locked while the wheel spins", async ({ page }) => {
  await page.getByRole("button", { name: "Spin", exact: true }).click();
  await expect(page.getByRole("button", { name: "Weighted" })).toBeDisabled();
  await expect(page.getByPlaceholder("Add option")).toBeDisabled();
  await expect(page.locator(".wheel-list button").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove Pizza" })).toBeDisabled();
  await expect(page.getByLabel("Wheel name", { exact: true })).toBeEnabled();
});

test("eliminate removes the winner and the banner still names it", async ({ page }) => {
  await page.getByRole("button", { name: "Eliminate" }).click();
  await spinAndWait(page);
  const winner = (await page.locator(".win-card h2").textContent())!;
  await expect(page.locator(".win-note")).toHaveText("Removed from the wheel");
  await expect(page.locator(".remove-winner")).toHaveCount(0);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".winner-banner strong")).toHaveText(winner);
  expect(await optionNames(page)).not.toContain(winner);
  await expect(page.locator(".winner-segment")).toHaveCount(0);
});

test("several winners can be picked in one spin", async ({ page }) => {
  await page.getByRole("button", { name: "More winners" }).click();
  await page.getByRole("button", { name: "More winners" }).click();
  await expect(page.locator(".chip-stepper span")).toHaveText("3 winners");
  await expect(page.getByRole("button", { name: "More winners" })).toBeDisabled();
  await spinAndWait(page);
  const first = await page.locator(".win-card h2").textContent();
  const rest = await page.locator(".runner-ups li").allTextContents();
  expect(new Set([first, ...rest]).size).toBe(3);
  await page.getByRole("button", { name: "Remove all" }).click();
  expect(await optionNames(page)).toEqual([]);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await optionNames(page)).toEqual(["Pizza", "Sushi", "Tacos"]);
});

test("removing an option can be undone", async ({ page }) => {
  await page.getByRole("button", { name: "Remove Sushi" }).click();
  expect(await optionNames(page)).toEqual(["Pizza", "Tacos"]);
  await expect(page.locator(".toast")).toContainText('Removed "Sushi"');
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await optionNames(page)).toEqual(["Pizza", "Sushi", "Tacos"]);
});

test("templates create a ready-made wheel", async ({ page }) => {
  await page.getByRole("button", { name: "Start from a template" }).click();
  await page.getByRole("button", { name: /^Yes, no or maybe/ }).click();
  await expect(page.getByLabel("Wheel name", { exact: true })).toHaveValue("Yes, no or maybe");
  expect(await optionNames(page)).toEqual(["Yes", "No", "Maybe"]);
});

test("pasting a list adds options and skips ones already there", async ({ page }) => {
  await page.getByRole("button", { name: "Paste a list" }).click();
  await page.getByLabel("Options to add, one per line").fill("Ramen\nPizza\n\nPho\nramen");
  await page.getByRole("button", { name: "Add 4 options" }).click();
  expect(await optionNames(page)).toEqual(["Pizza", "Sushi", "Tacos", "Ramen", "Pho"]);
  await expect(page.locator(".toast")).toContainText("Added 2 options, skipped 2 already on the wheel");
});

test("make teams uses every option once", async ({ page }) => {
  await page.getByRole("button", { name: "Paste a list" }).click();
  await page.getByLabel("Options to add, one per line").fill("Ana, Ben, Cy, Dee, Eli");
  await page.getByRole("button", { name: "Add 5 options" }).click();
  await page.getByRole("button", { name: "Make teams" }).click();
  await page.getByLabel("Number of teams").selectOption("3");
  const members = await page.locator(".team-card li").allTextContents();
  expect(members.sort()).toEqual(["Ana", "Ben", "Cy", "Dee", "Eli", "Pizza", "Sushi", "Tacos"].sort());
  await expect(page.locator(".team-card")).toHaveCount(3);
});

test("a share link adds a copy of the wheel for someone else", async ({ page, browser }) => {
  await page.getByLabel("Wheel name", { exact: true }).fill("Team lunch");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const url = await page.getByLabel("Share link").inputValue();
  expect(url).toContain("#/share/");

  const friend = await browser.newPage();
  await friend.goto(url);
  await expect(friend.getByRole("dialog", { name: "Add shared wheel" })).toContainText("Team lunch");
  await friend.getByRole("button", { name: "Add wheel" }).click();
  await friend.locator(".wheel-app").waitFor();
  await expect(friend.getByLabel("Wheel name", { exact: true })).toHaveValue("Team lunch");
  expect(await optionNames(friend)).toEqual(["Pizza", "Sushi", "Tacos"]);
  await friend.close();
});

test("a broken share link explains itself", async ({ page }) => {
  await page.goto("./#/share/garbage");
  await expect(page.locator(".toast")).toContainText("That share link doesn't work");
  await expect(page.locator(".mode-screen")).toBeVisible();
});

test("stats count results for the wheel", async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await spinAndWait(page);
    await page.getByRole("button", { name: "Done" }).click();
  }
  await page.getByRole("tab", { name: "Stats" }).click();
  await expect(page.locator(".stats-summary")).toHaveText("Results from the last 2 spins");
  const counts = await page.locator(".stat-count").allTextContents();
  expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(2);
});

test("import handles bad files and keeps colours and weights", async ({ page }, testInfo) => {
  const file = (name: string, body: string) => {
    const path = testInfo.outputPath(name);
    fs.writeFileSync(path, body);
    return path;
  };
  const input = page.locator('.file-button input[type="file"]');
  await input.setInputFiles(file("bad.json", "{oops"));
  await expect(page.locator(".toast")).toContainText("Couldn't read that file");
  await input.setInputFiles(file("ios.json", JSON.stringify([{ label: "Curry", color: "E05555", weight: 0 }, "Pho", { label: "pho" }])));
  await expect(page.locator(".toast")).toContainText("Imported 2 options");
  await expect(page.getByLabel("Color for Curry")).toHaveValue("#e05555");
  await expect(page.getByLabel("Weight for Curry")).toHaveValue("0");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  expect(download.suggestedFilename()).toBe("my-wheel-entries.json");
  const exported = JSON.parse(fs.readFileSync((await download.path())!, "utf8"));
  expect(exported.map((entry: { label: string }) => entry.label)).toEqual(["Pizza", "Sushi", "Tacos", "Curry", "Pho"]);
});

test("deleting a wheel can be undone", async ({ page }) => {
  await page.getByPlaceholder("New wheel").fill("Second");
  await page.getByPlaceholder("New wheel").press("Enter");
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".wheel-list button")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".wheel-list button")).toHaveCount(2);
  await expect(page.getByLabel("Wheel name", { exact: true })).toHaveValue("Second");
});

test("the space bar spins", async ({ page }) => {
  await page.locator(".wheel-panel").click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("Space");
  await page.locator(".win-overlay").waitFor({ timeout: 10_000 });
});

test("presenter mode shows just the wheel", async ({ page }) => {
  await page.getByRole("button", { name: "Presenter mode" }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".controls")).toBeHidden();
  await expect(page.getByRole("button", { name: "Spin", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit presenter mode" }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("the browser back button returns to the picker", async ({ page }) => {
  await expect(page).toHaveURL(/#\/wheel$/);
  await page.goBack();
  await expect(page.locator(".mode-screen")).toBeVisible();
  await page.goForward();
  await expect(page.locator(".wheel-app")).toBeVisible();
  await page.getByRole("button", { name: "Modes", exact: true }).click();
  await expect(page.locator(".mode-screen")).toBeVisible();
  await expect(page).not.toHaveURL(/#/);
});

test("single options fill the wheel and zero weights draw no label", async ({ page }) => {
  await page.getByPlaceholder("New wheel").fill("Solo");
  await page.getByPlaceholder("New wheel").press("Enter");
  await page.getByPlaceholder("Add option").fill("Only");
  await page.getByPlaceholder("Add option").press("Enter");
  await expect(page.locator(".wheel circle[r='160']")).toHaveCount(1);
  await page.getByPlaceholder("Add option").fill("Never");
  await page.getByPlaceholder("Add option").press("Enter");
  await page.getByRole("button", { name: "Weighted" }).click();
  await page.getByLabel("Weight for Never").fill("0");
  await expect(page.locator(".wheel-label")).toHaveText(["Only"]);
});

test("the selected wheel is remembered", async ({ page }) => {
  await page.getByPlaceholder("New wheel").fill("Second");
  await page.getByPlaceholder("New wheel").press("Enter");
  expect((await saved(page)).selectedListId).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel("Wheel name", { exact: true })).toHaveValue("Second");
});
