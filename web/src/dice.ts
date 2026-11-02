import { randomInt } from "./random";
import type { DieSides } from "./types";

export const dieSides: DieSides[] = [4, 6, 8, 10, 12, 20];
export const minDice = 1;
export const maxDice = 6;

export const dicePresets: { label: string; count: number; sides: DieSides }[] = [
  { label: "One die", count: 1, sides: 6 },
  { label: "Two dice", count: 2, sides: 6 },
  { label: "Three dice", count: 3, sides: 6 },
  { label: "D20", count: 1, sides: 20 },
  { label: "Two D10", count: 2, sides: 10 },
  { label: "Four D4", count: 4, sides: 4 },
];

export function isDieSides(value: unknown): value is DieSides {
  return typeof value === "number" && (dieSides as number[]).includes(value);
}

export function rollDie(sides: DieSides): number {
  return randomInt(sides) + 1;
}

/** Rolls every die that isn't held; held dice keep their current value. */
export function rollDice(current: number[], count: number, sides: DieSides, held: ReadonlySet<number>): number[] {
  return Array.from({ length: count }, (_, index) =>
    held.has(index) && current[index] !== undefined && current[index] <= sides ? current[index] : rollDie(sides)
  );
}

export function clampDiceCount(count: number): number {
  return Math.min(maxDice, Math.max(minDice, Math.round(count) || minDice));
}
