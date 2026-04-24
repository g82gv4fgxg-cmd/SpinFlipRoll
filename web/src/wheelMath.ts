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

export function buildSegments(entries: WheelEntry[], weighted: boolean): Segment[] {
  if (entries.length === 0) return [];

  if (!weighted) {
    const slice = 360 / entries.length;
    return entries.map((_, index) => {
      const start = -90 + index * slice;
      return { start, end: start + slice, mid: start + slice / 2 };
    });
  }

  const total = entries.reduce((sum, entry) => sum + Math.max(entry.weight, 0), 0);
  const safeTotal = total > 0 ? total : entries.length;
  let cursor = -90;

  return entries.map((entry) => {
    const weight = total > 0 ? Math.max(entry.weight, 0) : 1;
    const angle = (weight / safeTotal) * 360;
    const segment = { start: cursor, end: cursor + angle, mid: cursor + angle / 2 };
    cursor += angle;
    return segment;
  });
}

export function pickWinner(entries: WheelEntry[], weighted: boolean, excluding?: string): number {
  if (entries.length === 0) return 0;

  let pool = entries.map((_, index) => index).filter((index) => entries[index].label !== excluding);
  if (pool.length === 0) pool = entries.map((_, index) => index);

  if (!weighted) {
    return pool[Math.floor(Math.random() * pool.length)] ?? 0;
  }

  const total = pool.reduce((sum, index) => sum + Math.max(entries[index].weight, 0), 0);
  const target = Math.random() * (total > 0 ? total : pool.length);
  let cursor = 0;

  for (const index of pool) {
    cursor += total > 0 ? Math.max(entries[index].weight, 0) : 1;
    if (target < cursor) return index;
  }

  return pool[pool.length - 1] ?? 0;
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
  const previous = entries.at(-1)?.colorHex;
  return (
    palette
      .filter((color) => color !== previous)
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0] ??
    palette[entries.length % palette.length]
  );
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
