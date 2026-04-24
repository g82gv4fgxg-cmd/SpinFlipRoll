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

export type CoinSide = {
  id: string;
  label: string;
  colorHex: string;
};

export type CoinSet = {
  id: string;
  name: string;
  sides: [CoinSide, CoinSide];
};

export type CoinFlipResult = {
  id: string;
  label: string;
  coinId: string;
  coinName: string;
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
  coinSets: CoinSet[];
  coinHistory: CoinFlipResult[];
  settings: AppSettings;
};
