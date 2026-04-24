export type WheelEntry = {
  id: string;
  label: string;
  colorHex: string;
  weight: number;
};

export type WheelList = {
  id: string;
  name: string;
  entries: WheelEntry[];
};

export type SpinResult = {
  id: string;
  label: string;
  listId: string;
  listName: string;
  timestamp: string;
};

export type AppSettings = {
  weighted: boolean;
  noRepeat: boolean;
  eliminate: boolean;
  winnerCount: number;
};

export type AppData = {
  lists: WheelList[];
  history: SpinResult[];
  settings: AppSettings;
};
