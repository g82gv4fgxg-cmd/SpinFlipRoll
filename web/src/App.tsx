import { useCallback, useEffect, useRef, useState } from "react";
import Dialog from "./components/Dialog";
import Toast from "./components/Toast";
import type { ToastState } from "./components/Toast";
import { plural } from "./format";
import { useMediaQuery, useReducedMotion, useTimers } from "./hooks";
import CoinScreen from "./screens/CoinScreen";
import DiceScreen from "./screens/DiceScreen";
import HomeScreen from "./screens/HomeScreen";
import SpinGuardScreen from "./screens/SpinGuardScreen";
import WheelScreen from "./screens/WheelScreen";
import { decodeWheel, sharePayloadFromHash } from "./share";
import type { SharedWheel } from "./share";
import type { Screen, Shell } from "./shell";
import { setSoundEnabled, sounds, unlockAudio } from "./sound";
import { createId, entriesToAdd, loadData, loadThemePreference, saveData, saveTheme } from "./storage";
import type { Theme } from "./storage";
import type { AppData } from "./types";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const screenHashes: Record<Exclude<Screen, "home">, string> = {
  wheel: "#/wheel",
  coin: "#/coin",
  dice: "#/dice",
  game: "#/play",
};

function screenFromHash(hash: string): Screen {
  const match = (Object.keys(screenHashes) as (keyof typeof screenHashes)[]).find((screen) => screenHashes[screen] === hash);
  return match ?? "home";
}

export default function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [themePreference, setThemePreference] = useState<Theme | null>(loadThemePreference);
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");
  const reducedMotion = useReducedMotion();
  const [screen, setScreen] = useState<Screen>(() => screenFromHash(location.hash));
  const [toast, setToast] = useState<ToastState>(null);
  const [incoming, setIncoming] = useState<SharedWheel | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const toastId = useRef(0);
  const { later } = useTimers();
  // Until someone picks a theme, follow the device's light or dark setting.
  const theme: Theme = themePreference ?? (prefersLight ? "light" : "dark");
  const unlocked = data.settings.secretUnlocked;

  useEffect(() => saveData(data), [data]);
  useEffect(() => applyDocumentTheme(theme), [theme]);
  useEffect(() => setSoundEnabled(data.settings.sound), [data.settings.sound]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, undo });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  /** Reads the address bar: a share link opens the "add shared wheel" dialog, anything else picks the screen. */
  const applyLocation = useCallback(() => {
    const payload = sharePayloadFromHash(location.hash);
    if (payload === null) {
      setScreen(screenFromHash(location.hash));
      return;
    }
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setScreen("home");
    const wheel = decodeWheel(payload);
    if (wheel) setIncoming(wheel);
    else showToast("That share link doesn't work. It may have been cut off when it was copied.");
  }, [showToast]);

  useEffect(() => {
    applyLocation();
    window.addEventListener("popstate", applyLocation);
    window.addEventListener("hashchange", applyLocation);
    return () => {
      window.removeEventListener("popstate", applyLocation);
      window.removeEventListener("hashchange", applyLocation);
    };
  }, [applyLocation]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // The secret game's address does nothing until it's unlocked.
  useEffect(() => {
    if (screen === "game" && !unlocked) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      setScreen("home");
    }
  }, [screen, unlocked]);

  function navigate(next: Screen, fromHome = false) {
    const url = next === "home" ? `${location.pathname}${location.search}` : screenHashes[next];
    history.pushState({ fromHome }, "", url);
    setScreen(next);
  }

  /** Back to the picker. If we came from it, step back in history so the back button doesn't loop. */
  function goHome() {
    const state = history.state as { fromHome?: boolean } | null;
    if (state?.fromHome) {
      history.back();
    } else {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      setScreen("home");
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setThemePreference(next);
    saveTheme(next);
  }

  function toggleSound() {
    const next = !data.settings.sound;
    setSoundEnabled(next);
    if (next) unlockAudio();
    setData((current) => ({ ...current, settings: { ...current.settings, sound: next } }));
  }

  function unlockSecret() {
    setData((current) => ({ ...current, settings: { ...current.settings, secretUnlocked: true } }));
    unlockAudio();
    sounds.unlock(later);
    showToast("You found the secret! Spin Guard is unlocked.");
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt().catch(() => undefined);
    setInstallPrompt(null);
  }

  function addIncoming() {
    if (!incoming) return;
    const list = { id: createId(), name: incoming.name, entries: entriesToAdd([], incoming.entries) };
    setData((current) => ({ ...current, lists: [...current.lists, list], selectedListId: list.id }));
    setIncoming(null);
    navigate("wheel", screen === "home");
    showToast(`Added "${list.name}"`);
  }

  const shell: Shell = {
    theme,
    toggleTheme,
    soundOn: data.settings.sound,
    toggleSound,
    goHome,
    toast: showToast,
    reducedMotion,
  };

  let content;
  if (screen === "wheel") content = <WheelScreen data={data} setData={setData} shell={shell} />;
  else if (screen === "coin") content = <CoinScreen data={data} setData={setData} shell={shell} />;
  else if (screen === "dice") content = <DiceScreen data={data} setData={setData} shell={shell} />;
  else if (screen === "game" && unlocked)
    content = (
      <SpinGuardScreen
        shell={shell}
        best={data.gameBest}
        onBest={(score) => setData((current) => ({ ...current, gameBest: Math.max(current.gameBest, score) }))}
      />
    );
  else
    content = (
      <HomeScreen
        shell={shell}
        secretUnlocked={unlocked}
        canInstall={installPrompt !== null}
        onInstall={install}
        onOpen={(mode) => navigate(mode, true)}
        onUnlock={unlockSecret}
      />
    );

  return (
    <>
      <div className="screen-root" inert={incoming ? true : undefined}>
        {content}
      </div>
      {incoming && (
        <div className={`theme-${theme}`}>
          <Dialog title="Add shared wheel" onClose={() => setIncoming(null)}>
            <p className="dialog-text">
              Someone shared <strong>{incoming.name}</strong> with you ({plural(incoming.entries.length, "option")}).
            </p>
            <ul className="share-preview">
              {incoming.entries.slice(0, 12).map((entry, index) => (
                <li key={`${entry.label}-${index}`}>
                  <i style={{ backgroundColor: `#${entry.colorHex ?? "8D98AA"}` }} />
                  {entry.label}
                </li>
              ))}
              {incoming.entries.length > 12 && <li className="muted">and {incoming.entries.length - 12} more</li>}
            </ul>
            <div className="dialog-row">
              <button onClick={addIncoming}>Add wheel</button>
              <button className="secondary" onClick={() => setIncoming(null)}>
                Not now
              </button>
            </div>
          </Dialog>
        </div>
      )}
      <Toast toast={toast} theme={theme} onDismiss={dismissToast} />
    </>
  );
}

function applyDocumentTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b1020" : "#f6f2ea");
}
