import { afterEach, describe, expect, it, vi } from "vitest";
import { clampDiceCount, rollDice } from "./dice";
import { mergeHistory, restoreAt, splitPasted } from "./format";
import { randomInt, shuffle } from "./random";
import { decodeWheel, encodeWheel } from "./share";
import { entriesToAdd, loadData, parseImportedEntries } from "./storage";
import { splitIntoTeams } from "./teams";

afterEach(() => vi.unstubAllGlobals());

function withSaved(value: unknown) {
  vi.stubGlobal("localStorage", {
    getItem: () => (typeof value === "string" ? value : JSON.stringify(value)),
    setItem: () => undefined,
  });
}

describe("loadData", () => {
  it("returns defaults when nothing is saved or storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    const data = loadData();
    expect(data.lists[0].entries.map((entry) => entry.label)).toEqual(["Pizza", "Sushi", "Tacos"]);
    expect(data.selectedListId).toBe(data.lists[0].id);
    expect(data.settings.sound).toBe(true);
  });

  it("repairs older or damaged saved data instead of failing", () => {
    withSaved({
      lists: [{ id: "l1", name: "Old", entries: [{ id: "e1", label: "A" }, { label: 5, colorHex: "#abc", weight: "2" }, "junk"] }],
      history: [{ id: "h1", label: "A", listId: "l1", timestamp: "not a date" }],
      dice: { count: 99, sides: 7 },
      selectedListId: "missing",
      settings: { weighted: true, winnerCount: 50 },
    });
    const data = loadData();
    expect(data.lists[0].entries).toHaveLength(2);
    expect(data.lists[0].entries[1]).toMatchObject({ label: "5", colorHex: "AABBCC", weight: 2 });
    expect(data.history).toHaveLength(0);
    expect(data.dice).toEqual({ count: 6, sides: 6 });
    expect(data.selectedListId).toBe("l1");
    expect(data.coinSets).toHaveLength(1);
    expect(data.settings).toMatchObject({ weighted: true, winnerCount: 10, sound: true, secretUnlocked: false });
  });

  it("falls back to defaults for unreadable JSON", () => {
    withSaved("{broken");
    expect(loadData().lists[0].name).toBe("My Wheel");
  });
});

describe("importing", () => {
  it("reads this app's format, the iOS format and plain names", () => {
    const parsed = parseImportedEntries([
      { label: " Ramen ", colorHex: "E05555", weight: 2 },
      { label: "Curry", color: "#5baa7c", weight: 0 },
      "Laksa",
      { nope: true },
    ]);
    expect(parsed).toEqual([
      { label: "Ramen", colorHex: "E05555", weight: 2 },
      { label: "Curry", colorHex: "5BAA7C", weight: 0 },
      { label: "Laksa", colorHex: null, weight: 1 },
    ]);
    expect(parseImportedEntries({ label: "x" })).toBeNull();
  });

  it("skips duplicates against the wheel and within the file", () => {
    const existing = [{ id: "1", label: "Pizza", colorHex: "D4756A", weight: 1 }];
    const added = entriesToAdd(existing, [
      { label: "pizza", colorHex: null, weight: 1 },
      { label: "Pho", colorHex: null, weight: 1 },
      { label: "PHO", colorHex: null, weight: 1 },
      { label: "Bao", colorHex: null, weight: 1 },
    ]);
    expect(added.map((entry) => entry.label)).toEqual(["Pho", "Bao"]);
    expect(added[0].colorHex).not.toBe(added[1].colorHex);
  });

  it("splits pasted text by line, or by comma on a single line", () => {
    expect(splitPasted("A\n\n B \r\nC")).toEqual(["A", "B", "C"]);
    expect(splitPasted("A, B; C")).toEqual(["A", "B", "C"]);
    expect(splitPasted("  ")).toEqual([]);
  });
});

describe("share links", () => {
  it("round-trips a wheel, including non-English text", () => {
    const text = encodeWheel({
      name: "Dîner 🍜",
      entries: [
        { id: "a", label: "寿司", colorHex: "5BAA7C", weight: 2 },
        { id: "b", label: "Pho", colorHex: "E89450", weight: 0 },
      ],
    });
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeWheel(text)).toEqual({
      name: "Dîner 🍜",
      entries: [
        { label: "寿司", colorHex: "5BAA7C", weight: 2 },
        { label: "Pho", colorHex: "E89450", weight: 0 },
      ],
    });
  });

  it("rejects broken links", () => {
    expect(decodeWheel("not-a-real-link")).toBeNull();
    expect(decodeWheel(encodeWheel({ name: "Empty", entries: [] }))).toBeNull();
  });
});

describe("teams", () => {
  it("uses everyone once and keeps team sizes within one", () => {
    const names = Array.from({ length: 11 }, (_, index) => `P${index}`);
    const teams = splitIntoTeams(names, 3);
    expect(teams.flat().sort()).toEqual([...names].sort());
    const sizes = teams.map((team) => team.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});

describe("dice", () => {
  it("keeps held dice and rolls the rest within range", () => {
    for (let i = 0; i < 500; i++) {
      const values = rollDice([5, 2, 6], 3, 6, new Set([0, 2]));
      expect(values[0]).toBe(5);
      expect(values[2]).toBe(6);
      expect(values[1]).toBeGreaterThanOrEqual(1);
      expect(values[1]).toBeLessThanOrEqual(6);
    }
    expect(clampDiceCount(0)).toBe(1);
    expect(clampDiceCount(9)).toBe(6);
  });

  it("rolls every face of a d20 roughly equally", () => {
    const counts = new Array(20).fill(0);
    for (let i = 0; i < 40000; i++) counts[rollDice([], 1, 20, new Set())[0] - 1]++;
    counts.forEach((count) => expect(count / 40000).toBeCloseTo(0.05, 1));
  });
});

describe("helpers", () => {
  it("randomInt stays in range and shuffle keeps every item", () => {
    for (let i = 0; i < 1000; i++) {
      const value = randomInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });

  it("restoreAt puts removed items back in place", () => {
    const removed = [
      { item: { id: "b" }, index: 1 },
      { item: { id: "d" }, index: 3 },
    ];
    expect(restoreAt([{ id: "a" }, { id: "c" }], removed).map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("mergeHistory keeps newest first without duplicates", () => {
    const merged = mergeHistory(
      [{ id: "2", timestamp: "2026-01-02T00:00:00Z" }],
      [
        { id: "1", timestamp: "2026-01-01T00:00:00Z" },
        { id: "2", timestamp: "2026-01-02T00:00:00Z" },
        { id: "3", timestamp: "2026-01-03T00:00:00Z" },
      ],
      10
    );
    expect(merged.map((item) => item.id)).toEqual(["3", "2", "1"]);
  });
});
