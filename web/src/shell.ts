import type { Dispatch, SetStateAction } from "react";
import type { Theme } from "./storage";
import type { AppData } from "./types";

export type Screen = "home" | "wheel" | "coin" | "dice" | "arcade" | "blackjack" | "poker" | "pool" | "spinguard";

/** Screens inside the secret Games room. */
export type GameScreen = "blackjack" | "poker" | "pool" | "spinguard";
export const lockedScreens: Screen[] = ["arcade", "blackjack", "poker", "pool", "spinguard"];

/** App-wide controls every screen can use. */
export type Shell = {
  theme: Theme;
  toggleTheme: () => void;
  soundOn: boolean;
  toggleSound: () => void;
  goHome: () => void;
  /** Shows a short message; pass `undo` to offer an Undo button. */
  toast: (message: string, undo?: () => void) => void;
  reducedMotion: boolean;
  /** Physics wheel, coin and dice instead of the simpler animations. */
  enhanced: boolean;
  toggleEnhanced: () => void;
};

export type ScreenProps = {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  shell: Shell;
};

export const historyLimit = 300;
