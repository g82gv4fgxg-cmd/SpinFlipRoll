import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import Coin from "./Coin";
import Wheel from "./Wheel";
import { buildSegments, labelKey, nextColorHex, pickWinner, spinDelta } from "./wheelMath";
import {
  createDefaultCoinSides,
  createId,
  entriesToAdd,
  loadData,
  loadTheme,
  parseImportedEntries,
  saveData,
  saveTheme,
} from "./storage";
import type { Theme } from "./storage";
import type {
  AppData,
  AppSettings,
  CoinFlipResult,
  CoinSet,
  CoinSide,
  SpinResult,
  WheelEntry,
  WheelList,
} from "./types";

const spinDurationMs = 4400;
const coinFlipDurationMs = 2100;
const launchDurationMs = 620;
const spinHistoryLimit = 50;
const coinHistoryLimit = 80;
const defaultSideLabels = ["Heads", "Tails"] as const;
const noEntries: WheelEntry[] = [];
type Screen = "home" | "wheel" | "coin";

/** The latest spin, kept apart from the list so it still shows after "Eliminate" removes the winner. */
type SpinOutcome = {
  listId: string;
  entry: WheelEntry;
  eliminated: boolean;
};

export default function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [screen, setScreen] = useState<Screen>("home");
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [enteringMode, setEnteringMode] = useState<Screen | null>(null);
  const [selectedListId, setSelectedListId] = useState(() => data.lists[0]?.id ?? "");
  const [selectedCoinId, setSelectedCoinId] = useState(() => data.coinSets[0]?.id ?? "");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [newEntry, setNewEntry] = useState("");
  const [entryError, setEntryError] = useState("");
  const [notice, setNotice] = useState("");
  const [newListName, setNewListName] = useState("");
  const [newCoinName, setNewCoinName] = useState("");
  const [coinRotation, setCoinRotation] = useState(0);
  const [coinFlipping, setCoinFlipping] = useState(false);
  const [coinWinnerIndex, setCoinWinnerIndex] = useState<0 | 1 | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef(new Set<number>());
  const spinButtonRef = useRef<HTMLButtonElement>(null);
  const editStartRef = useRef("");
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
    saveData(data);
  }, [data]);

  useEffect(() => {
    saveTheme(theme);
    applyDocumentTheme(theme);
  }, [theme]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!showWinner) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWinner();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showWinner]);

  const selectedList = useMemo(
    () => data.lists.find((list) => list.id === selectedListId) ?? data.lists[0],
    [data.lists, selectedListId]
  );
  const selectedCoin = useMemo(
    () => data.coinSets.find((coin) => coin.id === selectedCoinId) ?? data.coinSets[0],
    [data.coinSets, selectedCoinId]
  );

  const entries = selectedList?.entries ?? noEntries;
  const coinSides = selectedCoin?.sides;
  const displayedEntries = useMemo(
    () => entries.map((entry) => ({ ...entry, colorHex: displayHex(entry.colorHex, theme, 0.74) })),
    [entries, theme]
  );
  const displayedCoinSides = useMemo(
    () =>
      coinSides?.map((side) => ({ ...side, colorHex: displayHex(side.colorHex, theme, 0.76) })) as
        | [CoinSide, CoinSide]
        | undefined,
    [coinSides, theme]
  );
  const segments = useMemo(
    () => buildSegments(entries, data.settings.weighted),
    [entries, data.settings.weighted]
  );
  const listHistory = data.history.filter((result) => result.listId === selectedList?.id);
  const lastWinnerLabel = listHistory[0]?.label;
  const selectedCoinHistory = data.coinHistory.filter((result) => result.coinId === selectedCoin?.id).slice(0, 8);
  const listOutcome = outcome && outcome.listId === selectedList?.id ? outcome : null;
  const outcomeIndex = listOutcome ? entries.findIndex((entry) => entry.id === listOutcome.entry.id) : -1;
  // After "Eliminate" the winner is no longer in the list, so fall back to the saved copy.
  const outcomeEntry = listOutcome ? (outcomeIndex >= 0 ? entries[outcomeIndex] : listOutcome.entry) : null;
  const themeLabel = theme === "dark" ? "Light mode" : "Dark mode";

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  /** setTimeout that is cancelled if the user leaves the screen before it fires. */
  function later(callback: () => void, delayMs: number) {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      callback();
    }, delayMs);
    timersRef.current.add(id);
  }

  function cancelPending() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  }

  function audioContext() {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      audioContextRef.current = new AudioContextConstructor();
    } catch {
      return null;
    }
    return audioContextRef.current;
  }

  /** Browsers only allow audio to start from a click, so this runs at the start of each spin or flip. */
  function unlockAudio() {
    const context = audioContext();
    if (context?.state === "suspended") context.resume().catch(() => undefined);
  }

  function playTone(frequency: number, duration = 0.06, volume = 0.08, type: OscillatorType = "sine") {
    const context = audioContext();
    if (!context) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  function playWinSound() {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      later(() => playTone(frequency, 0.12, 0.1, "triangle"), index * 90);
    });
  }

  function playCoinWinSound() {
    [392, 523.25, 783.99].forEach((frequency, index) => {
      later(() => playTone(frequency, 0.08, 0.08, index === 2 ? "triangle" : "sine"), index * 75);
    });
  }

  function scheduleSpinTicks() {
    let elapsed = 0;
    let interval = 42;
    while (elapsed < spinDurationMs - 250) {
      const time = elapsed;
      later(() => {
        const pitch = Math.max(160, 520 - time / 13);
        playTone(pitch, 0.035, 0.045, "square");
      }, time);
      elapsed += interval;
      interval = Math.min(interval * 1.055, 520);
    }
  }

  function scheduleCoinTicks() {
    [0, 130, 260, 410, 590, 820, 1090, 1390].forEach((time, index) => {
      later(() => playTone(720 - index * 54, 0.035, 0.045, "square"), time);
    });
  }

  function updateSettings(next: Partial<AppSettings>) {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, ...next },
    }));
  }

  function openMode(mode: Exclude<Screen, "home">) {
    if (enteringMode) return;
    setEnteringMode(mode);
    later(() => {
      setScreen(mode);
      setEnteringMode(null);
    }, launchDurationMs);
  }

  function showHome() {
    // Leaving mid-spin or mid-flip cancels the pending result and the remaining sounds.
    cancelPending();
    setScreen("home");
    setSpinning(false);
    setCoinFlipping(false);
    setOutcome(null);
    setShowWinner(false);
    setCoinWinnerIndex(null);
    setEnteringMode(null);
    setEntryError("");
    setNotice("");
  }

  /** Remembers a text field's value when editing starts, so it can be restored if left empty. */
  function beginEdit(value: string) {
    editStartRef.current = value;
  }

  /** On blur: trim the text, and put back the previous value (or a default) if it was left empty. */
  function finishEdit(value: string, fallback: string, apply: (next: string) => void) {
    const next = value.trim() || editStartRef.current.trim() || fallback;
    if (next !== value) apply(next);
  }

  function closeWinner() {
    setShowWinner(false);
    window.requestAnimationFrame(() => spinButtonRef.current?.focus());
  }

  function removeWinner() {
    if (!outcome) return;
    removeEntry(outcome.listId, outcome.entry.id);
    setOutcome(null);
    closeWinner();
  }

  function selectList(listId: string) {
    setSelectedListId(listId);
    setOutcome(null);
    setEntryError("");
  }

  function addList() {
    const list: WheelList = {
      id: createId(),
      name: newListName.trim() || "New Wheel",
      entries: [],
    };
    setData((current) => ({ ...current, lists: [...current.lists, list] }));
    setNewListName("");
    selectList(list.id);
  }

  function renameSelected(name: string) {
    if (!selectedList) return;
    updateList(selectedList.id, { name });
  }

  function deleteSelectedList() {
    if (!selectedList || data.lists.length <= 1) return;
    const count = selectedList.entries.length;
    if (!window.confirm(`Delete "${selectedList.name}" and its ${count} option${count === 1 ? "" : "s"}?`)) return;

    const listId = selectedList.id;
    const remaining = data.lists.filter((list) => list.id !== listId);
    setData((current) => ({
      ...current,
      lists: current.lists.filter((list) => list.id !== listId),
      history: current.history.filter((result) => result.listId !== listId),
    }));
    selectList(remaining[0]?.id ?? "");
  }

  function updateList(listId: string, patch: Partial<WheelList>) {
    setData((current) => ({
      ...current,
      lists: current.lists.map((list) => (list.id === listId ? { ...list, ...patch } : list)),
    }));
  }

  function updateEntries(listId: string, update: (entries: WheelEntry[]) => WheelEntry[]) {
    setData((current) => ({
      ...current,
      lists: current.lists.map((list) => (list.id === listId ? { ...list, entries: update(list.entries) } : list)),
    }));
  }

  function addEntry() {
    const label = newEntry.trim();
    if (!selectedList || !label) return;

    if (entries.some((entry) => labelKey(entry.label) === labelKey(label))) {
      setEntryError(`"${label}" is already on this wheel.`);
      return;
    }

    const id = createId();
    updateEntries(selectedList.id, (current) =>
      current.some((entry) => labelKey(entry.label) === labelKey(label))
        ? current
        : [...current, { id, label, colorHex: nextColorHex(current), weight: 1 }]
    );
    setNewEntry("");
    setEntryError("");
  }

  function updateEntry(entryId: string, patch: Partial<WheelEntry>) {
    if (!selectedList) return;
    updateEntries(selectedList.id, (current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch, weight: Math.max(0, patch.weight ?? entry.weight) } : entry
      )
    );
  }

  function removeEntry(listId: string, entryId: string) {
    updateEntries(listId, (current) => current.filter((entry) => entry.id !== entryId));
  }

  function addCoin() {
    const coin: CoinSet = {
      id: createId(),
      name: newCoinName.trim() || "New Coin",
      sides: createDefaultCoinSides(),
    };
    setData((current) => ({ ...current, coinSets: [...current.coinSets, coin] }));
    setNewCoinName("");
    selectCoin(coin.id);
  }

  function selectCoin(coinId: string) {
    setSelectedCoinId(coinId);
    setCoinWinnerIndex(null);
    setCoinRotation(0);
  }

  function renameSelectedCoin(name: string) {
    if (!selectedCoin) return;
    const coinId = selectedCoin.id;
    setData((current) => ({
      ...current,
      coinSets: current.coinSets.map((coin) => (coin.id === coinId ? { ...coin, name } : coin)),
    }));
  }

  function deleteSelectedCoin() {
    if (!selectedCoin || data.coinSets.length <= 1) return;
    if (!window.confirm(`Delete "${selectedCoin.name}"?`)) return;

    const coinId = selectedCoin.id;
    const remaining = data.coinSets.filter((coin) => coin.id !== coinId);
    setData((current) => ({
      ...current,
      coinSets: current.coinSets.filter((coin) => coin.id !== coinId),
      coinHistory: current.coinHistory.filter((result) => result.coinId !== coinId),
    }));
    selectCoin(remaining[0]?.id ?? "");
  }

  function updateCoinSide(sideIndex: 0 | 1, patch: Partial<CoinSide>) {
    if (!selectedCoin) return;
    const coinId = selectedCoin.id;
    setData((current) => ({
      ...current,
      coinSets: current.coinSets.map((coin) => {
        if (coin.id !== coinId) return coin;
        const sides = [...coin.sides] as [CoinSide, CoinSide];
        sides[sideIndex] = { ...sides[sideIndex], ...patch };
        return { ...coin, sides };
      }),
    }));
  }

  function flipCoin() {
    if (!selectedCoin || coinFlipping) return;

    const coinId = selectedCoin.id;
    const chosen: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const normalized = ((coinRotation % 360) + 360) % 360;
    const target = chosen === 0 ? 0 : 180;
    let delta = 360 * 8 + target - normalized;
    if (delta < 360 * 7) delta += 360;

    setCoinFlipping(true);
    setCoinWinnerIndex(null);
    setCoinRotation((current) => current + delta);
    unlockAudio();
    scheduleCoinTicks();

    later(() => {
      const id = createId();
      const timestamp = new Date().toISOString();
      setCoinWinnerIndex(chosen);
      setCoinFlipping(false);
      playCoinWinSound();
      setData((current) => {
        const coin = current.coinSets.find((item) => item.id === coinId);
        if (!coin) return current;
        const result: CoinFlipResult = { id, label: coin.sides[chosen].label, coinId, coinName: coin.name, timestamp };
        return { ...current, coinHistory: [result, ...current.coinHistory].slice(0, coinHistoryLimit) };
      });
    }, coinFlipDurationMs);
  }

  function spin() {
    if (!selectedList || spinning || entries.length < 2) return;

    const listId = selectedList.id;
    const listName = selectedList.name;
    const eliminate = data.settings.eliminate;
    const chosen = pickWinner(entries, data.settings.weighted, data.settings.noRepeat ? lastWinnerLabel : undefined);
    const winner = entries[chosen];
    const delta = spinDelta(segments[chosen], rotation);

    // Options and settings are locked until the wheel stops, so `winner` stays valid.
    setSpinning(true);
    setOutcome(null);
    setShowWinner(false);
    setEntryError("");
    setRotation((current) => current + delta);
    unlockAudio();
    scheduleSpinTicks();

    later(() => {
      const id = createId();
      const timestamp = new Date().toISOString();
      setSpinning(false);
      setOutcome({ listId, entry: winner, eliminated: eliminate });
      setShowWinner(true);
      playWinSound();
      setData((current) => {
        const result: SpinResult = {
          id,
          label: winner.label,
          listId,
          listName: current.lists.find((list) => list.id === listId)?.name ?? listName,
          timestamp,
        };
        return {
          ...current,
          history: [result, ...current.history].slice(0, spinHistoryLimit),
          lists: eliminate
            ? current.lists.map((list) =>
                list.id === listId ? { ...list, entries: list.entries.filter((entry) => entry.id !== winner.id) } : list
              )
            : current.lists,
        };
      });
    }, spinDurationMs);
  }

  function clearHistory() {
    if (!selectedList) return;
    const listId = selectedList.id;
    setData((current) => ({
      ...current,
      history: current.history.filter((result) => result.listId !== listId),
    }));
  }

  function clearCoinHistory() {
    if (!selectedCoin) return;
    const coinId = selectedCoin.id;
    setData((current) => ({
      ...current,
      coinHistory: current.coinHistory.filter((result) => result.coinId !== coinId),
    }));
  }

  function exportList() {
    if (!selectedList || selectedList.entries.length === 0) return;
    const blob = new Blob([JSON.stringify(selectedList.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileSafeName(selectedList.name)}-entries.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoking straight away can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importList(file: File) {
    if (!selectedList) return;
    const listId = selectedList.id;

    let imported: ReturnType<typeof parseImportedEntries>;
    try {
      imported = parseImportedEntries(JSON.parse(await file.text()));
    } catch {
      setNotice("Couldn't read that file. Choose a JSON file exported from SpinFlipRoll.");
      return;
    }
    if (!imported) {
      setNotice("That file doesn't contain a list of options.");
      return;
    }

    const list = dataRef.current.lists.find((item) => item.id === listId);
    if (!list) return;
    const added = entriesToAdd(list.entries, imported);
    if (added.length === 0) {
      setNotice("No new options to import. They're all on this wheel already.");
      return;
    }

    updateEntries(listId, (current) => {
      const existing = new Set(current.map((entry) => labelKey(entry.label)));
      return [...current, ...added.filter((entry) => !existing.has(labelKey(entry.label)))];
    });
    setNotice(`Imported ${added.length} option${added.length === 1 ? "" : "s"}.`);
  }

  if (screen === "home") {
    return (
      <main className={`mode-screen theme-${theme} ${enteringMode ? `launching launching-${enteringMode}` : ""}`}>
        <section className="mode-hero">
          <div>
            <p>SpinFlipRoll</p>
            <h1>Choose your picker</h1>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} aria-label={themeLabel}>
            {themeLabel}
          </button>
        </section>

        <section className="mode-grid" aria-label="Picker modes">
          <button className="mode-card wheel-mode" onClick={() => openMode("wheel")}>
            <i aria-hidden="true" />
            <span>Wheel</span>
            <strong>Spin a custom decision wheel</strong>
          </button>
          <button className="mode-card coin-mode" onClick={() => openMode("coin")}>
            <i aria-hidden="true" />
            <span>Coin</span>
            <strong>Flip heads, tails, or your own labels</strong>
          </button>
          <button className="mode-card disabled" disabled>
            <span>Dice</span>
            <strong>Coming soon</strong>
          </button>
        </section>
      </main>
    );
  }

  if (screen === "coin" && selectedCoin && displayedCoinSides) {
    return (
      <main className={`app coin-app theme-${theme}`}>
        <aside className="sidebar">
          <div className="brand">
            <button className="brand-mark" onClick={showHome} aria-label="Back to picker modes">
              SFR
            </button>
            <div>
              <h1>SpinFlipRoll</h1>
              <p>{data.coinSets.length} coin{data.coinSets.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="list-create">
            <input
              value={newCoinName}
              onChange={(event) => setNewCoinName(event.target.value)}
              onKeyDown={onEnter(addCoin)}
              placeholder="New coin"
              aria-label="New coin name"
              disabled={coinFlipping}
            />
            <button onClick={addCoin} aria-label="Add coin" disabled={coinFlipping}>
              +
            </button>
          </div>

          <nav className="wheel-list" aria-label="Coins">
            {data.coinSets.map((coin) => (
              <button
                key={coin.id}
                className={coin.id === selectedCoin.id ? "selected" : ""}
                aria-current={coin.id === selectedCoin.id ? "true" : undefined}
                disabled={coinFlipping}
                onClick={() => selectCoin(coin.id)}
              >
                <span>{coin.name}</span>
                <small>2</small>
              </button>
            ))}
          </nav>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <input
              className="title-input"
              value={selectedCoin.name}
              onChange={(event) => renameSelectedCoin(event.target.value)}
              onFocus={(event) => beginEdit(event.target.value)}
              onBlur={(event) => finishEdit(event.target.value, "My Coin", renameSelectedCoin)}
              onKeyDown={blurOnEnter}
              aria-label="Coin name"
            />
            <div className="top-actions">
              <button className="theme-toggle" onClick={toggleTheme} aria-label={themeLabel}>
                {themeLabel}
              </button>
              <button onClick={showHome}>Modes</button>
              <button className="danger" onClick={deleteSelectedCoin} disabled={coinFlipping || data.coinSets.length <= 1}>
                Delete
              </button>
            </div>
          </header>

          <div className="main-grid">
            <section className="coin-panel">
              {/* Keyed by coin so switching coins resets it instantly instead of spinning it backwards. */}
              <Coin key={selectedCoin.id} sides={displayedCoinSides} rotation={coinRotation} flipping={coinFlipping} />

              <button className="spin-button coin-flip-button" onClick={flipCoin} disabled={coinFlipping}>
                {coinFlipping ? "Flipping..." : "Flip"}
              </button>

              {coinWinnerIndex !== null && (
                <div className="winner-banner coin-result">
                  <span style={{ backgroundColor: `#${displayedCoinSides[coinWinnerIndex].colorHex}` }} />
                  <strong>{selectedCoin.sides[coinWinnerIndex].label}</strong>
                </div>
              )}
            </section>

            <section className="controls">
              <div className="panel-heading">
                <h2>Sides</h2>
                <span>2</span>
              </div>
              <div className="coin-side-list">
                {selectedCoin.sides.map((side, index) => (
                  <div className="side-row" key={side.id}>
                    <input
                      type="color"
                      value={`#${side.colorHex}`}
                      onChange={(event) => updateCoinSide(index as 0 | 1, { colorHex: event.target.value.slice(1).toUpperCase() })}
                      disabled={coinFlipping}
                      aria-label={`Color for ${side.label}`}
                    />
                    <input
                      value={side.label}
                      onChange={(event) => updateCoinSide(index as 0 | 1, { label: event.target.value })}
                      onFocus={(event) => beginEdit(event.target.value)}
                      onBlur={(event) =>
                        finishEdit(event.target.value, defaultSideLabels[index], (label) =>
                          updateCoinSide(index as 0 | 1, { label })
                        )
                      }
                      onKeyDown={blurOnEnter}
                      disabled={coinFlipping}
                      aria-label={`Label for side ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="history">
              <div className="history-header">
                <h2>History</h2>
                <button onClick={clearCoinHistory} disabled={selectedCoinHistory.length === 0}>
                  Clear
                </button>
              </div>
              {selectedCoinHistory.length === 0 ? (
                <p>No flips yet</p>
              ) : (
                <ol>
                  {selectedCoinHistory.map((result) => (
                    <li key={result.id}>
                      <span>{result.label}</span>
                      <time dateTime={result.timestamp}>{formatTime(result.timestamp)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`app wheel-app theme-${theme}`}>
      <aside className="sidebar" inert={showWinner || undefined}>
        <div className="brand">
          <button className="brand-mark" onClick={showHome} aria-label="Back to picker modes">
            SFR
          </button>
          <div>
            <h1>SpinFlipRoll</h1>
            <p>{data.lists.length} wheel{data.lists.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="list-create">
          <input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            onKeyDown={onEnter(addList)}
            placeholder="New wheel"
            aria-label="New wheel name"
            disabled={spinning}
          />
          <button onClick={addList} aria-label="Add wheel" disabled={spinning}>
            +
          </button>
        </div>

        <nav className="wheel-list" aria-label="Wheels">
          {data.lists.map((list) => (
            <button
              key={list.id}
              className={list.id === selectedList?.id ? "selected" : ""}
              aria-current={list.id === selectedList?.id ? "true" : undefined}
              disabled={spinning}
              onClick={() => selectList(list.id)}
            >
              <span>{list.name}</span>
              <small>{list.entries.length}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace" inert={showWinner || undefined}>
        <header className="topbar">
          <input
            className="title-input"
            value={selectedList?.name ?? ""}
            onChange={(event) => renameSelected(event.target.value)}
            onFocus={(event) => beginEdit(event.target.value)}
            onBlur={(event) => finishEdit(event.target.value, "My Wheel", renameSelected)}
            onKeyDown={blurOnEnter}
            aria-label="Wheel name"
          />
          <div className="top-actions">
            <button className="theme-toggle" onClick={toggleTheme} aria-label={themeLabel}>
              {themeLabel}
            </button>
            <button onClick={showHome}>Modes</button>
            <label className={`file-button${spinning ? " disabled" : ""}`}>
              Import
              <input
                type="file"
                accept="application/json,.json"
                disabled={spinning}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importList(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button onClick={exportList} disabled={!entries.length}>
              Export
            </button>
            <button className="danger" onClick={deleteSelectedList} disabled={spinning || data.lists.length <= 1}>
              Delete
            </button>
          </div>
        </header>

        <p className="notice" role="status">
          {notice}
        </p>

        <div className="main-grid">
          <section className="wheel-panel">
            <div className="chips" aria-label="Spin settings">
              <button
                className={data.settings.weighted ? "on" : ""}
                aria-pressed={data.settings.weighted}
                disabled={spinning}
                onClick={() => updateSettings({ weighted: !data.settings.weighted })}
              >
                Weighted
              </button>
              <button
                className={data.settings.noRepeat ? "on" : ""}
                aria-pressed={data.settings.noRepeat}
                disabled={spinning}
                onClick={() => updateSettings({ noRepeat: !data.settings.noRepeat })}
              >
                No repeat
              </button>
              <button
                className={data.settings.eliminate ? "on" : ""}
                aria-pressed={data.settings.eliminate}
                disabled={spinning}
                onClick={() => updateSettings({ eliminate: !data.settings.eliminate })}
              >
                Eliminate
              </button>
            </div>

            <Wheel
              entries={displayedEntries}
              segments={segments}
              rotation={rotation}
              winnerIndex={!spinning && outcomeIndex >= 0 ? outcomeIndex : null}
            />

            <button ref={spinButtonRef} className="spin-button" onClick={spin} disabled={spinning || entries.length < 2}>
              {spinning ? "Spinning..." : "Spin"}
            </button>

            {outcomeEntry && (
              <div className="winner-banner">
                <span style={{ backgroundColor: `#${displayHex(outcomeEntry.colorHex, theme, 0.74)}` }} />
                <strong>{outcomeEntry.label}</strong>
              </div>
            )}
          </section>

          <section className="controls">
            <div className="panel-heading">
              <h2>Options</h2>
              <span>{entries.length}</span>
            </div>
            <div className="entry-add">
              <input
                value={newEntry}
                onChange={(event) => {
                  setNewEntry(event.target.value);
                  setEntryError("");
                }}
                onKeyDown={onEnter(addEntry)}
                placeholder="Add option"
                aria-label="New option"
                aria-invalid={entryError ? true : undefined}
                aria-describedby="entry-error"
                disabled={spinning}
              />
              <button onClick={addEntry} disabled={spinning}>
                Add
              </button>
            </div>
            <p id="entry-error" className="field-error" role="status">
              {entryError}
            </p>

            <div className="entry-list">
              {entries.map((entry, index) => (
                <div className="entry-row" key={entry.id}>
                  <input
                    type="color"
                    value={`#${entry.colorHex}`}
                    onChange={(event) => updateEntry(entry.id, { colorHex: event.target.value.slice(1).toUpperCase() })}
                    disabled={spinning}
                    aria-label={`Color for ${entry.label}`}
                  />
                  <input
                    value={entry.label}
                    onChange={(event) => updateEntry(entry.id, { label: event.target.value })}
                    onFocus={(event) => beginEdit(event.target.value)}
                    onBlur={(event) => finishEdit(event.target.value, "Option", (label) => updateEntry(entry.id, { label }))}
                    onKeyDown={blurOnEnter}
                    disabled={spinning}
                    aria-label={`Name of option ${index + 1}`}
                  />
                  <input
                    className="weight"
                    type="number"
                    min="0"
                    step="0.1"
                    value={entry.weight}
                    onChange={(event) => updateEntry(entry.id, { weight: Number(event.target.value) || 0 })}
                    disabled={spinning}
                    aria-label={`Weight for ${entry.label}`}
                  />
                  <button
                    className="icon-button"
                    onClick={() => selectedList && removeEntry(selectedList.id, entry.id)}
                    disabled={spinning}
                    aria-label={`Remove ${entry.label}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="history">
            <div className="history-header">
              <h2>History</h2>
              <button onClick={clearHistory} disabled={listHistory.length === 0}>
                Clear
              </button>
            </div>
            {listHistory.length === 0 ? (
              <p>No spins yet</p>
            ) : (
              <ol>
                {listHistory.slice(0, 8).map((result) => (
                  <li key={result.id}>
                    <span>{result.label}</span>
                    <time dateTime={result.timestamp}>{formatTime(result.timestamp)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </section>

      {showWinner && outcome && (
        <div
          className="win-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Winner: ${outcome.entry.label}`}
          onClick={(event) => event.target === event.currentTarget && closeWinner()}
        >
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 42 }).map((_, index) => (
              <i
                key={index}
                style={
                  {
                    "--hue": index * 37,
                    "--x": `${(index * 23) % 100}%`,
                    "--drift": `${((index % 7) - 3) * 18}px`,
                    "--duration": `${2.3 + (index % 8) * 0.18}s`,
                    "--delay": `${(index % 10) * -0.22}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <section className="win-card">
            <p>Winner</p>
            <span style={{ backgroundColor: `#${displayHex(outcome.entry.colorHex, theme, 0.74)}` }} />
            <h2>{outcome.entry.label}</h2>
            {outcome.eliminated && <small className="win-note">Removed from the wheel</small>}
            <div className={`win-actions${outcome.eliminated ? " single" : ""}`}>
              <button autoFocus onClick={closeWinner}>
                Done
              </button>
              {!outcome.eliminated && (
                <button className="remove-winner" onClick={removeWinner}>
                  Remove
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

/** Runs `action` on Enter, ignoring the Enter that confirms text in an input method editor (e.g. Japanese). */
function onEnter(action: () => void) {
  return (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) action();
  };
}

function blurOnEnter(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
}

function applyDocumentTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b1020" : "#f6f2ea");
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fileSafeName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "wheel"
  );
}

function displayHex(hex: string, theme: Theme, darkAmount: number) {
  return theme === "dark" ? darkenHex(hex, darkAmount) : hex;
}

function darkenHex(hex: string, amount: number) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 6 ? normalized : "888888", 16);
  const r = Math.round(((value >> 16) & 255) * amount);
  const g = Math.round(((value >> 8) & 255) * amount);
  const b = Math.round((value & 255) * amount);
  return [r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase();
}
