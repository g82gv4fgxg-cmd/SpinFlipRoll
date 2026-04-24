import type { AppData } from "./types";

const storageKey = "spinfliproll:web:v1";

export const defaultData: AppData = {
  lists: [
    {
      id: crypto.randomUUID(),
      name: "My Wheel",
      entries: [
        { id: crypto.randomUUID(), label: "Pizza", colorHex: "D4756A", weight: 1 },
        { id: crypto.randomUUID(), label: "Sushi", colorHex: "5BAA7C", weight: 1 },
        { id: crypto.randomUUID(), label: "Tacos", colorHex: "5B8AC4", weight: 1 },
      ],
    },
  ],
  history: [],
  settings: {
    weighted: false,
    noRepeat: false,
    eliminate: false,
    winnerCount: 1,
  },
};

export function loadData(): AppData {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return defaultData;

  try {
    const data = JSON.parse(saved) as AppData;
    return {
      lists: data.lists?.length ? data.lists : defaultData.lists,
      history: data.history ?? [],
      settings: { ...defaultData.settings, ...data.settings },
    };
  } catch {
    return defaultData;
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(storageKey, JSON.stringify(data));
}
