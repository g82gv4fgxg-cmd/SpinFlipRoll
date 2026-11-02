/**
 * Canvas drawing for the pool table. Everything is drawn in table millimetres through a canvas
 * transform; on a tall (portrait) screen the table is turned upright so the balls are bigger.
 */
import type { AimGuide, Ball } from "./pool";
import { ballPole, ballRadius, cornerMouth, footSpot, headString, pockets, sideMouth, tableHeight, tableWidth } from "./pool";

export const rail = 150;
const cushion = 48;
const outerWidth = tableWidth + rail * 2;
const outerHeight = tableHeight + rail * 2;

export const ballColours: Record<number, string> = {
  0: "#f6f2e7",
  1: "#f2bd1d",
  2: "#1f4fc4",
  3: "#d42a2a",
  4: "#5b2d8e",
  5: "#f17a10",
  6: "#13804a",
  7: "#7a1f22",
  8: "#141414",
  9: "#f2bd1d",
  10: "#1f4fc4",
  11: "#d42a2a",
  12: "#5b2d8e",
  13: "#f17a10",
  14: "#13804a",
  15: "#7a1f22",
};

export type View = {
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  dpr: number;
  portrait: boolean;
  /** CSS pixels per millimetre. */
  scale: number;
};

/** Fits the table into a box, turning it upright if the box is taller than it is wide. */
export function fitView(boxWidth: number, boxHeight: number, dpr: number): View {
  const portrait = boxHeight > boxWidth * 1.05;
  const across = portrait ? outerHeight : outerWidth;
  const along = portrait ? outerWidth : outerHeight;
  const scale = Math.max(0.05, Math.min(boxWidth / across, boxHeight / along));
  return { width: Math.floor(across * scale), height: Math.floor(along * scale), dpr, portrait, scale };
}

/** Puts the canvas into table coordinates (millimetres). */
export function tableTransform(ctx: CanvasRenderingContext2D, view: View) {
  const s = view.scale * view.dpr;
  if (view.portrait) ctx.setTransform(0, -s, s, 0, rail * s, (outerWidth - rail) * s);
  else ctx.setTransform(s, 0, 0, s, rail * s, rail * s);
}

export function toScreen(view: View, x: number, y: number) {
  return view.portrait ? { x: (y + rail) * view.scale, y: (outerWidth - rail - x) * view.scale } : { x: (x + rail) * view.scale, y: (y + rail) * view.scale };
}

export function toTable(view: View, sx: number, sy: number) {
  return view.portrait ? { x: outerWidth - rail - sy / view.scale, y: sx / view.scale - rail } : { x: sx / view.scale - rail, y: sy / view.scale - rail };
}

/** A direction on the table as seen on screen. */
function screenDirection(view: View, x: number, y: number) {
  return view.portrait ? { x: y, y: -x } : { x, y };
}

/** Light from the top left of the screen, expressed in table directions. */
function lightFor(view: View) {
  const screen = { x: -0.45, y: -0.6 };
  const table = view.portrait ? { x: -screen.y, y: screen.x } : screen;
  const z = -0.66;
  const length = Math.hypot(table.x, table.y, z);
  return { x: table.x / length, y: table.y / length, z: z / length };
}

export function drawTable(ctx: CanvasRenderingContext2D, view: View) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  tableTransform(ctx, view);

  // Wooden frame.
  const wood = ctx.createLinearGradient(0, -rail, 0, tableHeight + rail);
  wood.addColorStop(0, "#6b3d1c");
  wood.addColorStop(0.5, "#4a2810");
  wood.addColorStop(1, "#5e3417");
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(-rail, -rail, outerWidth, outerHeight, 70);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 220, 170, 0.18)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(-rail + 14, -rail + 14, outerWidth - 28, outerHeight - 28, 58);
  ctx.stroke();

  // Cloth, reaching under the cushions.
  const cloth = ctx.createRadialGradient(tableWidth / 2, tableHeight / 2, 100, tableWidth / 2, tableHeight / 2, tableWidth * 0.62);
  cloth.addColorStop(0, "#23905f");
  cloth.addColorStop(1, "#135c3b");
  ctx.fillStyle = cloth;
  ctx.fillRect(-cushion, -cushion, tableWidth + cushion * 2, tableHeight + cushion * 2);

  // Cushions: darker strips between the pockets, with angled ends at the jaws.
  ctx.fillStyle = "#0f4a30";
  const strip = (points: [number, number][]) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  const c = cushion;
  const half = tableWidth / 2;
  strip([[cornerMouth - 20, -c], [half - sideMouth - 8, -c], [half - sideMouth + 4, 0], [cornerMouth, 0]]);
  strip([[half + sideMouth + 8, -c], [tableWidth - cornerMouth + 20, -c], [tableWidth - cornerMouth, 0], [half + sideMouth - 4, 0]]);
  strip([[cornerMouth - 20, tableHeight + c], [half - sideMouth - 8, tableHeight + c], [half - sideMouth + 4, tableHeight], [cornerMouth, tableHeight]]);
  strip([[half + sideMouth + 8, tableHeight + c], [tableWidth - cornerMouth + 20, tableHeight + c], [tableWidth - cornerMouth, tableHeight], [half + sideMouth - 4, tableHeight]]);
  strip([[-c, cornerMouth - 20], [-c, tableHeight - cornerMouth + 20], [0, tableHeight - cornerMouth], [0, cornerMouth]]);
  strip([[tableWidth + c, cornerMouth - 20], [tableWidth + c, tableHeight - cornerMouth + 20], [tableWidth, tableHeight - cornerMouth], [tableWidth, cornerMouth]]);
  // A soft highlight along each cushion nose.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, tableWidth, tableHeight);

  // Pockets.
  for (const pocket of pockets) {
    const radius = pocket.capture + 8;
    const hole = ctx.createRadialGradient(pocket.x, pocket.y, radius * 0.2, pocket.x, pocket.y, radius);
    hole.addColorStop(0, "#000000");
    hole.addColorStop(0.8, "#0b0b0b");
    hole.addColorStop(1, "#2a1a0c");
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Diamonds (sights) on the rails.
  ctx.fillStyle = "#efe2c4";
  const diamond = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.lineTo(x + 9, y);
    ctx.lineTo(x, y + 13);
    ctx.lineTo(x - 9, y);
    ctx.closePath();
    ctx.fill();
  };
  for (let k = 1; k < 8; k++) {
    if (k === 4) continue;
    diamond((tableWidth * k) / 8, -rail / 2 - 22);
    diamond((tableWidth * k) / 8, tableHeight + rail / 2 + 22);
  }
  for (let k = 1; k < 4; k++) {
    diamond(-rail / 2 - 22, (tableHeight * k) / 4);
    diamond(tableWidth + rail / 2 + 22, (tableHeight * k) / 4);
  }

  // Head string and foot spot.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(headString, 0);
  ctx.lineTo(headString, tableHeight);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.beginPath();
  ctx.arc(footSpot.x, footSpot.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(headString, tableHeight / 2, 7, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws each ball once per orientation into a small canvas, shaded pixel by pixel. */
export class BallSprites {
  private cache = new Map<number, { canvas: HTMLCanvasElement; key: string }>();

  sprite(ball: Ball, view: View): HTMLCanvasElement {
    const radiusPx = ballRadius * view.scale * view.dpr;
    const key = `${ball.q.map((value) => value.toFixed(3)).join(",")}|${radiusPx.toFixed(1)}|${view.portrait}`;
    const cached = this.cache.get(ball.id);
    if (cached && cached.key === key) return cached.canvas;
    const canvas = cached?.canvas ?? document.createElement("canvas");
    renderBall(canvas, ball, radiusPx, lightFor(view));
    this.cache.set(ball.id, { canvas, key });
    return canvas;
  }
}

function hexToRgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function renderBall(canvas: HTMLCanvasElement, ball: Ball, radiusPx: number, light: { x: number; y: number; z: number }) {
  const size = Math.max(4, Math.ceil(radiusPx * 2) + 2);
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const centre = size / 2;
  const [w, x, y, z] = ball.q;
  // Rotation matrix of the ball; its transpose turns table directions into the ball's own.
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
  const m10 = 2 * (x * y + w * z), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
  const m20 = 2 * (x * z - w * y), m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
  const base = hexToRgb(ballColours[ball.id]);
  const white = [246, 242, 231];
  const red = [196, 40, 40];
  const stripe = ball.id > 8;
  const hx = light.x, hy = light.y, hz = light.z - 1;
  const hLength = Math.hypot(hx, hy, hz);

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5 - centre) / radiusPx;
      const v = (j + 0.5 - centre) / radiusPx;
      const d2 = u * u + v * v;
      const edge = (1 - Math.sqrt(d2)) * radiusPx + 0.5;
      if (edge <= 0) continue;
      const nz = -Math.sqrt(Math.max(0, 1 - d2));
      const lx = m00 * u + m10 * v + m20 * nz;
      const ly = m01 * u + m11 * v + m21 * nz;
      const lz = m02 * u + m12 * v + m22 * nz;
      let colour = base;
      if (ball.id === 0) {
        colour = Math.abs(lx) > 0.965 || Math.abs(ly) > 0.965 || Math.abs(lz) > 0.965 ? red : white;
      } else if (Math.abs(lz) > 0.87) {
        colour = white; // number disc
      } else if (stripe && Math.abs(lx) > 0.5) {
        colour = white;
      }
      const diffuse = Math.max(0, u * light.x + v * light.y + nz * light.z);
      const spec = Math.pow(Math.max(0, (u * hx + v * hy + nz * hz) / hLength), 60) * 0.85;
      const shade = (0.3 + 0.78 * diffuse) * (0.86 - 0.14 * nz);
      const index = (j * size + i) * 4;
      data[index] = Math.min(255, colour[0] * shade + 255 * spec);
      data[index + 1] = Math.min(255, colour[1] * shade + 255 * spec);
      data[index + 2] = Math.min(255, colour[2] * shade + 255 * spec);
      data[index + 3] = Math.min(1, edge) * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export type DropAnimation = { id: number; x: number; y: number; pocketX: number; pocketY: number; start: number };

/** Balls, their shadows and numbers. */
export function drawBalls(ctx: CanvasRenderingContext2D, view: View, balls: Ball[], sprites: BallSprites, drops: DropAnimation[], now: number) {
  tableTransform(ctx, view);
  const light = lightFor(view);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  for (const ball of balls) {
    if (ball.pocketed) continue;
    ctx.beginPath();
    ctx.ellipse(ball.x - light.x * ballRadius * 0.45, ball.y - light.y * ballRadius * 0.45, ballRadius * 1.02, ballRadius * 1.02, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const ball of balls) {
    if (ball.pocketed) continue;
    ctx.drawImage(sprites.sprite(ball, view), ball.x - ballRadius, ball.y - ballRadius, ballRadius * 2, ballRadius * 2);
  }
  // Balls dropping into pockets shrink and fade.
  for (const drop of drops) {
    const t = Math.min(1, (now - drop.start) / 260);
    if (t >= 1) continue;
    const ball = balls.find((b) => b.id === drop.id);
    if (!ball) continue;
    const size = ballRadius * (1 - 0.45 * t);
    ctx.globalAlpha = 1 - t * 0.8;
    ctx.drawImage(sprites.sprite(ball, view), drop.x + (drop.pocketX - drop.x) * t - size, drop.y + (drop.pocketY - drop.y) * t - size, size * 2, size * 2);
    ctx.globalAlpha = 1;
  }

  // Numbers, drawn upright on screen and squashed as they turn away.
  const radiusPx = ballRadius * view.scale;
  if (radiusPx < 4.5) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#151515";
  for (const ball of balls) {
    if (ball.pocketed || ball.id === 0) continue;
    const pole = ballPole(ball);
    for (const sign of [1, -1]) {
      const pz = pole.z * sign;
      if (pz > -0.3) continue;
      const dir = screenDirection(view, pole.x * sign, pole.y * sign);
      const centre = toScreen(view, ball.x, ball.y);
      const sx = centre.x + dir.x * radiusPx;
      const sy = centre.y + dir.y * radiusPx;
      const angle = Math.atan2(dir.y, dir.x);
      const k = Math.abs(pz);
      const c = Math.cos(angle), s = Math.sin(angle);
      const a = c * c * k + s * s;
      const b = c * s * (k - 1);
      const d = s * s * k + c * c;
      const dpr = view.dpr;
      ctx.setTransform(a * dpr, b * dpr, b * dpr, d * dpr, sx * dpr, sy * dpr);
      ctx.font = `800 ${(radiusPx * (ball.id > 9 ? 0.58 : 0.7)).toFixed(1)}px Inter, system-ui, sans-serif`;
      ctx.fillText(String(ball.id), 0, radiusPx * 0.04);
    }
  }
}

export function drawGuides(ctx: CanvasRenderingContext2D, view: View, cue: Ball, guide: AimGuide, angle: number) {
  tableTransform(ctx, view);
  const px = 1 / view.scale; // one CSS pixel in millimetres
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 1.6 * px;
  ctx.setLineDash([10 * px, 7 * px]);
  ctx.beginPath();
  ctx.moveTo(cue.x + Math.cos(angle) * ballRadius, cue.y + Math.sin(angle) * ballRadius);
  ctx.lineTo(guide.contact.x, guide.contact.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Ghost ball where the cue ball will be at contact.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.4 * px;
  ctx.beginPath();
  ctx.arc(guide.contact.x, guide.contact.y, ballRadius, 0, Math.PI * 2);
  ctx.stroke();
  if (guide.target && guide.objectDirection) {
    const t = guide.target;
    ctx.strokeStyle = "rgba(255, 236, 140, 0.9)";
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x + guide.objectDirection.x * 700, t.y + guide.objectDirection.y * 700);
    ctx.stroke();
  }
  if (guide.cueDirection) {
    ctx.strokeStyle = "rgba(160, 220, 255, 0.75)";
    ctx.lineWidth = 1.4 * px;
    ctx.setLineDash([6 * px, 6 * px]);
    ctx.beginPath();
    ctx.moveTo(guide.contact.x, guide.contact.y);
    ctx.lineTo(guide.contact.x + guide.cueDirection.x * 380, guide.contact.y + guide.cueDirection.y * 380);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** The cue stick, pulled back `pull` millimetres from the cue ball. */
export function drawCue(ctx: CanvasRenderingContext2D, view: View, cue: Ball, angle: number, pull: number) {
  tableTransform(ctx, view);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const start = ballRadius + 8 + pull;
  const length = 1450;
  const at = (distance: number, width: number, side: number) => ({ x: cue.x - dx * distance + nx * width * side, y: cue.y - dy * distance + ny * width * side });
  const section = (from: number, to: number, w1: number, w2: number, fill: string | CanvasGradient) => {
    const a = at(from, w1 / 2, 1);
    const b = at(to, w2 / 2, 1);
    const c = at(to, w2 / 2, -1);
    const d = at(from, w1 / 2, -1);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  };
  // Shadow on the cloth.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.translate(18, 22);
  section(start, start + length, 13, 29, "#000000");
  ctx.restore();
  const widthAt = (distance: number) => 13 + (16 * (distance - start)) / length;
  section(start, start + 9, 13, widthAt(start + 9), "#4a7ac9"); // chalked tip
  section(start + 9, start + 32, widthAt(start + 9), widthAt(start + 32), "#f3efe6"); // ferrule
  const shaft = ctx.createLinearGradient(at(0, 10, 1).x, at(0, 10, 1).y, at(0, 10, -1).x, at(0, 10, -1).y);
  shaft.addColorStop(0, "#f0d9a8");
  shaft.addColorStop(0.5, "#e0bf83");
  shaft.addColorStop(1, "#c79e5e");
  section(start + 32, start + 900, widthAt(start + 32), widthAt(start + 900), shaft);
  section(start + 900, start + 930, widthAt(start + 900), widthAt(start + 930), "#d9d4c7");
  section(start + 930, start + length, widthAt(start + 930), widthAt(start + length), "#2c1608");
  section(start + 1250, start + 1270, widthAt(start + 1250), widthAt(start + 1270), "#b88b2a");
}

/** Highlights where the cue ball may be placed (behind the line on a break). */
export function drawPlacement(ctx: CanvasRenderingContext2D, view: View, cue: Ball, breakShot: boolean, valid: boolean) {
  tableTransform(ctx, view);
  if (breakShot) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(0, 0, headString, tableHeight);
  }
  const px = 1 / view.scale;
  ctx.strokeStyle = valid ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 120, 120, 0.9)";
  ctx.lineWidth = 2 * px;
  ctx.setLineDash([5 * px, 4 * px]);
  ctx.beginPath();
  ctx.arc(cue.x, cue.y, ballRadius * 1.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}
