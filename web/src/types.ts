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

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20;

export type DiceSettings = {
  count: number;
  sides: DieSides;
};

export type DiceRollResult = {
  id: string;
  values: number[];
  sides: DieSides;
  total: number;
  timestamp: string;
};

export type AppSettings = {
  weighted: boolean;
  noRepeat: boolean;
  eliminate: boolean;
  /** How many winners each spin picks. */
  winnerCount: number;
  sound: boolean;
  secretUnlocked: boolean;
  /** "auto" uses the physics visuals unless the device asks for reduced motion. */
  visuals: "auto" | "enhanced" | "classic";
};

/** Progress in the Games room. Chips are play money only. */
export type ArcadeStats = {
  blackjackChips: number;
  pokerChips: number;
  /** Blackjack decisions that matched basic strategy, out of all decisions. */
  coachRight: number;
  coachTotal: number;
  poolWins: number;
  poolLosses: number;
};

export type AppData = {
  lists: WheelList[];
  history: SpinResult[];
  coinSets: CoinSet[];
  coinHistory: CoinFlipResult[];
  dice: DiceSettings;
  diceHistory: DiceRollResult[];
  selectedListId: string;
  selectedCoinId: string;
  gameBest: number;
  arcade: ArcadeStats;
  settings: AppSettings;
};
