import { describe, expect, it } from "vitest";
import type { WheelEntry } from "./types";
import { buildSegments, nextColorHex, normalizeHex, pickWinner, pickWinners, spinDelta } from "./wheelMath";

const entry = (label: string, weight = 1, colorHex = "D4756A"): WheelEntry => ({ id: label, label, weight, colorHex });

function shares(entries: WheelEntry[], weighted: boolean, runs = 60000, excluding?: string) {
  const counts = entries.map(() => 0);
  for (let i = 0; i < runs; i++) counts[pickWinner(entries, weighted, excluding)]++;
  return counts.map((count) => count / runs);
}

describe("pickWinner", () => {
  it("follows the weights", () => {
    const result = shares([entry("A", 1), entry("B", 2), entry("C", 0), entry("D", 3)], true);
    expect(result[0]).toBeCloseTo(1 / 6, 1);
    expect(result[1]).toBeCloseTo(2 / 6, 1);
    expect(result[2]).toBe(0);
    expect(result[3]).toBeCloseTo(3 / 6, 1);
  });

  it("never repeats the excluded option when others can win", () => {
    const result = shares([entry("A"), entry("B"), entry("C")], false, 5000, "B");
    expect(result[1]).toBe(0);
  });

  it("allows a repeat rather than landing on a zero-weight option", () => {
    const result = shares([entry("Only", 1), entry("Z1", 0), entry("Z2", 0)], true, 5000, "Only");
    expect(result[0]).toBe(1);
  });

  it("treats all-zero weights as equal", () => {
    const result = shares([entry("A", 0), entry("B", 0)], true, 20000);
    expect(result[0]).toBeCloseTo(0.5, 1);
  });
});

describe("pickWinners", () => {
  it("picks different winners", () => {
    for (let i = 0; i < 200; i++) {
      const winners = pickWinners([entry("A"), entry("B"), entry("C"), entry("D")], false, 3);
      expect(new Set(winners).size).toBe(3);
    }
  });

  it("caps at the number of options that can win", () => {
    expect(pickWinners([entry("A", 1), entry("B", 0), entry("C", 1)], true, 5)).toHaveLength(2);
    expect(pickWinners([entry("A"), entry("B")], false, 5)).toHaveLength(2);
  });
});

describe("spinDelta", () => {
  it("always stops inside the chosen slice, under the pointer", () => {
    const entries = [entry("A", 1), entry("B", 2), entry("C", 0.5), entry("D", 3)];
    for (let i = 0; i < 2000; i++) {
      const segments = buildSegments(entries, i % 2 === 0);
      const chosen = i % entries.length;
      const start = Math.random() * 100000 - 50000;
      const end = start + spinDelta(segments[chosen], start);
      const underPointer = (((-90 - end) % 360) + 360) % 360;
      const sliceStart = ((segments[chosen].start % 360) + 360) % 360;
      const offset = (((underPointer - sliceStart) % 360) + 360) % 360;
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(segments[chosen].end - segments[chosen].start);
      expect(end - start).toBeGreaterThan(360 * 4);
    }
  });
});

describe("nextColorHex", () => {
  it("avoids matching neighbours, including the wrap-around to the first slice", () => {
    const list: WheelEntry[] = [];
    for (let i = 0; i < 12; i++) list.push(entry(`O${i}`, 1, nextColorHex(list)));
    list.forEach((item, index) => expect(item.colorHex).not.toBe(list[(index + 1) % list.length].colorHex));
  });
});

describe("normalizeHex", () => {
  it("accepts 3 and 6 digit colours with or without #", () => {
    expect(normalizeHex("#5baa7c")).toBe("5BAA7C");
    expect(normalizeHex("abc")).toBe("AABBCC");
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex(42)).toBeNull();
  });
});
