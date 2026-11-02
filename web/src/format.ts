/** "3:15 pm" today, "Tue 3:15 pm" this week, otherwise "12 Oct". */
export function formatWhen(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days >= 0 && days < 6) return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

export function fileSafeName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "wheel"
  );
}

export function displayHex(hex: string, theme: "dark" | "light", darkAmount: number): string {
  return theme === "dark" ? darkenHex(hex, darkAmount) : hex;
}

export function darkenHex(hex: string, amount: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 6 ? normalized : "888888", 16);
  const r = Math.round(((value >> 16) & 255) * amount);
  const g = Math.round(((value >> 8) & 255) * amount);
  const b = Math.round((value & 255) * amount);
  return [r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Puts back items removed from a list at their old positions, skipping any that are already there. */
export function restoreAt<T extends { id: string }>(current: T[], removed: { item: T; index: number }[]): T[] {
  const next = [...current];
  [...removed]
    .sort((a, b) => a.index - b.index)
    .forEach(({ item, index }) => {
      if (!next.some((existing) => existing.id === item.id)) next.splice(Math.min(index, next.length), 0, item);
    });
  return next;
}

/** Merges two newest-first histories, keeping newest first. */
export function mergeHistory<T extends { id: string; timestamp: string }>(current: T[], restored: T[], limit: number): T[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...restored.filter((item) => !seen.has(item.id))]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);
}

/** One option per line, or comma-separated if everything is on one line. */
export function splitPasted(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parts = lines.length === 1 && /[,;]/.test(lines[0]) ? lines[0].split(/[,;]/) : lines;
  return parts.map((part) => part.trim()).filter(Boolean);
}
