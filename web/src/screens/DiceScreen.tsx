import { useState } from "react";
import Die from "../components/Die";
import ModeLayout from "../components/ModeLayout";
import { dicePresets, dieSides, maxDice, minDice, rollDice, rollDie } from "../dice";
import { formatWhen, mergeHistory, plural } from "../format";
import { usePresenting, useSpaceKey, useTimers } from "../hooks";
import { historyLimit } from "../shell";
import type { ScreenProps } from "../shell";
import { sounds, unlockAudio } from "../sound";
import { createId } from "../storage";
import type { DiceRollResult, DieSides } from "../types";

export default function DiceScreen({ data, setData, shell }: ScreenProps) {
  const { later } = useTimers();
  const presenter = usePresenting();
  const rollMs = shell.reducedMotion ? 350 : 950;
  const { count, sides } = data.dice;
  const [values, setValues] = useState<(number | null)[]>(() => {
    const last = data.diceHistory[0];
    return Array.from({ length: count }, (_, index) => (last?.sides === sides ? last.values[index] ?? null : null));
  });
  const [held, setHeld] = useState<Set<number>>(() => new Set());
  const [rolling, setRolling] = useState(false);
  const [lastTotal, setLastTotal] = useState<number | null>(null);

  const allHeld = held.size >= count;
  const history = data.diceHistory;
  const sameSetup = history.filter((roll) => roll.sides === sides && roll.values.length === count);
  const average = sameSetup.length ? sameSetup.reduce((sum, roll) => sum + roll.total, 0) / sameSetup.length : null;
  const highest = sameSetup.length ? Math.max(...sameSetup.map((roll) => roll.total)) : null;

  useSpaceKey(roll, true);

  function setDice(nextCount: number, nextSides: DieSides) {
    setData((current) => ({ ...current, dice: { count: nextCount, sides: nextSides } }));
    setValues((current) =>
      Array.from({ length: nextCount }, (_, index) => (nextSides === sides ? current[index] ?? null : null))
    );
    setHeld(new Set());
    setLastTotal(null);
  }

  function toggleHeld(index: number) {
    if (rolling || values[index] === null) return;
    setHeld((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function roll() {
    if (rolling || allHeld) return;

    const current = values.map((value) => value ?? 0);
    const final = rollDice(current, count, sides, held);
    setRolling(true);
    setLastTotal(null);
    unlockAudio();

    // Flicker random faces, slowing down, before settling on the result.
    let time = 0;
    let gap = rollMs / 17;
    while (time < rollMs - gap) {
      later(() => {
        setValues((faces) => faces.map((face, index) => (held.has(index) ? face : rollDie(sides))));
        sounds.diceRattle();
      }, time);
      time += gap;
      gap *= 1.12;
    }

    later(() => {
      const total = final.reduce((sum, value) => sum + value, 0);
      const result: DiceRollResult = { id: createId(), values: final, sides, total, timestamp: new Date().toISOString() };
      setValues(final);
      setRolling(false);
      setLastTotal(total);
      sounds.diceLand(later);
      setData((existing) => ({ ...existing, diceHistory: [result, ...existing.diceHistory].slice(0, historyLimit) }));
    }, rollMs);
  }

  function clearHistory() {
    if (history.length === 0) return;
    const removed = history;
    setData((current) => ({ ...current, diceHistory: [] }));
    shell.toast("History cleared", () =>
      setData((current) => ({ ...current, diceHistory: mergeHistory(current.diceHistory, removed, historyLimit) }))
    );
  }

  return (
    <ModeLayout
      shell={shell}
      className="dice-app"
      subtitle={`${count}d${sides}`}
      presenter={presenter}
      sidebar={
        <nav className="wheel-list" aria-label="Dice presets">
          {dicePresets.map((preset) => {
            const active = preset.count === count && preset.sides === sides;
            return (
              <button
                key={preset.label}
                className={active ? "selected" : ""}
                aria-pressed={active}
                disabled={rolling}
                onClick={() => setDice(preset.count, preset.sides)}
              >
                <span>{preset.label}</span>
                <small>
                  {preset.count}d{preset.sides}
                </small>
              </button>
            );
          })}
        </nav>
      }
      title={<h2 className="mode-title">Dice</h2>}
    >
      <section className="dice-panel">
        <div className={`dice-tray dice-count-${count}`}>
          {values.map((value, index) => (
            <Die
              key={index}
              index={index}
              value={value}
              sides={sides}
              held={held.has(index)}
              rolling={rolling}
              disabled={rolling || value === null}
              onToggle={() => toggleHeld(index)}
            />
          ))}
        </div>

        <button className="spin-button dice-roll-button" onClick={roll} disabled={rolling || allHeld}>
          {rolling ? "Rolling..." : allHeld ? "Release a die to roll" : held.size ? "Roll the rest" : "Roll"}
        </button>

        {lastTotal !== null && (
          <div className="winner-banner dice-total" role="status">
            <strong>{count > 1 ? `Total ${lastTotal}` : `Rolled ${lastTotal}`}</strong>
          </div>
        )}
        <p className="shortcut-hint">Tip: press Space to roll. Tap a die to hold it.</p>
      </section>

      <section className="controls">
        <div className="panel-heading">
          <h2>Dice</h2>
          <span>{count}</span>
        </div>
        <div className="field-group">
          <span className="field-label" id="dice-count-label">
            How many
          </span>
          <div className="stepper" role="group" aria-labelledby="dice-count-label">
            <button aria-label="Fewer dice" onClick={() => setDice(count - 1, sides)} disabled={rolling || count <= minDice}>
              −
            </button>
            <output aria-live="polite">{plural(count, "die", "dice")}</output>
            <button aria-label="More dice" onClick={() => setDice(count + 1, sides)} disabled={rolling || count >= maxDice}>
              +
            </button>
          </div>
        </div>
        <div className="field-group">
          <span className="field-label" id="dice-sides-label">
            Sides
          </span>
          <div className="segmented" role="group" aria-labelledby="dice-sides-label">
            {dieSides.map((option) => (
              <button
                key={option}
                className={option === sides ? "on" : ""}
                aria-pressed={option === sides}
                onClick={() => setDice(count, option)}
                disabled={rolling}
              >
                d{option}
              </button>
            ))}
          </div>
        </div>
        {held.size > 0 && (
          <button className="secondary release-button" onClick={() => setHeld(new Set())} disabled={rolling}>
            Release {plural(held.size, "held die", "held dice")}
          </button>
        )}
      </section>

      <section className="history">
        <div className="history-header">
          <h2>History</h2>
          <button onClick={clearHistory} disabled={history.length === 0}>
            Clear
          </button>
        </div>
        {average !== null && highest !== null && (
          <p className="stats-summary">
            {count}d{sides}: {plural(sameSetup.length, "roll")}, average {average.toFixed(1)}, highest {highest}
          </p>
        )}
        {history.length === 0 ? (
          <p>No rolls yet</p>
        ) : (
          <ol>
            {history.slice(0, 8).map((result) => (
              <li key={result.id}>
                <span>
                  {result.values.length > 1 ? `${result.values.join(" + ")} = ${result.total}` : result.total}{" "}
                  <small className="muted">
                    {result.values.length}d{result.sides}
                  </small>
                </span>
                <time dateTime={result.timestamp}>{formatWhen(result.timestamp)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </ModeLayout>
  );
}
