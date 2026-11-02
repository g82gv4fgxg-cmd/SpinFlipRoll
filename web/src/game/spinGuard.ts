/**
 * Spin Guard: the secret game. Coloured orbs fly at the wheel from every direction and the
 * player turns the wheel so each orb hits the slice of the same colour. Gold coins (they flip as
 * they fly) give double points; dice roll a random bonus.
 */
import { randomInt } from "../random";

export type GameStatus = "ready" | "playing" | "paused" | "over";

export type GameHud = {
  status: GameStatus;
  score: number;
  lives: number;
  combo: number;
  multiplier: number;
  colours: number;
  /** Wheel position in slices; changes every time the player turns. */
  step: number;
  shield: boolean;
  message: { id: number; text: string } | null;
};

export type GameCallbacks = {
  onHud: (hud: GameHud) => void;
  onGameOver: (score: number) => void;
  sounds: {
    hit: (combo: number) => void;
    miss: () => void;
    power: () => void;
  };
};

type OrbKind = "colour" | "coin" | "die";

type Orb = {
  kind: OrbKind;
  colour: number;
  angle: number;
  dist: number;
  speed: number;
  spin: number;
  trail: { x: number; y: number }[];
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; colour: string; size: number };
type Floater = { x: number; y: number; text: string; life: number; colour: string };
type Star = { angle: number; dist: number };

const sliceColours = ["#E9584D", "#F4C531", "#45C27A", "#4C8FE6", "#A274EA", "#F28B3B"];
const startLives = 3;
const maxLives = 5;
const tau = Math.PI * 2;

export const initialHud: GameHud = {
  status: "ready",
  score: 0,
  lives: startLives,
  combo: 0,
  multiplier: 1,
  colours: 4,
  step: 0,
  shield: false,
  message: null,
};

export class SpinGuardGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: GameCallbacks;
  private readonly resizeObserver: ResizeObserver;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private lastTime = 0;

  private status: GameStatus = "ready";
  private rotation = 0;
  private idleSpin = 0;
  private step = 0;
  private colours = 4;
  private orbs: Orb[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private stars: Star[] = [];
  private score = 0;
  private lives = startLives;
  private combo = 0;
  private spawnIn = 1;
  private shake = 0;
  private flash = 0;
  private pulse = 0;
  private slowFor = 0;
  private doubleFor = 0;
  private shield = false;
  private rolledFace: { face: number; time: number } | null = null;
  private message: GameHud["message"] = null;
  private messageId = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not supported");
    this.canvas = canvas;
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.stars = Array.from({ length: 80 }, () => ({ angle: Math.random() * tau, dist: Math.random() * 600 }));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
    this.emit();
  }

  get state(): GameStatus {
    return this.status;
  }

  start(): void {
    this.status = "playing";
    this.score = 0;
    this.lives = startLives;
    this.combo = 0;
    this.colours = 4;
    this.step = 0;
    this.rotation = 0;
    this.orbs = [];
    this.spawnIn = 0.8;
    this.slowFor = 0;
    this.doubleFor = 0;
    this.shield = false;
    this.rolledFace = null;
    this.message = null;
    this.emit();
  }

  /** Space or Enter: start, restart or resume. */
  primaryAction(): void {
    if (this.status === "ready" || this.status === "over") this.start();
    else if (this.status === "paused") this.resume();
  }

  rotate(direction: 1 | -1): void {
    if (this.status !== "playing") return;
    this.step += direction;
    this.emit();
  }

  pause(): void {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.emit();
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.status = "playing";
    this.lastTime = 0;
    this.emit();
  }

  togglePause(): void {
    if (this.status === "playing") this.pause();
    else this.resume();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  // ---------- Geometry ----------

  private get cx() {
    return this.width / 2;
  }

  private get cy() {
    return this.height / 2;
  }

  private get wheelRadius() {
    return clamp(Math.min(this.width, this.height) * 0.15, 42, 112);
  }

  private get orbRadius() {
    return clamp(Math.min(this.width, this.height) * 0.028, 9, 17);
  }

  private get sliceAngle() {
    return tau / this.colours;
  }

  private get targetRotation() {
    return this.step * this.sliceAngle;
  }

  /** Distance from the centre to the edge of the screen in a given direction. */
  private edgeDistance(angle: number) {
    const dx = Math.abs(Math.cos(angle)) || 1e-6;
    const dy = Math.abs(Math.sin(angle)) || 1e-6;
    return Math.min(this.width / 2 / dx, this.height / 2 / dy);
  }

  /** Which slice faces a given direction, using where the wheel is heading so quick turns count. */
  private sliceAt(angle: number) {
    const start = -Math.PI / 2 - this.sliceAngle / 2;
    return Math.floor(mod(angle - this.targetRotation - start, tau) / this.sliceAngle) % this.colours;
  }

  private orbPosition(orb: Orb) {
    return { x: this.cx + Math.cos(orb.angle) * orb.dist, y: this.cy + Math.sin(orb.angle) * orb.dist };
  }

  private multiplier() {
    return Math.min(4, 1 + Math.floor(this.combo / 10)) * (this.doubleFor > 0 ? 2 : 1);
  }

  // ---------- Loop ----------

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  private frame = (time: number) => {
    const dt = this.lastTime ? Math.min(0.05, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    if (this.status === "paused") return;

    this.rotation += (this.targetRotation - this.rotation) * Math.min(1, dt * 18);
    if (this.status !== "playing") this.idleSpin += dt * 0.5;

    const maxStar = Math.hypot(this.width, this.height) / 2;
    for (const star of this.stars) {
      star.dist += dt * (14 + star.dist * 0.45) * (this.slowFor > 0 ? 0.4 : 1);
      if (star.dist > maxStar) {
        star.dist = Math.random() * 40;
        star.angle = Math.random() * tau;
      }
    }

    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);

    for (const floater of this.floaters) {
      floater.y -= dt * 42;
      floater.life -= dt;
    }
    this.floaters = this.floaters.filter((floater) => floater.life > 0);

    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    if (this.rolledFace) {
      this.rolledFace.time -= dt;
      if (this.rolledFace.time <= 0) this.rolledFace = null;
    }

    if (this.status !== "playing") return;

    this.slowFor = Math.max(0, this.slowFor - dt);
    const hadDouble = this.doubleFor > 0;
    this.doubleFor = Math.max(0, this.doubleFor - dt);
    if (hadDouble && this.doubleFor === 0) this.emit();

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnWave();
      this.spawnIn = Math.max(0.55, 1.55 - this.score * 0.01);
    }

    const pace = this.slowFor > 0 ? 0.45 : 1;
    const hitDistance = this.wheelRadius + this.orbRadius * 0.35;
    for (const orb of this.orbs) {
      orb.dist -= orb.speed * pace * dt;
      orb.spin += dt * 7;
      orb.trail.push(this.orbPosition(orb));
      if (orb.trail.length > 9) orb.trail.shift();
    }
    const arrived = this.orbs.filter((orb) => orb.dist <= hitDistance);
    if (arrived.length) {
      this.orbs = this.orbs.filter((orb) => orb.dist > hitDistance);
      arrived.forEach((orb) => this.resolve(orb));
    }
  }

  private spawnWave() {
    this.spawnOrb(0);
    // Later on, a second orb follows from another direction, far enough behind to be fair.
    if (this.score >= 20 && Math.random() < Math.min(0.4, 0.12 + this.score / 350)) this.spawnOrb(0.8);
  }

  private spawnOrb(delaySeconds: number) {
    const angle = Math.random() * tau;
    const travelSeconds = Math.max(1.2, 3 - this.score * 0.018);
    const edge = this.edgeDistance(angle) + this.orbRadius * 2;
    const speed = (edge - this.wheelRadius) / travelSeconds;
    const roll = Math.random();
    const kind: OrbKind = this.score >= 6 && roll < 0.05 ? "die" : roll < 0.11 ? "coin" : "colour";
    this.orbs.push({ kind, colour: randomInt(this.colours), angle, dist: edge + speed * delaySeconds, speed, spin: 0, trail: [] });
  }

  private resolve(orb: Orb) {
    const { x, y } = this.orbPosition(orb);

    if (orb.kind === "coin") {
      this.doubleFor = 8;
      const gained = 5 * this.multiplier();
      this.score += gained;
      this.burst(x, y, "#F4C531", 26);
      this.float(x, y, `+${gained}`, "#F4C531");
      this.say("Lucky coin! Double points");
      this.callbacks.sounds.power();
    } else if (orb.kind === "die") {
      this.burst(x, y, "#FFFFFF", 22);
      this.rollBonus();
    } else if (this.sliceAt(orb.angle) === orb.colour) {
      this.combo += 1;
      const gained = this.multiplier();
      this.score += gained;
      this.burst(x, y, sliceColours[orb.colour], 16);
      this.float(x, y, `+${gained}`, sliceColours[orb.colour]);
      this.callbacks.sounds.hit(this.combo);
      if (this.combo % 10 === 0) this.say(`${this.combo} in a row! x${this.multiplier()}`);
    } else {
      this.miss(x, y);
    }

    this.checkLevel();
    this.emit();
  }

  private miss(x: number, y: number) {
    if (this.shield) {
      this.shield = false;
      this.burst(x, y, "#7FE7FF", 24);
      this.say("Shield blocked it!");
      this.callbacks.sounds.power();
      return;
    }
    this.lives -= 1;
    this.combo = 0;
    this.shake = 1;
    this.flash = 1;
    this.burst(x, y, "#FF4D4D", 20);
    this.callbacks.sounds.miss();
    if (this.lives <= 0) this.gameOver();
  }

  private rollBonus() {
    const face = randomInt(6) + 1;
    this.rolledFace = { face, time: 1.8 };
    this.callbacks.sounds.power();
    switch (face) {
      case 1:
        this.slowFor = 7;
        this.say("Rolled 1: Slow motion");
        break;
      case 2:
        this.shield = true;
        this.say("Rolled 2: Shield up");
        break;
      case 3:
        this.lives = Math.min(maxLives, this.lives + 1);
        this.say("Rolled 3: Extra life");
        break;
      case 4: {
        const cleared = this.orbs.length;
        this.orbs.forEach((item) => {
          const position = this.orbPosition(item);
          this.burst(position.x, position.y, item.kind === "colour" ? sliceColours[item.colour] : "#FFFFFF", 12);
        });
        this.orbs = [];
        this.score += cleared * this.multiplier();
        this.say(`Rolled 4: Board cleared${cleared ? ` +${cleared * this.multiplier()}` : ""}`);
        break;
      }
      case 5:
        this.doubleFor = 8;
        this.say("Rolled 5: Double points");
        break;
      default:
        this.score += 10;
        this.say("Rolled 6: Jackpot +10");
    }
  }

  private checkLevel() {
    const next = this.score >= 70 ? 6 : this.score >= 30 ? 5 : 4;
    if (next === this.colours || this.status !== "playing") return;
    const angle = this.targetRotation;
    this.colours = next;
    this.step = Math.round(angle / this.sliceAngle);
    this.pulse = 1;
    this.say(`Level up! ${next} colours`);
  }

  private gameOver() {
    this.status = "over";
    this.orbs.forEach((orb) => {
      const { x, y } = this.orbPosition(orb);
      this.burst(x, y, "#FF4D4D", 8);
    });
    this.orbs = [];
    this.callbacks.onGameOver(this.score);
  }

  private say(text: string) {
    this.messageId += 1;
    this.message = { id: this.messageId, text };
  }

  private emit() {
    this.callbacks.onHud({
      status: this.status,
      score: this.score,
      lives: this.lives,
      combo: this.combo,
      multiplier: this.multiplier(),
      colours: this.colours,
      step: this.step,
      shield: this.shield,
      message: this.message,
    });
  }

  private burst(x: number, y: number, colour: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * tau;
      const speed = 70 + Math.random() * 230;
      const life = 0.45 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        colour,
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }

  private float(x: number, y: number, text: string, colour: string) {
    this.floaters.push({ x, y, text, life: 0.9, colour });
  }

  // ---------- Drawing ----------

  private draw() {
    const { ctx, width: w, height: h, cx, cy } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const background = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
    background.addColorStop(0, this.slowFor > 0 ? "#142a4a" : "#1b2244");
    background.addColorStop(1, "#05070f");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 16, (Math.random() - 0.5) * this.shake * 16);

    this.drawStars();
    this.drawRings();
    this.drawAimLines();
    this.orbs.forEach((orb) => this.drawOrb(orb));
    this.drawWheel();
    this.drawParticles();
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 60, 60, ${this.flash * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawStars() {
    const { ctx, cx, cy } = this;
    const maxStar = Math.hypot(this.width, this.height) / 2;
    for (const star of this.stars) {
      const depth = star.dist / maxStar;
      ctx.fillStyle = `rgba(220, 230, 255, ${0.15 + depth * 0.6})`;
      const size = 0.6 + depth * 2;
      ctx.fillRect(cx + Math.cos(star.angle) * star.dist, cy + Math.sin(star.angle) * star.dist, size, size);
    }
  }

  private drawRings() {
    const { ctx, cx, cy } = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    for (const factor of [1.9, 3, 4.2]) {
      ctx.beginPath();
      ctx.arc(cx, cy, this.wheelRadius * factor, 0, tau);
      ctx.stroke();
    }
  }

  /** Faint guide lines for the two closest orbs. */
  private drawAimLines() {
    const { ctx, cx, cy } = this;
    const closest = [...this.orbs].sort((a, b) => a.dist - b.dist).slice(0, 2);
    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.lineWidth = 2;
    for (const orb of closest) {
      const { x, y } = this.orbPosition(orb);
      ctx.strokeStyle = hexToRgba(orb.kind === "colour" ? sliceColours[orb.colour] : "#FFFFFF", 0.28);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx + Math.cos(orb.angle) * this.wheelRadius, cy + Math.sin(orb.angle) * this.wheelRadius);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawOrb(orb: Orb) {
    const { ctx } = this;
    const r = this.orbRadius;
    const { x, y } = this.orbPosition(orb);
    const colour = orb.kind === "colour" ? sliceColours[orb.colour] : orb.kind === "coin" ? "#F4C531" : "#FFFFFF";

    orb.trail.forEach((point, index) => {
      const alpha = (index / orb.trail.length) * 0.35;
      ctx.fillStyle = hexToRgba(colour, alpha);
      ctx.beginPath();
      ctx.arc(point.x, point.y, r * (0.3 + (index / orb.trail.length) * 0.5), 0, tau);
      ctx.fill();
    });

    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = colour;
    ctx.shadowBlur = 18;

    if (orb.kind === "coin") {
      // Squash horizontally so the coin looks like it's flipping as it flies.
      ctx.scale(Math.max(0.15, Math.abs(Math.cos(orb.spin))), 1);
      const gradient = ctx.createLinearGradient(-r, -r, r, r);
      gradient.addColorStop(0, "#FFF2A8");
      gradient.addColorStop(0.5, "#F4C531");
      gradient.addColorStop(1, "#B9791F");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.1, 0, tau);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.68, 0, tau);
      ctx.stroke();
    } else if (orb.kind === "die") {
      ctx.rotate(orb.spin * 0.6);
      ctx.fillStyle = "#FFFDF7";
      roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.45);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1B1F2A";
      drawPips(ctx, 5, r * 1.6);
    } else {
      const gradient = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      gradient.addColorStop(0, "#FFFFFF");
      gradient.addColorStop(0.25, colour);
      gradient.addColorStop(1, colour);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, tau);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawWheel() {
    const { ctx, cx, cy } = this;
    const R = this.wheelRadius * (1 + this.pulse * 0.08);
    const slice = this.sliceAngle;
    const rotation = this.status === "playing" || this.status === "paused" ? this.rotation : this.rotation + this.idleSpin;
    const start = -Math.PI / 2 - slice / 2 + rotation;

    if (this.shield) {
      ctx.save();
      ctx.strokeStyle = "rgba(127, 231, 255, 0.85)";
      ctx.shadowColor = "#7FE7FF";
      ctx.shadowBlur = 20;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 12, 0, tau);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    for (let i = 0; i < this.colours; i++) {
      const a0 = start + i * slice;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a0 + slice);
      ctx.closePath();
      ctx.fillStyle = sliceColours[i];
      ctx.shadowColor = sliceColours[i];
      ctx.shadowBlur = 16;
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(5, 7, 15, 0.55)";
    ctx.lineWidth = 3;
    for (let i = 0; i < this.colours; i++) {
      const a = start + i * slice;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, tau);
    ctx.stroke();

    // Hub: shows the rolled die, otherwise the score multiplier, ringed by any timed power-up.
    const hub = R * 0.42;
    ctx.fillStyle = "#0B1020";
    ctx.beginPath();
    ctx.arc(cx, cy, hub, 0, tau);
    ctx.fill();
    this.drawTimerRing(hub + 4, this.doubleFor / 8, "#F4C531");
    this.drawTimerRing(hub + 9, this.slowFor / 7, "#7FB8FF");

    if (this.rolledFace) {
      ctx.fillStyle = "#FFFDF7";
      roundRect(ctx, cx - hub * 0.7, cy - hub * 0.7, hub * 1.4, hub * 1.4, hub * 0.3);
      ctx.fill();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "#1B1F2A";
      drawPips(ctx, this.rolledFace.face, hub * 1.15);
      ctx.restore();
    } else {
      const multiplier = this.multiplier();
      ctx.fillStyle = multiplier > 1 ? "#F4C531" : "rgba(255, 255, 255, 0.85)";
      ctx.font = `800 ${Math.round(hub * 0.75)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`x${multiplier}`, cx, cy + 1);
    }
  }

  private drawTimerRing(radius: number, fraction: number, colour: string) {
    if (fraction <= 0) return;
    const { ctx, cx, cy } = this;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + tau * Math.min(1, fraction));
    ctx.stroke();
  }

  private drawParticles() {
    const { ctx } = this;
    for (const particle of this.particles) {
      ctx.fillStyle = hexToRgba(particle.colour, particle.life / particle.maxLife);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, tau);
      ctx.fill();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 18px Inter, system-ui, sans-serif";
    for (const floater of this.floaters) {
      ctx.fillStyle = hexToRgba(floater.colour, Math.min(1, floater.life / 0.5));
      ctx.fillText(floater.text, floater.x, floater.y);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function hexToRgba(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws die pips centred on the current origin, inside a square of the given size. */
function drawPips(ctx: CanvasRenderingContext2D, face: number, size: number) {
  const o = size * 0.28;
  const spots: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-o, -o], [o, o]],
    3: [[-o, -o], [0, 0], [o, o]],
    4: [[-o, -o], [o, -o], [-o, o], [o, o]],
    5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]],
    6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]],
  };
  for (const [x, y] of spots[face] ?? spots[1]) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.09, 0, tau);
    ctx.fill();
  }
}
