import { useEffect, useRef } from "react";
import { fitCanvas } from "../canvas";

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  flutter: number;
  flutterSpeed: number;
  width: number;
  height: number;
  colour: string;
};

const colours = ["#E9584D", "#F4C531", "#45C27A", "#4C8FE6", "#A274EA", "#F28B3B", "#FFFFFF"];

/** Paper confetti fired from both bottom corners, with gravity, air drag and flutter. */
export default function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let { width, height, dpr } = fitCanvas(canvas);
    const pieces: Piece[] = [];
    const fire = (fromLeft: boolean, count: number) => {
      for (let i = 0; i < count; i++) {
        // Fired up and inwards, tilted away from straight up.
        const tilt = 0.2 + Math.random() * 0.55;
        const speed = height * (1.7 + Math.random() * 0.9);
        pieces.push({
          x: fromLeft ? width * 0.02 : width * 0.98,
          y: height * 1.02,
          vx: (fromLeft ? 1 : -1) * Math.sin(tilt) * speed,
          vy: -Math.cos(tilt) * speed,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 14,
          flutter: Math.random() * Math.PI * 2,
          flutterSpeed: 6 + Math.random() * 8,
          width: 7 + Math.random() * 6,
          height: 10 + Math.random() * 8,
          colour: colours[Math.floor(Math.random() * colours.length)],
        });
      }
    };
    fire(true, 90);
    fire(false, 90);

    let last = performance.now();
    let frame = 0;
    const started = last;
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const fade = Math.max(0, Math.min(1, (5.5 - (now - started) / 1000) / 1.2));
      let alive = 0;
      for (const piece of pieces) {
        // Gravity, plus drag that grows with speed, so pieces drift down like paper.
        const speed = Math.hypot(piece.vx, piece.vy);
        const drag = 0.55 + speed * 0.0005;
        piece.vy += height * 0.9 * dt;
        piece.vx -= piece.vx * drag * dt;
        piece.vy -= piece.vy * drag * dt;
        piece.flutter += piece.flutterSpeed * dt;
        piece.x += (piece.vx + Math.sin(piece.flutter) * 26) * dt;
        piece.y += piece.vy * dt;
        piece.angle += piece.spin * dt;
        if (piece.y > height + 40) continue;
        alive += 1;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.angle);
        // Squashing one axis makes each piece look like it's turning over in the air.
        ctx.scale(Math.cos(piece.flutter), 1);
        ctx.fillStyle = piece.colour;
        ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        ctx.restore();
      }
      if (alive > 0 && fade > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onResize = () => ({ width, height, dpr } = fitCanvas(canvas));
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}
