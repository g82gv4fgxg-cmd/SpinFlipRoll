import { useState } from "react";
import type { ReactNode } from "react";
import { useEscapeKey } from "../hooks";
import type { Shell } from "../shell";
import Icon from "./Icon";

type GameFrameProps = {
  shell: Shell;
  title: string;
  className: string;
  onBack: () => void;
  /** Score, chips or record shown in the header. */
  stats?: ReactNode;
  /** The "how to play" drawer. */
  learn?: ReactNode;
  /** Extra attributes for automated checks, e.g. the game phase. */
  data?: Record<string, string | number>;
  children: ReactNode;
};

/** Header, back button and a "Learn" drawer shared by the Games room tables. */
export default function GameFrame({ shell, title, className, onBack, stats, learn, data = {}, children }: GameFrameProps) {
  const [learnOpen, setLearnOpen] = useState(false);
  useEscapeKey(() => setLearnOpen(false), learnOpen);
  const attributes = Object.fromEntries(Object.entries(data).map(([key, value]) => [`data-${key}`, String(value)]));

  return (
    <main className={`arcade-screen ${className}`} {...attributes}>
      <header className="game-bar">
        <button className="game-back" onClick={onBack}>
          <Icon name="left" size={18} /> Games
        </button>
        <h1>{title}</h1>
        <div className="game-stats">{stats}</div>
        <div className="game-buttons">
          {learn && (
            <button className={`learn-toggle${learnOpen ? " on" : ""}`} onClick={() => setLearnOpen((open) => !open)} aria-expanded={learnOpen}>
              <Icon name="book" size={18} /> Learn
            </button>
          )}
          <button className="icon-toggle" onClick={shell.toggleSound} aria-label="Sound" aria-pressed={shell.soundOn}>
            <Icon name={shell.soundOn ? "sound-on" : "sound-off"} />
          </button>
        </div>
      </header>
      <div className="arcade-body">
        <div className="arcade-main" inert={learnOpen ? true : undefined}>
          {children}
        </div>
        {learnOpen && learn && (
          <aside className="learn-panel" aria-label={`How to play ${title}`}>
            <div className="learn-head">
              <h2>How to play</h2>
              <button className="icon-toggle" onClick={() => setLearnOpen(false)} aria-label="Close lessons" autoFocus>
                <Icon name="close" />
              </button>
            </div>
            <div className="learn-content">{learn}</div>
          </aside>
        )}
      </div>
    </main>
  );
}

export function Lesson({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lesson">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function PlayChipsNote() {
  return <p className="play-chips-note">Play chips only. No real money, nothing to buy.</p>;
}
