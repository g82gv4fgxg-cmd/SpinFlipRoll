import { useImperativeHandle, useRef } from "react";
import type { Ref } from "react";
import { darken, lighten, useAnimationLoop, useCanvasSize } from "../canvas";
import type { CanvasSize } from "../canvas";
import { useTimers } from "../hooks";
import { coinRadius, coinThickness, frameAt, restingFrame, simulateToss } from "../physics/coinSim";
import type { CoinFrame, CoinToss } from "../physics/coinSim";
import { playTone } from "../sound";
import type { CoinSide } from "../types";

export type PhysicsCoinHandle = {
  /** Tosses the coin so `side` lands face up. Returns how long the toss takes, in milliseconds. */
  toss: (side: 0 | 1) => number;
};

type PhysicsCoinProps = {
  sides: [CoinSide, CoinSide];
  /** Which side is showing before the first toss. */
  restingSide: 0 | 1;
  ref?: Ref<PhysicsCoinHandle>;
};

// The camera looks down at the table from this angle above horizontal.
const elevation = (50 * Math.PI) / 180;
const sinE = Math.sin(elevation);
const cosE = Math.cos(elevation);
// Faces are drawn on a 100-unit circle so text is rendered at a normal font size.
const unit = 100;

export default function PhysicsCoin({ sides, restingSide, ref }: PhysicsCoinProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  const frame = useRef<CoinFrame>(restingFrame(0));
  // Which side's label is painted on the coin's physical front and back faces.
  const faceSides = useRef<[0 | 1, 0 | 1]>(restingSide === 0 ? [0, 1] : [1, 0]);
  const toss = useRef<{ plan: CoinToss; started: number; swapAt: number; swapped: [0 | 1, 0 | 1] } | null>(null);
  const sidesRef = useRef(sides);
  sidesRef.current = sides;
  const { later } = useTimers();

  const start = useAnimationLoop((now) => {
    const active = toss.current;
    if (active) {
      const elapsed = (now - active.started) / 1000;
      frame.current = frameAt(active.plan, elapsed);
      if (elapsed >= active.swapAt) faceSides.current = active.swapped;
      if (elapsed >= active.plan.duration) {
        toss.current = null;
        canvasRef.current?.setAttribute("data-face", String(faceSides.current[active.plan.topFace]));
      }
    }
    draw();
    return Boolean(toss.current);
  });

  useCanvasSize(canvasRef, (next) => {
    size.current = next;
    draw();
  });

  useImperativeHandle(
    ref,
    () => ({
      toss(side) {
        const current = frame.current;
        const startFace: 0 | 1 = Math.cos(current.angle) >= 0 ? 0 : 1;
        const plan = simulateToss(startFace);
        let swapped = faceSides.current;
        let swapAt = 0;
        if (faceSides.current[plan.topFace] !== side) {
          swapped = [faceSides.current[1], faceSides.current[0]];
          // Swap the labels at a moment the coin is edge-on to the camera, so it can't be seen.
          swapAt = edgeOnMoment(plan);
        }
        toss.current = { plan, started: performance.now(), swapAt, swapped };
        plan.impacts.forEach((impact, index) => {
          if (index > 0 && impact.time - plan.impacts[index - 1].time < 0.03) return;
          later(() => {
            playTone(2300 + Math.random() * 500, 0.09, 0.03 + impact.strength * 0.06, "triangle");
            playTone(1150 + Math.random() * 200, 0.06, 0.02 + impact.strength * 0.03, "sine");
          }, impact.time * 1000);
        });
        canvasRef.current?.setAttribute("data-face", "");
        start();
        return plan.duration * 1000;
      },
    }),
    [later, start]
  );

  function layout() {
    const { width, height } = size.current;
    const floor = height * 0.76;
    // Small enough that the highest toss (about 3.2 coin widths up) still fits in the canvas.
    const pixelsPerUnit = Math.min(width * 0.21, height * 0.22, (floor - 8) / (3.2 * cosE + 1.05)) / coinRadius;
    return { cx: width / 2, floor, s: pixelsPerUnit };
  }

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height, dpr } = size.current;
    const { cx, floor, s } = layout();
    const { x, y, z, angle } = frame.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const project = (px: number, py: number, pz: number) => ({ x: cx + px * s, y: floor + (-py * cosE + pz * sinE) * s });

    // Soft shadow on the table, smaller and fainter the higher the coin goes.
    const shadow = project(x, 0, z);
    const lift = Math.max(0, y - coinThickness / 2);
    const spread = 1 + lift * 0.09;
    const shadowGradient = ctx.createRadialGradient(shadow.x, shadow.y, 0, shadow.x, shadow.y, coinRadius * s * spread * 1.15);
    shadowGradient.addColorStop(0, `rgba(0, 0, 0, ${0.42 / (1 + lift * 0.55)})`);
    shadowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.save();
    ctx.translate(shadow.x, shadow.y);
    ctx.scale(1, sinE * (0.35 + 0.65 * Math.abs(Math.cos(angle))));
    ctx.translate(-shadow.x, -shadow.y);
    ctx.fillStyle = shadowGradient;
    ctx.beginPath();
    ctx.arc(shadow.x, shadow.y, coinRadius * s * spread * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Seen from the camera, the face's vertical axis shrinks by sin(angle + elevation).
    const facing = Math.sin(angle + elevation);
    const frontVisible = facing >= 0;
    const normalShift = -Math.cos(angle + elevation) * s; // screen offset per unit along the face normal
    const centre = project(x, y, z);
    const half = coinThickness / 2;
    const metal = "#c9a227";

    const transformFor = (offset: number, mirror: boolean) => {
      const vertical = facing * s * coinRadius * (mirror ? -1 : 1);
      ctx.setTransform((dpr * s * coinRadius) / unit, 0, 0, (dpr * vertical) / unit, dpr * centre.x, dpr * (centre.y + offset * normalShift));
    };

    // Solid edge: stacked slices from the hidden face to the visible one.
    const layers = 9;
    for (let i = 0; i <= layers; i++) {
      const t = i / layers;
      const offset = frontVisible ? -half + t * coinThickness : half - t * coinThickness;
      transformFor(offset, !frontVisible);
      const edge = ctx.createLinearGradient(-unit, 0, unit, 0);
      edge.addColorStop(0, darken(metal, 0.45));
      edge.addColorStop(0.35, lighten(metal, 0.25));
      edge.addColorStop(1, darken(metal, 0.55));
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.arc(0, 0, unit, 0, Math.PI * 2);
      ctx.fill();
    }

    // The visible face, lit by a light above and to the left.
    const physicalFace: 0 | 1 = frontVisible ? 0 : 1;
    const side = sidesRef.current[faceSides.current[physicalFace]];
    const normalY = frontVisible ? Math.cos(angle) : -Math.cos(angle);
    const normalZ = frontVisible ? Math.sin(angle) : -Math.sin(angle);
    const light = Math.max(0, normalY * 0.82 + normalZ * 0.45 - 0.0) * 0.6 + 0.45;
    transformFor(frontVisible ? half : -half, !frontVisible);
    drawFace(ctx, side, light, normalZ);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return (
    <canvas
      ref={canvasRef}
      className="physics-coin"
      role="img"
      aria-label={`Coin showing ${sides[faceSides.current[Math.cos(frame.current.angle) >= 0 ? 0 : 1]].label}`}
      data-face={String(faceSides.current[Math.cos(frame.current.angle) >= 0 ? 0 : 1])}
    />
  );
}

/** Draws a coin face on a circle of radius `unit`. */
function drawFace(ctx: CanvasRenderingContext2D, side: CoinSide, light: number, tilt: number) {
  const colour = `#${side.colorHex}`;
  const base = ctx.createRadialGradient(-0.3 * unit, -0.35 * unit, 0.05 * unit, 0, 0, unit);
  base.addColorStop(0, lighten(colour, 0.35));
  base.addColorStop(0.6, colour);
  base.addColorStop(1, darken(colour, 0.25));
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(0, 0, unit, 0, Math.PI * 2);
  ctx.fill();

  // Raised rim and inner ring.
  ctx.lineWidth = 0.07 * unit;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.arc(0, 0, 0.9 * unit, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.02 * unit;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.beginPath();
  ctx.arc(0, 0, 0.82 * unit, 0, Math.PI * 2);
  ctx.stroke();

  // Label, sized so longer words still fit.
  const longest = Math.max(1, ...side.label.trim().split(/\s+/).map((word) => word.length));
  const fit = Math.max(0.3, Math.min(1, 5.5 / longest, 16 / Math.max(side.label.length, 1)));
  ctx.font = `900 ${0.46 * fit * unit}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  wrapText(ctx, side.label, 0.012 * unit, 0.03 * unit, 1.35 * unit, 0.46 * fit * unit);
  ctx.fillStyle = "#ffffff";
  wrapText(ctx, side.label, 0, 0, 1.35 * unit, 0.46 * fit * unit);

  // Shading and a highlight that slides across as the coin tilts.
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, 0.42 - light * 0.42)})`;
  ctx.beginPath();
  ctx.arc(0, 0, unit, 0, Math.PI * 2);
  ctx.fill();
  const glintY = (-0.45 + tilt * 0.6) * unit;
  const glint = ctx.createRadialGradient(-0.3 * unit, glintY, 0, -0.3 * unit, glintY, 0.75 * unit);
  glint.addColorStop(0, `rgba(255, 255, 255, ${0.35 * light})`);
  glint.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.arc(0, 0, unit, 0, Math.PI * 2);
  ctx.fill();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, dx: number, dy: number, maxWidth: number, lineHeight: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(attempt).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) lines.push(line);
  const top = -((lines.length - 1) * lineHeight * 0.95) / 2;
  lines.forEach((value, index) => ctx.fillText(value, dx, dy + top + index * lineHeight * 0.95, maxWidth));
}

/** A time during the toss when the coin is edge-on to the camera (neither face visible). */
function edgeOnMoment(plan: CoinToss): number {
  for (let i = 1; i < plan.frames.length; i++) {
    const t = i * plan.frameTime;
    if (t < 0.12) continue;
    const before = Math.sin(plan.frames[i - 1].angle + elevation);
    const after = Math.sin(plan.frames[i].angle + elevation);
    if (Math.sign(before) !== Math.sign(after)) return t;
  }
  return 0;
}
