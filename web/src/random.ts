/** Unbiased random integer from 0 to max - 1, using the crypto generator where available. */
export function randomInt(max: number): number {
  if (max <= 1) return 0;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const limit = Math.floor(0x100000000 / max) * max;
    const buffer = new Uint32Array(1);
    // Reject values from the uneven tail so every outcome is equally likely.
    do {
      crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/** Fisher-Yates shuffle that returns a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
