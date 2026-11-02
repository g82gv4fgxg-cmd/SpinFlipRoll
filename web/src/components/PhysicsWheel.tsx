import { useEffect, useImperativeHandle, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, Ref } from "react";
import { darken, fitCanvas, lighten, useAnimationLoop, useCanvasSize } from "../canvas";
import type { CanvasSize } from "../canvas";
import { angleAt, createFlapper, minFlingSpeed, planCoast, planFling, planSpin, stepFlapper, velocityAt, wrapAngle } from "../physics/wheelMotion";
import type { WheelMotion } from "../physics/wheelMotion";
import { playTone } from "../sound";
import type { WheelEntry } from "../types";
import type { Segment } from "../wheelMath";

export type PhysicsWheelHandle = {
  /** Spins to land inside `segment`; continues from `velocity` if the wheel was flung. Returns milliseconds. */
  spinTo: (segment: Segment, options: { durationMs: number; velocity?: number }) => number;
  /** Lets the wheel coast to a stop without picking anything. */
  coast: (velocity: number) => void;
};

type PhysicsWheelProps = {
  entries: WheelEntry[];
  segments: Segment[];
  winnerIndex: number | null;
  /** True while a spin or dialog is in progress: no grabbing. */
  locked: boolean;
  onFling: (velocity: number) => void;
  ref?: Ref<PhysicsWheelHandle>;
};

const maxLabelLength = 15;
const degrees = Math.PI / 180;

export default function PhysicsWheel({ entries, segments, winnerIndex, locked, onFling, ref }: PhysicsWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  const face = useRef<HTMLCanvasElement | null>(null);
  // Start with the pointer resting in the middle of the first slice, as a real wheel would.
  const angle = useRef(segments[0] ? -(segments[0].mid + 90) * degrees : 0);
  const velocity = useRef(0);
  const motion = useRef<{ plan: WheelMotion; started: number; result: boolean } | null>(null);
  const drag = useRef<{ id: number; pointer: number; samples: { t: number; angle: number }[] } | null>(null);
  const flapper = useRef(createFlapper());
  const lastFrame = useRef(0);
  const lastTick = useRef(0);
  const pulseUntil = useRef(0);
  const props = useRef({ entries, segments, winnerIndex, locked, onFling });
  props.current = { entries, segments, winnerIndex, locked, onFling };

  const start = useAnimationLoop((now) => {
    const dt = lastFrame.current ? Math.min(0.05, (now - lastFrame.current) / 1000) : 1 / 60;
    lastFrame.current = now;
    const previous = angle.current;

    const active = motion.current;
    if (active) {
      const elapsed = (now - active.started) / 1000;
      angle.current = angleAt(active.plan, elapsed);
      velocity.current = velocityAt(active.plan, elapsed);
      if (elapsed >= active.plan.duration) {
        motion.current = null;
        velocity.current = 0;
        canvasRef.current?.setAttribute("data-rotation", String((angle.current / degrees).toFixed(3)));
        canvasRef.current?.setAttribute("data-state", "idle");
      }
    } else if (!drag.current) {
      velocity.current = 0;
    }

    advanceFlapper(previous, angle.current, dt, now);
    draw(dt);

    const settling = Math.abs(flapper.current.angle) > 0.0005 || Math.abs(flapper.current.velocity) > 0.01;
    const animating = Boolean(motion.current || drag.current || settling || winnerPulse());
    if (!animating) lastFrame.current = 0;
    return animating;
  });

  /** Steps the pointer flapper in small slices so fast spins don't skip pegs. */
  function advanceFlapper(from: number, to: number, dt: number, now: number) {
    const pegs = props.current.segments.map((segment) => segment.start * degrees);
    const slice = pegs.length > 1 ? (2 * Math.PI) / pegs.length : Math.PI;
    const slices = Math.max(1, Math.ceil(Math.abs(to - from) / (slice * 0.2)), Math.ceil(dt / (1 / 240)));
    for (let i = 1; i <= slices; i++) {
      const wheelAngle = from + ((to - from) * i) / slices;
      if (stepFlapper(flapper.current, wheelAngle, velocity.current, pegs, slice, dt / slices) && now - lastTick.current > 22) {
        lastTick.current = now;
        const speed = Math.min(1, Math.abs(velocity.current) / 30);
        playTone(320 + speed * 380, 0.03, 0.035 + speed * 0.03, "square");
      }
    }
  }

  /** The winning slice glows and pulses for a few seconds, then holds still (no endless animation). */
  function winnerPulse() {
    return props.current.winnerIndex !== null && !motion.current && performance.now() < pulseUntil.current;
  }

  function geometry() {
    const { width, height } = size.current;
    const side = Math.min(width, height);
    const radius = side * 0.43;
    return { cx: width / 2, cy: height / 2 + side * 0.035, radius };
  }

  /** Renders the coloured face (slices and labels) once; it's then rotated each frame. */
  function renderFace() {
    const { radius } = geometry();
    const { dpr } = size.current;
    const canvas = face.current ?? document.createElement("canvas");
    face.current = canvas;
    const pixels = Math.max(2, Math.ceil(radius * 2 * dpr));
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, radius * dpr, radius * dpr);
    const { entries: list, segments: segs } = props.current;
    const fontSize = list.length > 24 ? 9 : list.length > 18 ? 10.5 : list.length > 12 ? 12 : 13.5;
    const scaleFont = radius / 180;

    segs.forEach((segment, index) => {
      const entry = list[index];
      const sweep = segment.end - segment.start;
      if (!entry || sweep <= 0) return;
      const colour = `#${entry.colorHex}`;
      const gradient = ctx.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius);
      gradient.addColorStop(0, lighten(colour, 0.28));
      gradient.addColorStop(0.55, colour);
      gradient.addColorStop(1, darken(colour, 0.18));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      if (sweep >= 359.999) {
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
      } else {
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, segment.start * degrees, segment.end * degrees);
        ctx.closePath();
      }
      ctx.fill();

      if (sweep < 359.999) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(segment.start * degrees) * radius, Math.sin(segment.start * degrees) * radius);
        ctx.stroke();
      }

      const label = entry.label.length > maxLabelLength ? `${entry.label.slice(0, maxLabelLength - 1).trimEnd()}…` : entry.label;
      ctx.save();
      ctx.rotate(segment.mid * degrees);
      ctx.font = `800 ${fontSize * scaleFont}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 3 * scaleFont;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, radius * 0.9, 0);
      ctx.restore();
    });

    // A soft groove around the hub.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
    ctx.lineWidth = radius * 0.02;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.215, 0, Math.PI * 2);
    ctx.stroke();
  }

  function draw(dt: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !face.current) return;
    const { width, height, dpr } = size.current;
    const { cx, cy, radius } = geometry();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Drop shadow and metal rim.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = radius * 0.22;
    ctx.shadowOffsetY = radius * 0.07;
    const rim = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    rim.addColorStop(0, "#f6f1e7");
    rim.addColorStop(0.45, "#b9b2a6");
    rim.addColorStop(1, "#5d5953");
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The face, with motion blur when it's moving fast.
    const speed = Math.abs(velocity.current);
    const samples = speed > 2.5 ? Math.min(10, Math.ceil((speed * 0.024) / 0.025)) : 1;
    const spread = velocity.current * Math.min(0.024, dt);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < samples; i++) {
      // Drawing copies with alpha 1, 1/2, 1/3 ... averages them evenly.
      ctx.globalAlpha = 1 / (i + 1);
      const sampleAngle = angle.current - (samples > 1 ? spread * (1 - i / (samples - 1)) : 0);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sampleAngle);
      ctx.drawImage(face.current, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    const { winnerIndex: winner, segments: segs, entries: list } = props.current;
    if (winner !== null && !motion.current && segs[winner] && list.length > 1) {
      const now = performance.now();
      const pulse = now < pulseUntil.current ? 0.55 + 0.45 * Math.sin(now / 260) : 0.8;
      const segment = segs[winner];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle.current);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, segment.start * degrees, segment.end * degrees);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + pulse * 0.1})`;
      ctx.fill();
      ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
      ctx.shadowBlur = 16 * pulse;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Fixed lighting over the spinning face: a glossy highlight and darker edges.
    const shine = ctx.createRadialGradient(cx - radius * 0.38, cy - radius * 0.48, radius * 0.05, cx - radius * 0.2, cy - radius * 0.25, radius * 1.15);
    shine.addColorStop(0, "rgba(255, 255, 255, 0.24)");
    shine.addColorStop(0.45, "rgba(255, 255, 255, 0.04)");
    shine.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = shine;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    const edge = ctx.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius);
    edge.addColorStop(0, "rgba(0, 0, 0, 0)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0.28)");
    ctx.fillStyle = edge;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    // Pegs between slices, lit from the top left.
    if (segs.length > 1) {
      const pegRadius = Math.max(2.2, radius * 0.024);
      segs.forEach((segment) => {
        const a = segment.start * degrees + angle.current;
        const x = cx + Math.cos(a) * radius * 0.965;
        const y = cy + Math.sin(a) * radius * 0.965;
        const peg = ctx.createRadialGradient(x - pegRadius * 0.4, y - pegRadius * 0.4, pegRadius * 0.1, x, y, pegRadius);
        peg.addColorStop(0, "#ffffff");
        peg.addColorStop(1, "#8f8a82");
        ctx.fillStyle = peg;
        ctx.beginPath();
        ctx.arc(x, y, pegRadius, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Hub.
    const hub = radius * 0.17;
    const hubGradient = ctx.createRadialGradient(cx - hub * 0.4, cy - hub * 0.5, hub * 0.1, cx, cy, hub);
    hubGradient.addColorStop(0, "#ffffff");
    hubGradient.addColorStop(0.6, "#efe7da");
    hubGradient.addColorStop(1, "#a59d90");
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = hub * 0.5;
    ctx.shadowOffsetY = hub * 0.12;
    ctx.fillStyle = hubGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, hub, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The flapper, swinging on its pivot above the rim.
    const pivotY = cy - radius * 1.13;
    const length = radius * 0.22;
    const flapWidth = radius * 0.085;
    ctx.save();
    ctx.translate(cx, pivotY);
    ctx.rotate(-flapper.current.angle);
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    const body = ctx.createLinearGradient(-flapWidth, 0, flapWidth, 0);
    body.addColorStop(0, "#ff8a7a");
    body.addColorStop(0.5, "#e2493c");
    body.addColorStop(1, "#a82a20");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-flapWidth, 0);
    ctx.quadraticCurveTo(-flapWidth, length * 0.55, 0, length);
    ctx.quadraticCurveTo(flapWidth, length * 0.55, flapWidth, 0);
    ctx.arc(0, 0, flapWidth, 0, Math.PI, true);
    ctx.fill();
    ctx.shadowColor = "transparent";
    const cap = ctx.createRadialGradient(-flapWidth * 0.3, -flapWidth * 0.3, 1, 0, 0, flapWidth * 0.55);
    cap.addColorStop(0, "#ffffff");
    cap.addColorStop(1, "#9d978e");
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(0, 0, flapWidth * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  useCanvasSize(canvasRef, (next) => {
    size.current = next;
    renderFace();
    draw(0);
  });

  // Redraw the face whenever the options, colours or weights change.
  useEffect(() => {
    if (!canvasRef.current) return;
    size.current = fitCanvas(canvasRef.current);
    renderFace();
    draw(0);
    start();
  }, [entries, segments]);

  useEffect(() => {
    if (winnerIndex !== null) pulseUntil.current = performance.now() + 6000;
    start();
  }, [winnerIndex]);

  useImperativeHandle(
    ref,
    () => ({
      spinTo(segment, { durationMs, velocity: flung }) {
        const sweep = segment.end - segment.start;
        const margin = sweep * 0.15;
        const landing = segment.start + margin + Math.random() * (sweep - margin * 2);
        const target = (-90 - landing) * degrees;
        const seconds = durationMs / 1000;
        const plan =
          (flung !== undefined ? planFling(angle.current, target, flung, seconds) : null) ??
          planSpin(angle.current, target, seconds, 4 + Math.floor(Math.random() * 3));
        drag.current = null;
        motion.current = { plan, started: performance.now(), result: true };
        canvasRef.current?.setAttribute("data-state", "spinning");
        start();
        return plan.duration * 1000;
      },
      coast(flung) {
        motion.current = { plan: planCoast(angle.current, flung), started: performance.now(), result: false };
        start();
      },
    }),
    [start]
  );

  function pointerAngle(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const { cx, cy } = geometry();
    return Math.atan2(event.clientY - rect.top - cy, event.clientX - rect.left - cx);
  }

  return (
    <canvas
      ref={canvasRef}
      className={`physics-wheel${locked ? "" : " grabbable"}`}
      role="img"
      aria-label="Spinning decision wheel. Drag and flick it to spin."
      data-rotation="0"
      data-state="idle"
      onPointerDown={(event) => {
        if (props.current.locked || (motion.current && motion.current.result)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const { cx, cy, radius } = geometry();
        if (Math.hypot(event.clientX - rect.left - cx, event.clientY - rect.top - cy) > radius * 1.06) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Some pointers can't be captured; dragging still works while over the wheel.
        }
        motion.current = null;
        // Event timestamps (not processing time) keep the fling speed accurate even if a frame is slow.
        drag.current = { id: event.pointerId, pointer: pointerAngle(event), samples: [{ t: event.timeStamp, angle: angle.current }] };
        start();
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const next = pointerAngle(event);
        angle.current += wrapAngle(next - current.pointer);
        current.pointer = next;
        const now = event.timeStamp;
        current.samples.push({ t: now, angle: angle.current });
        // Keep a quarter of a second of movement (and always the last two samples) for the release speed.
        current.samples = current.samples.filter((sample, index) => now - sample.t < 250 || index >= current.samples.length - 2);
        velocity.current = releaseSpeed(current.samples, now);
        start();
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        drag.current = null;
        const release = releaseSpeed(current.samples, event.timeStamp);
        event.currentTarget.setAttribute("data-release", release.toFixed(2));
        if (Math.abs(release) >= minFlingSpeed) props.current.onFling(release);
        else if (Math.abs(release) > 0.3) {
          motion.current = { plan: planCoast(angle.current, release), started: performance.now(), result: false };
        }
        start();
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}

/**
 * How fast the wheel was turning when let go (rad/s), from the last tenth of a second of movement.
 * If the pointer stopped moving before release, the wheel was being held still, so it's zero.
 */
function releaseSpeed(samples: { t: number; angle: number }[], now: number): number {
  const last = samples[samples.length - 1];
  if (!last || samples.length < 2 || now - last.t > 90) return 0;
  const reference = samples.find((sample) => last.t - sample.t <= 100 && sample !== last) ?? samples[samples.length - 2];
  return last.t > reference.t ? ((last.angle - reference.angle) / (last.t - reference.t)) * 1000 : 0;
}
