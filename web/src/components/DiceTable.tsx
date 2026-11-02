import { useEffect, useImperativeHandle, useRef } from "react";
import type { Ref } from "react";
import { css, hexToRgb, mixRgb, useAnimationLoop, useCanvasSize } from "../canvas";
import type { CanvasSize } from "../canvas";
import { useTimers } from "../hooks";
import { dieSize, poseAt, simulateRoll } from "../physics/diceSim";
import type { DiceRoll, Tray } from "../physics/diceSim";
import { baseLabels, orientationShowing, polyhedron, relabel, restHeight, valueShown } from "../physics/polyhedra";
import type { Polyhedron } from "../physics/polyhedra";
import { add, cross, dot, normalize, rotate, scale, sub, vec } from "../physics/vec";
import type { Quat, Vec3 } from "../physics/vec";
import { playTone } from "../sound";
import type { DieSides } from "../types";

export type DiceTableHandle = {
  /** Throws every die that isn't held so they land showing `values`. Returns milliseconds. */
  roll: (values: number[], held: ReadonlySet<number>) => number;
};

type DiceTableProps = {
  count: number;
  sides: DieSides;
  values: (number | null)[];
  held: ReadonlySet<number>;
  disabled: boolean;
  onToggleHold: (index: number) => void;
  ref?: Ref<DiceTableHandle>;
};

type Die = { shape: Polyhedron; labels: number[]; position: Vec3; orientation: Quat };

// Camera looks down at the tray from this angle above horizontal.
const elevation = (60 * Math.PI) / 180;
const sinE = Math.sin(elevation);
const cosE = Math.cos(elevation);
const toCamera = vec(0, sinE, cosE);
const light = normalize(vec(-0.4, 0.85, 0.35));
const halfway = normalize(add(light, toCamera));
const halfDepth = 2.6;
// Labels are drawn at 100x so text renders at a normal font size.
const unit = 100;

const dieColours: Record<DieSides, string> = {
  4: "D4756A",
  6: "FFF8EC",
  8: "5BAA7C",
  10: "E89450",
  12: "8B6FBF",
  20: "5B8AC4",
};

export default function DiceTable({ count, sides, values, held, disabled, onToggleHold, ref }: DiceTableProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  const dice = useRef<Die[]>([]);
  const roll = useRef<{ plan: DiceRoll; started: number } | null>(null);
  const felt = useRef<CanvasPattern | null>(null);
  const latest = useRef({ held, disabled });
  latest.current = { held, disabled };
  const { later } = useTimers();

  const start = useAnimationLoop((now) => {
    const active = roll.current;
    if (active) {
      const elapsed = (now - active.started) / 1000;
      const pose = poseAt(active.plan, elapsed);
      dice.current.forEach((die, index) => {
        die.position = pose.positions[index];
        die.orientation = pose.orientations[index];
      });
      if (elapsed >= active.plan.duration) {
        roll.current = null;
        canvasRef.current?.setAttribute("data-values", currentValues().join(","));
      }
    }
    draw();
    return Boolean(roll.current);
  });

  function currentValues() {
    return dice.current.map((die) => valueShown(die.shape, die.labels, die.orientation));
  }

  function tray(): Tray & { s: number; cx: number; cy: number } {
    const { width, height } = size.current;
    const s0 = (height * 0.8) / (2 * halfDepth * sinE + 0.9);
    const halfWidth = Math.min(6.5, Math.max(1.9, (width * 0.9) / (2 * s0)));
    const s = Math.min((width * 0.9) / (2 * halfWidth), s0);
    return { halfWidth, halfDepth, s, cx: width / 2, cy: height / 2 + s * 0.25 };
  }

  /** Lays the dice out in a row, each showing its current value. */
  function arrange() {
    const shape = polyhedron(sides);
    const { halfWidth } = tray();
    const spacing = Math.min(1.7, (halfWidth * 2 - 0.8) / Math.max(1, count));
    dice.current = Array.from({ length: count }, (_, index) => {
      const labels = baseLabels(shape);
      const value = values[index] ?? 1 + ((index * 3) % sides);
      const orientation = orientationShowing(shape, labels, value, (index * 1.7 + 0.4) % (Math.PI * 2));
      const x = (index - (count - 1) / 2) * spacing;
      return { shape, labels, orientation, position: vec(x, restHeight(shape, orientation, dieSize), 0.2) };
    });
    canvasRef.current?.setAttribute("data-values", values.map((value) => value ?? "").join(","));
  }

  useEffect(() => {
    roll.current = null;
    arrange();
    draw();
    // Only a new number or kind of dice resets the table; values change after every roll.
  }, [count, sides]);

  useEffect(() => {
    if (!roll.current) draw();
  }, [held]);

  useCanvasSize(canvasRef, (next) => {
    size.current = next;
    if (dice.current.length !== count) arrange();
    draw();
  });

  useImperativeHandle(
    ref,
    () => ({
      roll(targetValues, heldDice) {
        const table = tray();
        const plan = simulateRoll(
          dice.current.map((die, index) => ({ shape: die.shape, position: die.position, orientation: die.orientation, held: heldDice.has(index) })),
          table
        );
        // Renumber each thrown die so the value picked by the app is the one that lands on top.
        const final = plan.frames[plan.frames.length - 1];
        dice.current = dice.current.map((die, index) =>
          heldDice.has(index) ? die : { ...die, labels: relabel(die.shape, die.labels, final.orientations[index], targetValues[index]) }
        );
        roll.current = { plan, started: performance.now() };
        let lastSound = -1;
        plan.impacts.forEach((impact) => {
          if (impact.time - lastSound < 0.035) return;
          lastSound = impact.time;
          later(() => {
            playTone(150 + Math.random() * 140, 0.05, 0.03 + impact.strength * 0.08, "square");
            playTone(900 + Math.random() * 500, 0.02, 0.02 + impact.strength * 0.03, "triangle");
          }, impact.time * 1000);
        });
        canvasRef.current?.setAttribute("data-values", "");
        start();
        return plan.duration * 1000;
      },
    }),
    [later, start, count, sides]
  );

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height, dpr } = size.current;
    const t = tray();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const project = (p: Vec3) => ({ x: t.cx + p.x * t.s, y: t.cy + (-p.y * cosE + p.z * sinE) * t.s });
    drawTray(ctx, t, project);

    // Shadows first, then dice from back to front.
    const order = dice.current.map((die, index) => ({ die, index })).sort((a, b) => depth(a.die.position) - depth(b.die.position));
    for (const { die, index } of order) {
      const ground = project(vec(die.position.x, 0, die.position.z));
      const height = Math.max(0, die.position.y - dieSize * 0.6);
      const radius = dieSize * t.s * (1.1 + height * 0.25);
      ctx.save();
      ctx.translate(ground.x, ground.y);
      ctx.scale(1, sinE);
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      shadow.addColorStop(0, `rgba(0, 0, 0, ${0.5 / (1 + height * 0.8)})`);
      shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      if (latest.current.held.has(index)) {
        ctx.strokeStyle = "rgba(244, 197, 49, 0.9)";
        ctx.shadowColor = "#f4c531";
        ctx.shadowBlur = 14;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, dieSize * t.s * 1.25, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const { die, index } of order) drawDie(ctx, die, latest.current.held.has(index), project, t.s, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawTray(ctx: CanvasRenderingContext2D, t: ReturnType<typeof tray>, project: (p: Vec3) => { x: number; y: number }) {
    const nearLeft = project(vec(-t.halfWidth, 0, t.halfDepth));
    const farRight = project(vec(t.halfWidth, 0, -t.halfDepth));
    const x = nearLeft.x;
    const y = farRight.y;
    const w = farRight.x - nearLeft.x;
    const h = nearLeft.y - farRight.y;
    const wall = 0.55 * cosE * t.s;

    // Wooden frame: the far wall shows its inner face above the floor.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    const wood = ctx.createLinearGradient(0, y - wall, 0, y + h + 14);
    wood.addColorStop(0, "#6b4a33");
    wood.addColorStop(0.5, "#4a3122");
    wood.addColorStop(1, "#2f1f15");
    ctx.fillStyle = wood;
    roundRect(ctx, x - 14, y - wall - 10, w + 28, h + wall + 24, 20);
    ctx.fill();
    ctx.restore();

    // Felt floor with a soft light and a woven texture.
    const floor = ctx.createRadialGradient(x + w * 0.35, y + h * 0.3, 10, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    floor.addColorStop(0, "#2f6f63");
    floor.addColorStop(1, "#163a35");
    ctx.fillStyle = floor;
    roundRect(ctx, x, y - wall, w, h + wall, 12);
    ctx.fill();
    if (!felt.current) felt.current = feltPattern(ctx);
    if (felt.current) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = felt.current;
      roundRect(ctx, x, y - wall, w, h + wall, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Inner shadow along the walls.
    const inner = ctx.createLinearGradient(0, y - wall, 0, y + 30);
    inner.addColorStop(0, "rgba(0, 0, 0, 0.45)");
    inner.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = inner;
    roundRect(ctx, x, y - wall, w, wall + 30, 12);
    ctx.fill();
  }

  return (
    <canvas
      ref={canvasRef}
      className="dice-table"
      role="img"
      aria-label="Dice tray. Tap a die to hold it."
      onPointerDown={(event) => {
        if (latest.current.disabled || roll.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const t = tray();
        let nearest = -1;
        let best = dieSize * t.s * 1.3;
        dice.current.forEach((die, index) => {
          const centre = { x: t.cx + die.position.x * t.s, y: t.cy + (-die.position.y * cosE + die.position.z * sinE) * t.s };
          const distance = Math.hypot(px - centre.x, py - centre.y);
          if (distance < best) {
            best = distance;
            nearest = index;
          }
        });
        if (nearest >= 0) onToggleHold(nearest);
      }}
    />
  );
}

function depth(p: Vec3) {
  return p.y * sinE + p.z * cosE;
}

function drawDie(
  ctx: CanvasRenderingContext2D,
  die: Die,
  isHeld: boolean,
  project: (p: Vec3) => { x: number; y: number },
  s: number,
  dpr: number
) {
  const { shape } = die;
  // A touch of perspective: nearer dice look slightly bigger.
  const perspective = 1 + depth(die.position) * 0.035;
  const centre = project(die.position);
  const world = (local: Vec3) => rotate(die.orientation, scale(local, dieSize));
  const toScreen = (offset: Vec3) => {
    const p = project(add(die.position, offset));
    return { x: centre.x + (p.x - centre.x) * perspective, y: centre.y + (p.y - centre.y) * perspective };
  };
  const corners = shape.vertices.map((v) => world(v));
  const base = hexToRgb(isHeld ? "F4C531" : dieColours[shape.sides]);
  const ink = shape.sides === 6 || isHeld ? "#1b1f2a" : "#ffffff";

  shape.faces.forEach((face, faceIndex) => {
    const normal = rotate(die.orientation, shape.normals[faceIndex]);
    if (dot(normal, toCamera) <= 0.01) return;

    // Lambert shading plus a soft specular highlight.
    const diffuse = Math.max(0, dot(normal, light));
    const specular = Math.pow(Math.max(0, dot(normal, halfway)), 28) * 0.55;
    const lit = mixRgb(mixRgb([0, 0, 0], base, 0.42 + diffuse * 0.62), [255, 255, 255], specular);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    face.forEach((vertex, i) => {
      const p = toScreen(corners[vertex]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = css(lit);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = css(mixRgb(lit, [255, 255, 255], 0.35), 0.8);
    ctx.stroke();

    // Number or pips, drawn flat on the face using the face's own axes.
    const axes = shape.faceAxes[faceIndex];
    const faceCentre = world(shape.centroids[faceIndex]);
    const across = rotate(die.orientation, axes.across);
    const up = rotate(die.orientation, axes.up);
    const origin = toScreen(faceCentre);
    const ax = toScreen(add(faceCentre, scale(across, 1 / unit)));
    const ay = toScreen(add(faceCentre, scale(up, -1 / unit)));
    const setFace = () =>
      ctx.setTransform(dpr * (ax.x - origin.x), dpr * (ax.y - origin.y), dpr * (ay.x - origin.x), dpr * (ay.y - origin.y), dpr * origin.x, dpr * origin.y);
    const room = axes.size * dieSize * unit;
    ctx.fillStyle = ink;

    if (shape.labelOn === "vertex") {
      // d4: each corner of the face shows that corner's number, pointing at the corner.
      face.forEach((vertex) => {
        const toCorner = normalize(sub(corners[vertex], faceCentre));
        const spot = add(faceCentre, scale(sub(corners[vertex], faceCentre), 0.56));
        const cornerAcross = cross(toCorner, normal);
        const o = toScreen(spot);
        const cx = toScreen(add(spot, scale(cornerAcross, 1 / unit)));
        const cy = toScreen(add(spot, scale(toCorner, -1 / unit)));
        ctx.setTransform(dpr * (cx.x - o.x), dpr * (cx.y - o.y), dpr * (cy.x - o.x), dpr * (cy.y - o.y), dpr * o.x, dpr * o.y);
        ctx.font = `800 ${room * 0.62}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(die.labels[vertex]), 0, 0);
      });
      return;
    }

    setFace();
    const value = die.labels[faceIndex];
    if (shape.sides === 6) {
      const spots: Record<number, [number, number][]> = {
        1: [[0, 0]],
        2: [[-1, -1], [1, 1]],
        3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
      };
      const gap = room * 0.52;
      for (const [px, py] of spots[value] ?? []) {
        ctx.beginPath();
        ctx.arc(px * gap, py * gap, room * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    const text = String(value);
    ctx.font = `800 ${room * (text.length > 1 ? 0.95 : 1.15)}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, room * 0.05);
    // Underline 6 and 9 so they can be told apart.
    if (value === 6 || value === 9) ctx.fillRect(-room * 0.3, room * 0.55, room * 0.6, room * 0.09);
  });
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

/** A fine speckled texture for the felt, made once. */
function feltPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = 96;
  tile.height = 96;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return null;
  for (let i = 0; i < 900; i++) {
    tileCtx.fillStyle = Math.random() < 0.5 ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.12)";
    tileCtx.fillRect(Math.random() * 96, Math.random() * 96, 1, 1 + Math.random());
  }
  return ctx.createPattern(tile, "repeat");
}
