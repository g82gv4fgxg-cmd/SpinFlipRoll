import { useRef, useState } from "react";
import Icon from "../components/Icon";
import { useTimers } from "../hooks";
import type { Shell } from "../shell";

type Mode = "wheel" | "coin" | "dice" | "arcade";

type HomeScreenProps = {
  shell: Shell;
  secretUnlocked: boolean;
  canInstall: boolean;
  onInstall: () => void;
  onOpen: (mode: Mode) => void;
  onUnlock: () => void;
};

const tapsToUnlock = 7;

export default function HomeScreen({ shell, secretUnlocked, canInstall, onInstall, onOpen, onUnlock }: HomeScreenProps) {
  const { later } = useTimers();
  const [entering, setEntering] = useState<Mode | null>(null);
  const [shaking, setShaking] = useState(false);
  const taps = useRef({ count: 0, last: 0 });
  const themeLabel = shell.theme === "dark" ? "Light mode" : "Dark mode";

  function open(mode: Mode) {
    if (entering) return;
    if (shell.reducedMotion) {
      onOpen(mode);
      return;
    }
    setEntering(mode);
    later(() => onOpen(mode), 620);
  }

  /** The secret: tap the small "SpinFlipRoll" title seven times in a row. */
  function tapTitle() {
    if (secretUnlocked) {
      shell.toast("The Games room is already unlocked. It's the last card.");
      return;
    }
    const now = Date.now();
    taps.current.count = now - taps.current.last < 1500 ? taps.current.count + 1 : 1;
    taps.current.last = now;
    const left = tapsToUnlock - taps.current.count;
    if (left <= 0) {
      taps.current.count = 0;
      onUnlock();
    } else if (taps.current.count >= 3) {
      shell.toast(`${left} more ${left === 1 ? "tap" : "taps"}…`);
    }
  }

  function lockedHint() {
    setShaking(true);
    later(() => setShaking(false), 500);
    shell.toast("Locked. Some say the title at the top likes being tapped.");
  }

  return (
    <main
      className={`mode-screen theme-${shell.theme}${shell.enhanced ? " enhanced" : ""} ${entering ? `launching launching-${entering}` : ""}`}
    >
      <section className="mode-hero">
        <div>
          <button className="hero-brand" onClick={tapTitle}>
            SpinFlipRoll
          </button>
          <h1>Choose your picker</h1>
        </div>
        <div className="hero-actions">
          <button
            className={`theme-toggle visuals-toggle${shell.enhanced ? " on" : ""}`}
            onClick={shell.toggleEnhanced}
            aria-pressed={shell.enhanced}
          >
            <Icon name="sparkles" size={16} /> Enhanced visuals
          </button>
          {canInstall && (
            <button className="theme-toggle" onClick={onInstall}>
              Install app
            </button>
          )}
          <button className="theme-toggle" onClick={shell.toggleTheme} aria-label={themeLabel}>
            {themeLabel}
          </button>
        </div>
      </section>

      <section className="mode-grid" aria-label="Picker modes">
        <button className="mode-card wheel-mode" onClick={() => open("wheel")}>
          <i aria-hidden="true" />
          <span>Wheel</span>
          <strong>Spin a custom decision wheel</strong>
        </button>
        <button className="mode-card coin-mode" onClick={() => open("coin")}>
          <i aria-hidden="true" />
          <span>Coin</span>
          <strong>Flip heads, tails, or your own labels</strong>
        </button>
        <button className="mode-card dice-mode" onClick={() => open("dice")}>
          <i aria-hidden="true" />
          <span>Dice</span>
          <strong>Roll up to six dice, d4 to d20</strong>
        </button>
        {secretUnlocked ? (
          <button className="mode-card secret-mode unlocked" onClick={() => open("arcade")}>
            <i aria-hidden="true" />
            <span>Games room</span>
            <strong>Learn blackjack, poker and pool, plus Spin Guard</strong>
          </button>
        ) : (
          <button className={`mode-card secret-mode locked${shaking ? " shake" : ""}`} onClick={lockedHint} aria-label="Locked secret">
            <b className="lock-badge" aria-hidden="true">
              <Icon name="lock" size={34} />
            </b>
            <span>???</span>
            <strong>Locked</strong>
          </button>
        )}
      </section>
    </main>
  );
}
