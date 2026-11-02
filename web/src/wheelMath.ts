import { randomInt } from "./random";
import type { WheelEntry } from "./types";

export const palette = [
  "D4756A",
  "E89450",
  "E8C44A",
  "5BAA7C",
  "5B8AC4",
  "8B6FBF",
  "BF6F96",
];

export type Segment = {
  start: number;
  end: number;
  mid: number;
};

/** Negative or invalid weights count as zero. */
function weightOf(entry: WheelEntry): number {
  return Number.isFinite(entry.weight) ? Math.max(entry.weight, 0) : 0;
}

function totalWeight(entries: WheelEntry[], indexes: number[]): number {
  return indexes.reduce((sum, index) => sum + weightOf(entries[index]), 0);
}

/** Case-insensitive key used to stop the same option being added twice. */
export function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

export function buildSegments(entries: WheelEntry[], weighted: boolean): Segment[] {
  if (entries.length === 0) return [];

  if (!weighted) {
    const slice = 360 / entries.length;
    return entries.map((_, index) => {
      const start = -90 + index * slice;
      return { start, end: start + slice, mid: start + slice / 2 };
    });
  }

  const total = entries.reduce((sum, entry) => sum + weightOf(entry), 0);
  const safeTotal = total > 0 ? total : entries.length;
  let cursor = -90;

  return entries.map((entry) => {
    const weight = total > 0 ? weightOf(entry) : 1;
    const angle = (weight / safeTotal) * 360;
    const segment = { start: cursor, end: cursor + angle, mid: cursor + angle / 2 };
    cursor += angle;
    return segment;
  });
}

export function pickWinner(entries: WheelEntry[], weighted: boolean, excluding?: string): number {
  if (entries.length === 0) return 0;

  const all = entries.map((_, index) => index);
  let pool = excluding === undefined ? all : all.filter((index) => entries[index].label !== excluding);

  // Only weight matters when some option has weight; zero-weight options have no slice to land on.
  const weightDecides = weighted && totalWeight(entries, all) > 0;
  const poolCanWin = weightDecides ? totalWeight(entries, pool) > 0 : pool.length > 0;
  // "No repeat" would leave nothing that can win, so allow a repeat rather than land on nothing.
  if (!poolCanWin) pool = all;

  if (!weightDecides) {
    return pool[randomInt(pool.length)] ?? 0;
  }

  const target = Math.random() * totalWeight(entries, pool);
  let cursor = 0;

  for (const index of pool) {
    cursor += weightOf(entries[index]);
    if (target < cursor) return index;
  }

  // Floating point rounding: fall back to the last option that has weight.
  return [...pool].reverse().find((index) => weightOf(entries[index]) > 0) ?? pool[pool.length - 1] ?? 0;
}

/**
 * Picks up to `count` different winners. The first one honours "No repeat" and is the slice the
 * wheel lands on; the rest are drawn from the options left over.
 */
export function pickWinners(entries: WheelEntry[], weighted: boolean, count: number, excluding?: string): number[] {
  if (entries.length === 0) return [];
  const all = entries.map((_, index) => index);
  const canWin = weighted && totalWeight(entries, all) > 0 ? all.filter((index) => weightOf(entries[index]) > 0) : all;
  const target = Math.max(1, Math.min(Math.floor(count) || 1, canWin.length));
  const winners = [pickWinner(entries, weighted, excluding)];

  while (winners.length < target) {
    const remaining = canWin.filter((index) => !winners.includes(index));
    const pick = pickWinner(
      remaining.map((index) => entries[index]),
      weighted
    );
    winners.push(remaining[pick]);
  }

  return winners;
}

export function spinDelta(segment: Segment, currentRotation: number, spins = 7): number {
  const margin = (segment.end - segment.start) * 0.15;
  const target = randomBetween(segment.start + margin, segment.end - margin);
  const mod = currentRotation % 360;
  const normalized = mod < 0 ? mod + 360 : mod;
  return spins * 360 + (-90 - target - normalized);
}

export function nextColorHex(entries: WheelEntry[]): string {
  const counts = new Map<string, number>();
  entries.forEach((entry) => counts.set(entry.colorHex, (counts.get(entry.colorHex) ?? 0) + 1));
  // A new slice sits between the last slice and, wrapping round the wheel, the first one.
  const neighbours = new Set([entries[entries.length - 1]?.colorHex, entries[0]?.colorHex]);
  return (
    palette
      .filter((color) => !neighbours.has(color))
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0] ??
    palette[entries.length % palette.length]
  );
}

/** Returns an upper-case 6-digit hex colour without "#", or null if the value isn't a hex colour. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return hex
      .split("")
      .map((char) => char + char)
      .join("")
      .toUpperCase();
  }
  return null;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
