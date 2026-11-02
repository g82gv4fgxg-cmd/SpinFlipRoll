/** Small Web Audio sound effects. Nothing plays while sound is switched off. */

type Scheduler = (callback: () => void, delayMs: number) => void;

let enabled = true;
let context: AudioContext | null = null;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

function audioContext(): AudioContext | null {
  if (context) return context;
  const Constructor =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  try {
    context = new Constructor();
  } catch {
    return null;
  }
  return context;
}

/** Browsers only allow audio to start from a tap or click, so call this from the handler that starts a spin. */
export function unlockAudio(): void {
  if (!enabled) return;
  const ctx = audioContext();
  if (ctx?.state === "suspended") ctx.resume().catch(() => undefined);
}

export function playTone(frequency: number, duration = 0.06, volume = 0.08, type: OscillatorType = "sine"): void {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx || ctx.state === "closed") return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration + 0.02);
}

function arpeggio(later: Scheduler, notes: number[], gapMs: number, duration: number, volume: number) {
  notes.forEach((frequency, index) => {
    later(() => playTone(frequency, duration, volume, index === notes.length - 1 ? "triangle" : "sine"), index * gapMs);
  });
}

export const sounds = {
  /** Ticks that slow down with the wheel. */
  spinTicks(later: Scheduler, durationMs: number) {
    let elapsed = 0;
    let interval = 42 * (durationMs / 4400);
    while (elapsed < durationMs - 250 * (durationMs / 4400)) {
      const time = elapsed;
      later(() => playTone(Math.max(160, 520 - (time / durationMs) * 340), 0.035, 0.045, "square"), time);
      elapsed += interval;
      interval = Math.min(interval * 1.055, 520);
    }
  },
  wheelWin(later: Scheduler) {
    arpeggio(later, [523.25, 659.25, 783.99, 1046.5], 90, 0.12, 0.1);
  },
  coinTicks(later: Scheduler, durationMs: number) {
    const scale = durationMs / 2100;
    [0, 130, 260, 410, 590, 820, 1090, 1390].forEach((time, index) => {
      later(() => playTone(720 - index * 54, 0.035, 0.045, "square"), time * scale);
    });
  },
  coinWin(later: Scheduler) {
    arpeggio(later, [392, 523.25, 783.99], 75, 0.08, 0.08);
  },
  diceRattle() {
    playTone(240 + Math.random() * 220, 0.03, 0.05, "square");
  },
  diceLand(later: Scheduler) {
    arpeggio(later, [330, 440, 660], 60, 0.07, 0.08);
  },
  gameHit(combo: number) {
    playTone(520 + Math.min(combo, 12) * 40, 0.07, 0.07, "triangle");
  },
  gameMiss() {
    playTone(140, 0.22, 0.12, "sawtooth");
  },
  gamePowerUp(later: Scheduler) {
    arpeggio(later, [660, 880, 1320], 50, 0.08, 0.08);
  },
  unlock(later: Scheduler) {
    arpeggio(later, [392, 523.25, 659.25, 783.99, 1046.5], 80, 0.14, 0.1);
  },
};
