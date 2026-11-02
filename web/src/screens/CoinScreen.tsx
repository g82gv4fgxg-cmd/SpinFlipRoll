import { useRef, useState } from "react";
import Coin from "../components/Coin";
import ModeLayout from "../components/ModeLayout";
import PhysicsCoin from "../components/PhysicsCoin";
import type { PhysicsCoinHandle } from "../components/PhysicsCoin";
import { displayHex, formatWhen, mergeHistory, plural } from "../format";
import { usePresenting, useSpaceKey, useTimers } from "../hooks";
import { blurOnEnter, onEnter } from "../keys";
import { randomInt } from "../random";
import { historyLimit } from "../shell";
import type { ScreenProps } from "../shell";
import { sounds, unlockAudio } from "../sound";
import { createDefaultCoinSides, createId } from "../storage";
import type { CoinFlipResult, CoinSet, CoinSide } from "../types";

const defaultSideLabels = ["Heads", "Tails"] as const;

export default function CoinScreen({ data, setData, shell }: ScreenProps) {
  const { later } = useTimers();
  const presenter = usePresenting();
  const flipMs = shell.reducedMotion ? 900 : 2100;
  const [newCoinName, setNewCoinName] = useState("");
  const [coinRotation, setCoinRotation] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<0 | 1 | null>(null);
  const editStartRef = useRef("");
  const physicsCoin = useRef<PhysicsCoinHandle>(null);

  const selectedCoin = data.coinSets.find((coin) => coin.id === data.selectedCoinId) ?? data.coinSets[0];
  const coinHistory = data.coinHistory.filter((result) => result.coinId === selectedCoin?.id);
  const displayedSides = selectedCoin?.sides.map((side) => ({
    ...side,
    colorHex: displayHex(side.colorHex, shell.theme, 0.76),
  })) as [CoinSide, CoinSide] | undefined;
  const sideCounts = selectedCoin
    ? selectedCoin.sides.map((side) => coinHistory.filter((result) => result.label === side.label).length)
    : [0, 0];

  useSpaceKey(flipCoin, true);

  function beginEdit(value: string) {
    editStartRef.current = value;
  }

  function finishEdit(value: string, fallback: string, apply: (next: string) => void) {
    const next = value.trim() || editStartRef.current.trim() || fallback;
    if (next !== value) apply(next);
  }

  function selectCoin(coinId: string) {
    setData((current) => ({ ...current, selectedCoinId: coinId }));
    setWinnerIndex(null);
    setCoinRotation(0);
  }

  function addCoin() {
    const coin: CoinSet = { id: createId(), name: newCoinName.trim() || "New Coin", sides: createDefaultCoinSides() };
    setData((current) => ({ ...current, coinSets: [...current.coinSets, coin], selectedCoinId: coin.id }));
    setNewCoinName("");
    setWinnerIndex(null);
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
    const coin = selectedCoin;
    const index = data.coinSets.findIndex((item) => item.id === coin.id);
    const removedHistory = data.coinHistory.filter((result) => result.coinId === coin.id);
    const nextSelected = data.coinSets.find((item) => item.id !== coin.id)?.id ?? "";

    setData((current) => ({
      ...current,
      coinSets: current.coinSets.filter((item) => item.id !== coin.id),
      coinHistory: current.coinHistory.filter((result) => result.coinId !== coin.id),
      selectedCoinId: nextSelected,
    }));
    setWinnerIndex(null);
    setCoinRotation(0);
    shell.toast(`Deleted "${coin.name}"`, () =>
      setData((current) =>
        current.coinSets.some((item) => item.id === coin.id)
          ? current
          : {
              ...current,
              coinSets: [...current.coinSets.slice(0, index), coin, ...current.coinSets.slice(index)],
              coinHistory: mergeHistory(current.coinHistory, removedHistory, historyLimit),
              selectedCoinId: coin.id,
            }
      )
    );
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
    if (!selectedCoin || flipping) return;

    const coinId = selectedCoin.id;
    const chosen = randomInt(2) as 0 | 1;
    const normalized = ((coinRotation % 360) + 360) % 360;
    const target = chosen === 0 ? 0 : 180;
    let delta = 360 * 8 + target - normalized;
    if (delta < 360 * 7) delta += 360;

    setFlipping(true);
    setWinnerIndex(null);
    unlockAudio();
    let duration = flipMs;
    if (shell.enhanced && physicsCoin.current) {
      // A simulated toss: the coin flies, bounces and settles, chiming on each bounce.
      duration = physicsCoin.current.toss(chosen);
    } else {
      setCoinRotation((current) => current + delta);
      sounds.coinTicks(later, flipMs);
    }

    later(() => {
      const id = createId();
      const timestamp = new Date().toISOString();
      setWinnerIndex(chosen);
      setFlipping(false);
      sounds.coinWin(later);
      setData((current) => {
        const coin = current.coinSets.find((item) => item.id === coinId);
        if (!coin) return current;
        const result: CoinFlipResult = { id, label: coin.sides[chosen].label, coinId, coinName: coin.name, timestamp };
        return { ...current, coinHistory: [result, ...current.coinHistory].slice(0, historyLimit) };
      });
    }, duration);
  }

  function clearCoinHistory() {
    if (!selectedCoin || coinHistory.length === 0) return;
    const coinId = selectedCoin.id;
    const removed = coinHistory;
    setData((current) => ({ ...current, coinHistory: current.coinHistory.filter((result) => result.coinId !== coinId) }));
    shell.toast("History cleared", () =>
      setData((current) => ({ ...current, coinHistory: mergeHistory(current.coinHistory, removed, historyLimit) }))
    );
  }

  if (!selectedCoin || !displayedSides) return null;
  const totalFlips = sideCounts[0] + sideCounts[1];

  return (
    <ModeLayout
      shell={shell}
      className="coin-app"
      subtitle={plural(data.coinSets.length, "coin")}
      presenter={presenter}
      sidebar={
        <>
          <div className="list-create">
            <input
              value={newCoinName}
              onChange={(event) => setNewCoinName(event.target.value)}
              onKeyDown={onEnter(addCoin)}
              placeholder="New coin"
              aria-label="New coin name"
              disabled={flipping}
            />
            <button onClick={addCoin} aria-label="Add coin" disabled={flipping}>
              +
            </button>
          </div>
          <nav className="wheel-list" aria-label="Coins">
            {data.coinSets.map((coin) => (
              <button
                key={coin.id}
                className={coin.id === selectedCoin.id ? "selected" : ""}
                aria-current={coin.id === selectedCoin.id ? "true" : undefined}
                disabled={flipping}
                onClick={() => selectCoin(coin.id)}
              >
                <span>{coin.name}</span>
                <small>2</small>
              </button>
            ))}
          </nav>
        </>
      }
      title={
        <input
          className="title-input"
          value={selectedCoin.name}
          onChange={(event) => renameSelectedCoin(event.target.value)}
          onFocus={(event) => beginEdit(event.target.value)}
          onBlur={(event) => finishEdit(event.target.value, "My Coin", renameSelectedCoin)}
          onKeyDown={blurOnEnter}
          aria-label="Coin name"
        />
      }
      actions={
        <button className="danger" onClick={deleteSelectedCoin} disabled={flipping || data.coinSets.length <= 1}>
          Delete
        </button>
      }
    >
      <section className="coin-panel">
        {/* Keyed by coin so switching coins resets it instantly instead of spinning it backwards. */}
        {shell.enhanced ? (
          <PhysicsCoin key={selectedCoin.id} ref={physicsCoin} sides={displayedSides} restingSide={winnerIndex ?? 0} />
        ) : (
          <Coin key={selectedCoin.id} sides={displayedSides} rotation={coinRotation} flipping={flipping} durationMs={flipMs} />
        )}

        <button className="spin-button coin-flip-button" onClick={flipCoin} disabled={flipping}>
          {flipping ? "Flipping..." : "Flip"}
        </button>

        {winnerIndex !== null && (
          <div className="winner-banner coin-result">
            <span style={{ backgroundColor: `#${displayedSides[winnerIndex].colorHex}` }} />
            <strong>{selectedCoin.sides[winnerIndex].label}</strong>
          </div>
        )}
        <p className="shortcut-hint">Tip: press Space to flip</p>
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
                disabled={flipping}
                aria-label={`Color for ${side.label}`}
              />
              <input
                value={side.label}
                onChange={(event) => updateCoinSide(index as 0 | 1, { label: event.target.value })}
                onFocus={(event) => beginEdit(event.target.value)}
                onBlur={(event) =>
                  finishEdit(event.target.value, defaultSideLabels[index], (label) => updateCoinSide(index as 0 | 1, { label }))
                }
                onKeyDown={blurOnEnter}
                disabled={flipping}
                aria-label={`Label for side ${index + 1}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="history">
        <div className="history-header">
          <h2>History</h2>
          <button onClick={clearCoinHistory} disabled={coinHistory.length === 0}>
            Clear
          </button>
        </div>
        {totalFlips > 0 && (
          <div className="coin-split" aria-label={`${selectedCoin.sides[0].label} ${sideCounts[0]}, ${selectedCoin.sides[1].label} ${sideCounts[1]}`}>
            <div className="coin-split-bar" aria-hidden="true">
              <i style={{ width: `${(sideCounts[0] / totalFlips) * 100}%`, backgroundColor: `#${displayedSides[0].colorHex}` }} />
              <i style={{ width: `${(sideCounts[1] / totalFlips) * 100}%`, backgroundColor: `#${displayedSides[1].colorHex}` }} />
            </div>
            <p>
              <span>
                {selectedCoin.sides[0].label} {sideCounts[0]}
              </span>
              <span>
                {selectedCoin.sides[1].label} {sideCounts[1]}
              </span>
            </p>
          </div>
        )}
        {coinHistory.length === 0 ? (
          <p>No flips yet</p>
        ) : (
          <ol>
            {coinHistory.slice(0, 8).map((result) => (
              <li key={result.id}>
                <span>{result.label}</span>
                <time dateTime={result.timestamp}>{formatWhen(result.timestamp)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </ModeLayout>
  );
}
