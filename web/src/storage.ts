import type {
  AppData,
  AppSettings,
  CoinFlipResult,
  CoinSet,
  CoinSide,
  DiceRollResult,
  DiceSettings,
  SpinResult,
  WheelEntry,
  WheelList,
} from "./types";
import { clampDiceCount, isDieSides } from "./dice";
import { labelKey, nextColorHex, normalizeHex, palette } from "./wheelMath";

const storageKey = "spinfliproll:web:v1";
const themeKey = "spinfliproll:theme";

export type Theme = "dark" | "light";

let idCounter = 0;

/**
 * `crypto.randomUUID` only exists on HTTPS and localhost, so fall back elsewhere
 * (for example when testing on a phone over the local network).
 */
export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultCoinSides(): [CoinSide, CoinSide] {
  return [
    { id: createId(), label: "Heads", colorHex: "E8C44A" },
    { id: createId(), label: "Tails", colorHex: "5B8AC4" },
  ];
}

export const defaultSettings: AppSettings = {
  weighted: false,
  noRepeat: false,
  eliminate: false,
  winnerCount: 1,
  sound: true,
  secretUnlocked: false,
  visuals: "auto",
};

export function createDefaultData(): AppData {
  const listId = createId();
  const coinId = createId();
  return {
    lists: [
      {
        id: listId,
        name: "My Wheel",
        entries: [
          { id: createId(), label: "Pizza", colorHex: "D4756A", weight: 1 },
          { id: createId(), label: "Sushi", colorHex: "5BAA7C", weight: 1 },
          { id: createId(), label: "Tacos", colorHex: "5B8AC4", weight: 1 },
        ],
      },
    ],
    history: [],
    coinSets: [{ id: coinId, name: "Classic Coin", sides: createDefaultCoinSides() }],
    coinHistory: [],
    dice: { count: 2, sides: 6 },
    diceHistory: [],
    selectedListId: listId,
    selectedCoinId: coinId,
    gameBest: 0,
    settings: { ...defaultSettings },
  };
}

export function loadData(): AppData {
  const fallback = createDefaultData();
  const saved = readItem(storageKey);
  if (!saved) return fallback;

  let raw: unknown;
  try {
    raw = JSON.parse(saved);
  } catch {
    return fallback;
  }
  if (!isRecord(raw)) return fallback;

  // Saved data is checked field by field so one damaged value can't stop the app from loading.
  const savedLists = arrayOf(raw.lists, toWheelList);
  const savedCoins = arrayOf(raw.coinSets, toCoinSet);
  const lists = savedLists.length ? savedLists : fallback.lists;
  const coinSets = savedCoins.length ? savedCoins : fallback.coinSets;
  return {
    lists,
    history: arrayOf(raw.history, toSpinResult),
    coinSets,
    coinHistory: arrayOf(raw.coinHistory, toCoinFlipResult),
    dice: toDiceSettings(raw.dice),
    diceHistory: arrayOf(raw.diceHistory, toDiceRollResult),
    selectedListId: pickId(raw.selectedListId, lists),
    selectedCoinId: pickId(raw.selectedCoinId, coinSets),
    gameBest: typeof raw.gameBest === "number" && Number.isFinite(raw.gameBest) ? Math.max(0, Math.floor(raw.gameBest)) : 0,
    settings: toSettings(raw.settings),
  };
}

export function saveData(data: AppData): void {
  writeItem(storageKey, JSON.stringify(data));
}

/** The theme the user picked, or null if they haven't chosen one (then the device setting is used). */
export function loadThemePreference(): Theme | null {
  const saved = readItem(themeKey);
  return saved === "light" || saved === "dark" ? saved : null;
}

export function saveTheme(theme: Theme): void {
  writeItem(themeKey, theme);
}

export type ImportedEntry = {
  label: string;
  colorHex: string | null;
  weight: number;
};

/**
 * Reads options from imported JSON: this app's export, the iOS app's export (which uses
 * a "color" key) or a plain list of names. Returns null when the JSON isn't a list.
 */
export function parseImportedEntries(json: unknown): ImportedEntry[] | null {
  const items = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.entries) ? json.entries : null;
  if (!items) return null;

  return items.flatMap((item): ImportedEntry[] => {
    if (typeof item === "string") {
      const label = item.trim();
      return label ? [{ label, colorHex: null, weight: 1 }] : [];
    }
    if (!isRecord(item)) return [];
    const label = toText(item.label)?.trim();
    if (!label) return [];
    return [{ label, colorHex: normalizeHex(item.colorHex ?? item.color), weight: toWeight(item.weight) }];
  });
}

/** Turns imported options into new entries, skipping labels already on the wheel or repeated in the file. */
export function entriesToAdd(existing: WheelEntry[], imported: ImportedEntry[]): WheelEntry[] {
  const seen = new Set(existing.map((entry) => labelKey(entry.label)));
  const added: WheelEntry[] = [];

  for (const item of imported) {
    const key = labelKey(item.label);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({
      id: createId(),
      label: item.label,
      colorHex: item.colorHex ?? nextColorHex([...existing, ...added]),
      weight: item.weight,
    });
  }

  return added;
}

function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be blocked by browser privacy settings.
    return null;
  }
}

function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is full or blocked: keep working with the in-memory copy.
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOf<T>(value: unknown, convert: (item: unknown, index: number) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(convert).filter((item): item is T => item !== null);
}

function toText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function idOrNew(value: unknown): string {
  return typeof value === "string" && value ? value : createId();
}

function toTimestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function toWeight(value: unknown): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? Math.max(0, number) : 1;
}

function toEntry(value: unknown, index: number): WheelEntry | null {
  if (!isRecord(value)) return null;
  const label = toText(value.label);
  if (label === null) return null;
  return {
    id: idOrNew(value.id),
    label,
    colorHex: normalizeHex(value.colorHex) ?? palette[index % palette.length],
    weight: toWeight(value.weight),
  };
}

function toWheelList(value: unknown): WheelList | null {
  if (!isRecord(value)) return null;
  return {
    id: idOrNew(value.id),
    name: toText(value.name) ?? "My Wheel",
    entries: arrayOf(value.entries, toEntry),
  };
}

function toCoinSide(value: unknown, fallback: CoinSide): CoinSide {
  if (!isRecord(value)) return fallback;
  return {
    id: idOrNew(value.id),
    label: toText(value.label) ?? fallback.label,
    colorHex: normalizeHex(value.colorHex) ?? fallback.colorHex,
  };
}

function toCoinSet(value: unknown): CoinSet | null {
  if (!isRecord(value)) return null;
  const sides = Array.isArray(value.sides) ? value.sides : [];
  const [heads, tails] = createDefaultCoinSides();
  return {
    id: idOrNew(value.id),
    name: toText(value.name) ?? "My Coin",
    sides: [toCoinSide(sides[0], heads), toCoinSide(sides[1], tails)],
  };
}

function toSpinResult(value: unknown): SpinResult | null {
  if (!isRecord(value)) return null;
  const label = toText(value.label);
  const timestamp = toTimestamp(value.timestamp);
  if (label === null || timestamp === null || typeof value.listId !== "string") return null;
  return {
    id: idOrNew(value.id),
    label,
    listId: value.listId,
    listName: toText(value.listName) ?? "",
    timestamp,
  };
}

function toCoinFlipResult(value: unknown): CoinFlipResult | null {
  if (!isRecord(value)) return null;
  const label = toText(value.label);
  const timestamp = toTimestamp(value.timestamp);
  if (label === null || timestamp === null || typeof value.coinId !== "string") return null;
  return {
    id: idOrNew(value.id),
    label,
    coinId: value.coinId,
    coinName: toText(value.coinName) ?? "",
    timestamp,
  };
}

function toSettings(value: unknown): AppSettings {
  const settings = isRecord(value) ? value : {};
  return {
    weighted: settings.weighted === true,
    noRepeat: settings.noRepeat === true,
    eliminate: settings.eliminate === true,
    winnerCount:
      typeof settings.winnerCount === "number" && settings.winnerCount >= 1
        ? Math.min(10, Math.floor(settings.winnerCount))
        : 1,
    sound: settings.sound !== false,
    secretUnlocked: settings.secretUnlocked === true,
    visuals: settings.visuals === "enhanced" || settings.visuals === "classic" ? settings.visuals : "auto",
  };
}

function toDiceSettings(value: unknown): DiceSettings {
  const dice = isRecord(value) ? value : {};
  return {
    count: typeof dice.count === "number" ? clampDiceCount(dice.count) : 2,
    sides: isDieSides(dice.sides) ? dice.sides : 6,
  };
}

function toDiceRollResult(value: unknown): DiceRollResult | null {
  if (!isRecord(value) || !isDieSides(value.sides) || !Array.isArray(value.values)) return null;
  const sides = value.sides;
  const values = value.values.filter(
    (item): item is number => typeof item === "number" && Number.isInteger(item) && item >= 1 && item <= sides
  );
  const timestamp = toTimestamp(value.timestamp);
  if (values.length === 0 || timestamp === null) return null;
  return {
    id: idOrNew(value.id),
    values,
    sides,
    total: values.reduce((sum, item) => sum + item, 0),
    timestamp,
  };
}

/** Keeps a saved selection only if that wheel or coin still exists. */
function pickId(value: unknown, items: { id: string }[]): string {
  return typeof value === "string" && items.some((item) => item.id === value) ? value : items[0]?.id ?? "";
}
