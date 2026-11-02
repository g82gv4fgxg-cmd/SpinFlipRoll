import Icon from "../components/Icon";
import { PlayChipsNote } from "../components/GameFrame";
import type { GameScreen, Shell } from "../shell";
import type { ArcadeStats } from "../types";

type ArcadeScreenProps = {
  shell: Shell;
  arcade: ArcadeStats;
  best: number;
  onOpen: (game: GameScreen) => void;
};

const format = (value: number) => value.toLocaleString("en-AU");

export default function ArcadeScreen({ shell, arcade, best, onOpen }: ArcadeScreenProps) {
  const accuracy = arcade.coachTotal ? Math.round((arcade.coachRight / arcade.coachTotal) * 100) : null;
  const games: { id: GameScreen; name: string; blurb: string; stat: string }[] = [
    {
      id: "blackjack",
      name: "Blackjack",
      blurb: "Beat the dealer to 21. A coach checks every decision against basic strategy.",
      stat: `${format(arcade.blackjackChips)} chips${accuracy === null ? "" : ` · ${accuracy}% coach match`}`,
    },
    {
      id: "poker",
      name: "Texas Hold'em",
      blurb: "Poker against three computer players, with win chances and pot odds explained as you play.",
      stat: `${format(arcade.pokerChips)} chips`,
    },
    {
      id: "pool",
      name: "8-ball pool",
      blurb: "Real ball physics with spin, aiming guides and a referee that explains the rules.",
      stat: `Won ${arcade.poolWins}, lost ${arcade.poolLosses}`,
    },
    {
      id: "spinguard",
      name: "Spin Guard",
      blurb: "The original secret: turn the wheel to catch orbs of the same colour.",
      stat: `Best ${best}`,
    },
  ];

  return (
    <main className="arcade-screen arcade-hub">
      <header className="game-bar">
        <button className="game-back" onClick={shell.goHome}>
          <Icon name="left" size={18} /> Modes
        </button>
        <h1>Games room</h1>
        <div className="game-stats" />
        <div className="game-buttons">
          <button className="icon-toggle" onClick={shell.toggleSound} aria-label="Sound" aria-pressed={shell.soundOn}>
            <Icon name={shell.soundOn ? "sound-on" : "sound-off"} />
          </button>
        </div>
      </header>
      <div className="hub-body">
        <div className="hub-intro">
          <p className="game-kicker">Secret unlocked</p>
          <h2>Learn a game, then play it</h2>
          <p>Each table has a Learn button with the rules and tips, and a coach that explains good moves while you play.</p>
        </div>
        <section className="hub-grid" aria-label="Games">
          {games.map((game) => (
            <button key={game.id} className={`hub-card hub-${game.id}`} onClick={() => onOpen(game.id)}>
              <span className="hub-art" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="hub-name">{game.name}</span>
              <span className="hub-blurb">{game.blurb}</span>
              <span className="hub-stat">{game.stat}</span>
            </button>
          ))}
        </section>
        <PlayChipsNote />
      </div>
    </main>
  );
}
