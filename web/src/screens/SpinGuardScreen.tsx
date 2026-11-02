import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { initialHud, SpinGuardGame } from "../game/spinGuard";
import type { GameHud } from "../game/spinGuard";
import { useTimers } from "../hooks";
import type { Shell } from "../shell";
import { sounds, unlockAudio } from "../sound";

type SpinGuardScreenProps = {
  shell: Shell;
  best: number;
  onBest: (score: number) => void;
  onBack: () => void;
};

export default function SpinGuardScreen({ shell, best, onBest, onBack }: SpinGuardScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SpinGuardGame | null>(null);
  const bestRef = useRef(best);
  const onBestRef = useRef(onBest);
  const [hud, setHud] = useState<GameHud>(initialHud);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; newBest: boolean } | null>(null);
  const { later } = useTimers();

  useEffect(() => {
    bestRef.current = best;
    onBestRef.current = onBest;
  }, [best, onBest]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new SpinGuardGame(canvas, {
      onHud: setHud,
      onGameOver: (score) => {
        const newBest = score > bestRef.current;
        setResult({ score, newBest });
        if (newBest) onBestRef.current(score);
      },
      sounds: {
        hit: (combo) => sounds.gameHit(combo),
        miss: () => sounds.gameMiss(),
        power: () => sounds.gamePowerUp(later),
      },
    });
    gameRef.current = game;
    // Lets automated checks drive the game in development builds; not included in the published site.
    if (import.meta.env.DEV) (window as unknown as { __spinGuard?: SpinGuardGame }).__spinGuard = game;

    const onVisibility = () => {
      if (document.hidden) game.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      game.destroy();
      gameRef.current = null;
    };
  }, [later]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        game.rotate(-1);
      } else if (key === "arrowright" || key === "d") {
        event.preventDefault();
        game.rotate(1);
      } else if ((key === " " || key === "enter") && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        unlockAudio();
        game.primaryAction();
      } else if (key === "p") {
        game.togglePause();
      } else if (key === "escape") {
        game.pause();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!hud.message) return;
    setBanner(hud.message.text);
    const id = window.setTimeout(() => setBanner(null), 2200);
    return () => window.clearTimeout(id);
  }, [hud.message]);

  function start() {
    unlockAudio();
    setResult(null);
    gameRef.current?.start();
  }

  function turn(direction: 1 | -1) {
    gameRef.current?.rotate(direction);
  }

  const playing = hud.status === "playing";
  const shownBest = Math.max(best, result?.score ?? 0);

  return (
    <main
      className="game-screen"
      data-status={hud.status}
      data-score={hud.score}
      data-lives={hud.lives}
      data-step={hud.step}
    >
      <header className="game-bar">
        <button className="game-back" onClick={onBack}>
          <Icon name="left" size={18} /> Games
        </button>
        <h1>Spin Guard</h1>
        <div className="game-stats">
          <span className="game-score" aria-label={`Score ${hud.score}`}>
            {hud.score}
          </span>
          <span className="game-best">Best {shownBest}</span>
          <span className="game-lives" aria-label={`${hud.lives} ${hud.lives === 1 ? "life" : "lives"} left`}>
            {"♥".repeat(Math.max(0, hud.lives))}
            {hud.shield && <span className="game-shield"> ◈</span>}
          </span>
        </div>
        <div className="game-buttons">
          <button className="icon-toggle" onClick={shell.toggleSound} aria-label="Sound" aria-pressed={shell.soundOn}>
            <Icon name={shell.soundOn ? "sound-on" : "sound-off"} />
          </button>
          <button
            className="icon-toggle"
            onClick={() => gameRef.current?.togglePause()}
            aria-label={hud.status === "paused" ? "Resume" : "Pause"}
            disabled={hud.status !== "playing" && hud.status !== "paused"}
          >
            <Icon name="pause" />
          </button>
        </div>
      </header>

      <div className="game-stage">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          role="img"
          aria-label="Spin Guard game. Use the turn buttons or arrow keys."
          onPointerDown={(event) => {
            if (!playing) return;
            const rect = event.currentTarget.getBoundingClientRect();
            turn(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
          }}
        />

        <p className="game-banner" role="status">
          {banner}
        </p>

        {hud.status === "ready" && (
          <div className="game-overlay">
            <p className="game-kicker">Games room</p>
            <h2>Spin Guard</h2>
            <ul className="game-rules">
              <li>Orbs fly at the wheel. Turn it so each orb hits the slice of the same colour.</li>
              <li>Turn with the arrow keys, A and D, the buttons below, or by tapping either side of the screen.</li>
              <li>Gold coins double your points. Dice roll a random bonus.</li>
              <li>Three misses and it's game over. New colours join as you score.</li>
            </ul>
            <button className="game-start" onClick={start} autoFocus>
              Start
            </button>
          </div>
        )}

        {hud.status === "paused" && (
          <div className="game-overlay">
            <h2>Paused</h2>
            <button className="game-start" onClick={() => gameRef.current?.resume()} autoFocus>
              Resume
            </button>
          </div>
        )}

        {hud.status === "over" && (
          <div className="game-overlay">
            <p className="game-kicker">{result?.newBest ? "New best score!" : "Game over"}</p>
            <h2>{hud.score}</h2>
            <p className="game-best-line">Best {shownBest}</p>
            <div className="game-overlay-actions">
              <button className="game-start" onClick={start} autoFocus>
                Play again
              </button>
              <button className="game-secondary" onClick={onBack}>
                Back to games
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="game-controls">
        <button onClick={() => turn(-1)} aria-label="Turn left" disabled={!playing}>
          <Icon name="left" size={30} />
        </button>
        <button onClick={() => turn(1)} aria-label="Turn right" disabled={!playing}>
          <Icon name="right" size={30} />
        </button>
      </div>
    </main>
  );
}
