/**
 * Pool physics and 8-ball rules.
 *
 * Units are millimetres and seconds on a 9-foot table. Axes: x right, y down (as drawn), z into the
 * table. Each ball has velocity and spin. While the contact point slides over the cloth, sliding
 * friction changes both until the ball rolls; then a much smaller rolling resistance slows it. That
 * is what makes top spin follow and back spin draw after the cue ball hits another ball.
 */
import { shuffle } from "../random";

export const tableWidth = 2540;
export const tableHeight = 1270;
export const ballRadius = 28.6;
const gravity = 9810;
const slideFriction = 0.2;
const rollFriction = 0.015;
/** How quickly a rolling ball slows, in mm/s². */
export const rollDecel = rollFriction * gravity;
const ballRestitution = 0.95;
const cushionRestitution = 0.75;
export const cornerMouth = ballRadius * 2.3;
export const sideMouth = ballRadius * 1.9;
export const maxShotSpeed = 7800;

export type Ball = {
  id: number; // 0 is the cue ball, 8 the black
  x: number;
  y: number;
  vx: number;
  vy: number;
  wx: number;
  wy: number;
  wz: number;
  pocketed: boolean;
  /** Orientation for drawing the number and stripe as the ball rolls. */
  q: [number, number, number, number];
};

export type Pocket = { x: number; y: number; capture: number };

export const pockets: Pocket[] = [
  { x: -ballRadius * 0.25, y: -ballRadius * 0.25, capture: ballRadius * 2 },
  { x: tableWidth / 2, y: -ballRadius * 0.95, capture: ballRadius * 1.9 },
  { x: tableWidth + ballRadius * 0.25, y: -ballRadius * 0.25, capture: ballRadius * 2 },
  { x: -ballRadius * 0.25, y: tableHeight + ballRadius * 0.25, capture: ballRadius * 2 },
  { x: tableWidth / 2, y: tableHeight + ballRadius * 0.95, capture: ballRadius * 1.9 },
  { x: tableWidth + ballRadius * 0.25, y: tableHeight + ballRadius * 0.25, capture: ballRadius * 2 },
];

/** The cushion noses at each pocket mouth; balls can rattle off them. */
const jaws: { x: number; y: number }[] = [
  { x: cornerMouth, y: 0 },
  { x: 0, y: cornerMouth },
  { x: tableWidth - cornerMouth, y: 0 },
  { x: tableWidth, y: cornerMouth },
  { x: cornerMouth, y: tableHeight },
  { x: 0, y: tableHeight - cornerMouth },
  { x: tableWidth - cornerMouth, y: tableHeight },
  { x: tableWidth, y: tableHeight - cornerMouth },
  { x: tableWidth / 2 - sideMouth, y: 0 },
  { x: tableWidth / 2 + sideMouth, y: 0 },
  { x: tableWidth / 2 - sideMouth, y: tableHeight },
  { x: tableWidth / 2 + sideMouth, y: tableHeight },
];

export const headString = tableWidth / 4;
export const footSpot = { x: (tableWidth * 3) / 4, y: tableHeight / 2 };

export type ShotEvents = {
  firstHit: number | null;
  pocketed: number[];
  cushionHits: number;
  ballHits: { time: number; speed: number }[];
  railHits: { time: number; speed: number }[];
  drops: { time: number; id: number }[];
};

export const newEvents = (): ShotEvents => ({ firstHit: null, pocketed: [], cushionHits: 0, ballHits: [], railHits: [], drops: [] });

function makeBall(id: number, x: number, y: number): Ball {
  const tilt = Math.random() * Math.PI * 2;
  return { id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, pocketed: false, q: [Math.cos(tilt / 2), Math.sin(tilt / 2), 0, 0] };
}

/** A fresh rack: black in the middle, a solid and a stripe in the back corners, the rest shuffled. */
export function rack(): Ball[] {
  const rest = shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  const solid = rest.findIndex((id) => id < 8);
  const cornerSolid = rest.splice(solid, 1)[0];
  const stripe = rest.findIndex((id) => id > 8);
  const cornerStripe = rest.splice(stripe, 1)[0];
  const order: number[] = [];
  let next = 0;
  // Real racks are never perfectly tight; tiny random gaps make every break different.
  const gap = 0.4;
  const jitter = () => (Math.random() - 0.5) * 0.3;
  const balls: Ball[] = [makeBall(0, headString, tableHeight / 2)];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      let id: number;
      if (row === 2 && col === 1) id = 8;
      else if (row === 4 && col === 0) id = Math.random() < 0.5 ? cornerSolid : cornerStripe;
      else if (row === 4 && col === 4) id = order.includes(cornerSolid) ? cornerStripe : cornerSolid;
      else id = rest[next++];
      order.push(id);
      const x = footSpot.x + row * (ballRadius * 2 + gap) * Math.cos(Math.PI / 6);
      const y = footSpot.y + (col - row / 2) * (ballRadius * 2 + gap);
      balls.push(makeBall(id, x + jitter(), y + jitter()));
    }
  }
  return balls;
}

/** Hits the cue ball. `angle` in radians, `power` 0 to 1, english x (right +) and y (top +) from -0.6 to 0.6. */
export function strike(balls: Ball[], angle: number, power: number, english: { x: number; y: number }) {
  const cue = balls[0];
  const speed = 250 + Math.max(0, Math.min(1, power)) * (maxShotSpeed - 250);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  cue.vx = speed * dx;
  cue.vy = speed * dy;
  // A hit above or below centre spins the ball forwards or backwards; to either side, sideways.
  const vertical = (2.5 * speed * english.y) / ballRadius;
  cue.wx = vertical * dy;
  cue.wy = -vertical * dx;
  cue.wz = (-2.5 * speed * english.x) / ballRadius;
}

export const isMoving = (balls: Ball[]) => balls.some((b) => !b.pocketed && (b.vx !== 0 || b.vy !== 0));

/** Advances every ball by dt seconds, recording what happened in `events`. */
export function step(balls: Ball[], dt: number, events: ShotEvents, time = 0) {
  // Split the step so no ball moves more than about 2mm at a time: fast balls then meet one at a
  // time, which keeps chains of collisions (like the break) behaving.
  let fastest = 0;
  for (const ball of balls) if (!ball.pocketed) fastest = Math.max(fastest, Math.hypot(ball.vx, ball.vy));
  const parts = Math.min(60, Math.max(1, Math.ceil((fastest * dt) / 2)));
  const h = dt / parts;
  for (let part = 0; part < parts; part++) subStep(balls, h, events, time + part * h);
}

function subStep(balls: Ball[], dt: number, events: ShotEvents, time: number) {
  for (const ball of balls) {
    if (ball.pocketed || (ball.vx === 0 && ball.vy === 0 && ball.wz === 0 && ball.wx === 0 && ball.wy === 0)) continue;
    applyFriction(ball, dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    rollOrientation(ball, dt);
  }

  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    const aStill = a.vx === 0 && a.vy === 0;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed || (aStill && b.vx === 0 && b.vy === 0)) continue;
      if (Math.abs(b.x - a.x) >= ballRadius * 2 || Math.abs(b.y - a.y) >= ballRadius * 2) continue;
      collideBalls(a, b, events, time);
    }
  }

  for (const ball of balls) {
    if (ball.pocketed || (ball.vx === 0 && ball.vy === 0)) continue;
    collideCushions(ball, events, time);
    for (const pocket of pockets) {
      if (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) < pocket.capture) {
        drop(ball, events, time);
        break;
      }
    }
    // Anything that escapes through a mouth without being caught falls in anyway.
    if (!ball.pocketed && (ball.x < -ballRadius * 2 || ball.x > tableWidth + ballRadius * 2 || ball.y < -ballRadius * 2 || ball.y > tableHeight + ballRadius * 2)) {
      drop(ball, events, time);
    }
  }
}

function drop(ball: Ball, events: ShotEvents, time: number) {
  ball.pocketed = true;
  ball.vx = ball.vy = ball.wx = ball.wy = ball.wz = 0;
  events.pocketed.push(ball.id);
  events.drops.push({ time, id: ball.id });
}

function applyFriction(ball: Ball, dt: number) {
  // Velocity of the cloth contact point (the bottom of the ball).
  const slipX = ball.vx + ballRadius * ball.wy;
  const slipY = ball.vy - ballRadius * ball.wx;
  const slip = Math.hypot(slipX, slipY);
  const slideStep = slideFriction * gravity * dt;

  if (slip > 3.5 * slideStep) {
    // Sliding: friction opposes the slip, slowing the ball and turning its spin towards rolling.
    const ux = slipX / slip;
    const uy = slipY / slip;
    ball.vx -= slideStep * ux;
    ball.vy -= slideStep * uy;
    ball.wx += ((2.5 * slideStep) / ballRadius) * uy;
    ball.wy -= ((2.5 * slideStep) / ballRadius) * ux;
  } else {
    // Rolling: the slip is used up, so match spin to speed and apply rolling resistance.
    ball.vx -= (2 / 7) * slipX;
    ball.vy -= (2 / 7) * slipY;
    const speed = Math.hypot(ball.vx, ball.vy);
    const rollStep = rollFriction * gravity * dt;
    if (speed <= rollStep) {
      ball.vx = 0;
      ball.vy = 0;
    } else {
      ball.vx -= (rollStep * ball.vx) / speed;
      ball.vy -= (rollStep * ball.vy) / speed;
    }
    ball.wy = -ball.vx / ballRadius;
    ball.wx = ball.vy / ballRadius;
  }
  // Side spin dies away from friction at the contact spot.
  const spinDecay = (12 * dt * gravity * 0.02) / ballRadius;
  ball.wz = Math.abs(ball.wz) <= spinDecay ? 0 : ball.wz - Math.sign(ball.wz) * spinDecay;
}

function collideBalls(a: Ball, b: Ball, events: ShotEvents, time: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const minimum = ballRadius * 2;
  if (distance >= minimum || distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimum - distance;
  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return;
  // Equal masses: the balls swap the part of their velocity along the line of centres. Spin carries on.
  const impulse = ((1 + ballRestitution) / 2) * closing;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
  if (events.firstHit === null) {
    if (a.id === 0) events.firstHit = b.id;
    else if (b.id === 0) events.firstHit = a.id;
  }
  events.ballHits.push({ time, speed: closing });
}

function collideCushions(ball: Ball, events: ShotEvents, time: number) {
  const r = ballRadius;
  const inCornerMouthX = ball.x < cornerMouth || ball.x > tableWidth - cornerMouth;
  const inSideMouth = Math.abs(ball.x - tableWidth / 2) < sideMouth;
  const inCornerMouthY = ball.y < cornerMouth || ball.y > tableHeight - cornerMouth;
  if (!inCornerMouthX && !inSideMouth) {
    if (ball.y < r) bounce(ball, 0, 1, r - ball.y, events, time);
    else if (ball.y > tableHeight - r) bounce(ball, 0, -1, ball.y - (tableHeight - r), events, time);
  }
  if (!inCornerMouthY) {
    if (ball.x < r) bounce(ball, 1, 0, r - ball.x, events, time);
    else if (ball.x > tableWidth - r) bounce(ball, -1, 0, ball.x - (tableWidth - r), events, time);
  }
  for (const jaw of jaws) {
    const dx = ball.x - jaw.x;
    const dy = ball.y - jaw.y;
    const distance = Math.hypot(dx, dy);
    if (distance < r && distance > 0) bounce(ball, dx / distance, dy / distance, r - distance, events, time);
  }
}

/** A cushion bounce. (nx, ny) points back into the table. */
function bounce(ball: Ball, nx: number, ny: number, depth: number, events: ShotEvents, time: number) {
  ball.x += nx * depth;
  ball.y += ny * depth;
  const normal = ball.vx * nx + ball.vy * ny;
  if (normal >= 0) return;
  const tx = -ny;
  const ty = nx;
  let tangent = (ball.vx * tx + ball.vy * ty) * 0.97;
  // Side spin grips the cushion and pushes the ball along it (what makes english change the angle).
  const surface = ball.wz * ballRadius * (ny * tx - nx * ty);
  tangent -= 0.25 * surface;
  ball.wz *= 0.55;
  const out = -normal * cushionRestitution;
  ball.vx = out * nx + tangent * tx;
  ball.vy = out * ny + tangent * ty;
  // The cushion nose sits above the ball's centre, so it partly reverses the forward roll into the
  // cushion. Split the roll into "into the cushion" and "along it" and flip most of the first part.
  const rollX = -ballRadius * ball.wy;
  const rollY = ballRadius * ball.wx;
  const rollNormal = rollX * nx + rollY * ny;
  const rollTangent = rollX * tx + rollY * ty;
  const newNormal = -0.3 * rollNormal;
  const newX = newNormal * nx + rollTangent * tx;
  const newY = newNormal * ny + rollTangent * ty;
  ball.wx = newY / ballRadius;
  ball.wy = -newX / ballRadius;
  events.cushionHits += 1;
  events.railHits.push({ time, speed: -normal });
}

function rollOrientation(ball: Ball, dt: number) {
  const [w, x, y, z] = ball.q;
  const ox = ball.wx;
  const oy = ball.wy;
  const oz = ball.wz;
  const half = dt / 2;
  const nw = w - half * (ox * x + oy * y + oz * z);
  const nx = x + half * (ox * w + oy * z - oz * y);
  const ny = y + half * (oy * w + oz * x - ox * z);
  const nz = z + half * (oz * w + ox * y - oy * x);
  const length = Math.hypot(nw, nx, ny, nz) || 1;
  ball.q = [nw / length, nx / length, ny / length, nz / length];
}

/** Where a ball's number faces, in table coordinates (z < 0 means towards the viewer). */
export function ballPole(ball: Ball): { x: number; y: number; z: number } {
  const [w, x, y, z] = ball.q;
  // Rotate the local "up" axis (0, 0, -1).
  return {
    x: -(2 * (x * z + w * y)),
    y: -(2 * (y * z - w * x)),
    z: -(1 - 2 * (x * x + y * y)),
  };
}

export const cloneBalls = (balls: Ball[]): Ball[] => balls.map((ball) => ({ ...ball, q: [...ball.q] as Ball["q"] }));

/** Runs a shot to the end without drawing it (for the computer player and tests). */
export function simulate(balls: Ball[], dt = 1 / 400, maxSeconds = 25): ShotEvents {
  const events = newEvents();
  let time = 0;
  while (isMoving(balls) && time < maxSeconds) {
    step(balls, dt, events, time);
    time += dt;
  }
  balls.forEach((ball) => {
    ball.vx = ball.vy = ball.wx = ball.wy = ball.wz = 0;
  });
  return events;
}

// ---------- Aiming guide ----------

export type AimGuide = {
  /** Where the cue ball would be when it first touches something. */
  contact: { x: number; y: number };
  target: Ball | null;
  /** Direction the object ball heads off in, and the cue ball's tangent line (no spin). */
  objectDirection: { x: number; y: number } | null;
  cueDirection: { x: number; y: number } | null;
};

export function aimGuide(balls: Ball[], angle: number): AimGuide {
  const cue = balls[0];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Infinity;
  let target: Ball | null = null;
  for (const ball of balls) {
    if (ball.id === 0 || ball.pocketed) continue;
    // Ray from the cue ball centre against a circle of radius 2R around the other ball.
    const ox = ball.x - cue.x;
    const oy = ball.y - cue.y;
    const along = ox * dx + oy * dy;
    if (along <= 0) continue;
    const perpendicular = ox * ox + oy * oy - along * along;
    const reach = 4 * ballRadius * ballRadius;
    if (perpendicular > reach) continue;
    const distance = along - Math.sqrt(reach - perpendicular);
    if (distance < best) {
      best = distance;
      target = ball;
    }
  }
  // Distance to the cushions along the same line.
  const wall = Math.min(
    dx > 0 ? (tableWidth - ballRadius - cue.x) / dx : dx < 0 ? (ballRadius - cue.x) / dx : Infinity,
    dy > 0 ? (tableHeight - ballRadius - cue.y) / dy : dy < 0 ? (ballRadius - cue.y) / dy : Infinity
  );
  if (!target || wall < best) {
    return { contact: { x: cue.x + dx * wall, y: cue.y + dy * wall }, target: null, objectDirection: null, cueDirection: null };
  }
  const contact = { x: cue.x + dx * best, y: cue.y + dy * best };
  const nx = (target.x - contact.x) / (ballRadius * 2);
  const ny = (target.y - contact.y) / (ballRadius * 2);
  // The cue ball leaves at right angles to the object ball's path (the "90 degree rule").
  const side = dx * -ny + dy * nx >= 0 ? 1 : -1;
  const cueDirection = Math.abs(dx * nx + dy * ny) > 0.999 ? null : { x: -ny * side, y: nx * side };
  return { contact, target, objectDirection: { x: nx, y: ny }, cueDirection };
}

// ---------- 8-ball rules ----------

export type Group = "solids" | "stripes";

export const groupOf = (id: number): Group | "eight" | "cue" => (id === 0 ? "cue" : id === 8 ? "eight" : id < 8 ? "solids" : "stripes");

export type PoolState = {
  turn: 0 | 1;
  groups: [Group | null, Group | null];
  ballInHand: boolean;
  /** On the break the cue ball goes behind the head string. */
  breakShot: boolean;
  winner: 0 | 1 | null;
  message: string;
};

export const newPoolState = (starter: 0 | 1 = 0): PoolState => ({
  turn: starter,
  groups: [null, null],
  ballInHand: true,
  breakShot: true,
  winner: null,
  message: "Break! Place the cue ball behind the line, then shoot hard into the rack.",
});

export function remainingInGroup(balls: Ball[], group: Group) {
  return balls.filter((ball) => !ball.pocketed && groupOf(ball.id) === group).length;
}

/** Which balls the shooter is allowed to hit first. */
export function legalTargets(balls: Ball[], state: PoolState): number[] {
  const group = state.groups[state.turn];
  const onTable = balls.filter((ball) => !ball.pocketed && ball.id !== 0);
  if (state.breakShot) return onTable.map((ball) => ball.id);
  if (!group) return onTable.filter((ball) => ball.id !== 8).map((ball) => ball.id);
  if (remainingInGroup(balls, group) === 0) return [8];
  return onTable.filter((ball) => groupOf(ball.id) === group).map((ball) => ball.id);
}

/**
 * Applies the rules after the balls stop: fouls, claiming a group, winning or losing on the black,
 * and whose turn it is next. `before` is the table as it was when the shot was taken. If the black
 * went in on the break, the caller puts it back with `respotBlack`.
 */
export function judge(state: PoolState, before: Ball[], events: ShotEvents, names: [string, string]): PoolState {
  const shooter = state.turn;
  const other: 0 | 1 = shooter === 0 ? 1 : 0;
  const you = (index: 0 | 1) => names[index] === "You";
  const verb = (index: 0 | 1, plain: string, third: string) => `${names[index]} ${you(index) ? plain : third}`;
  const allowed = legalTargets(before, state);
  const pottedBalls = events.pocketed.filter((id) => id !== 0);
  const scratch = events.pocketed.includes(0);
  const blackPotted = pottedBalls.includes(8);
  const group = state.groups[shooter];
  const clearedBefore = group ? remainingInGroup(before, group) === 0 : false;

  let foul: string | null = null;
  if (scratch) foul = "the cue ball went in";
  else if (events.firstHit === null) foul = "the cue ball didn't hit anything";
  else if (!allowed.includes(events.firstHit)) foul = `the first ball hit was the ${ballName(events.firstHit)}, not ${describeTargets(allowed)}`;

  const next: PoolState = { ...state, groups: [...state.groups] as PoolState["groups"], breakShot: false, ballInHand: false };
  const ballInHand = `${names[other]} ${you(other) ? "get" : "gets"} ball in hand: place the cue ball anywhere.`;

  if (blackPotted && state.breakShot) {
    // Sinking the black on the break isn't a loss: it goes back on its spot.
    if (foul) {
      next.turn = other;
      next.ballInHand = true;
      next.message = `The black went in on the break and comes back to its spot. Foul: ${foul}. ${ballInHand}`;
    } else {
      next.turn = shooter;
      next.message = `The black went in on the break, so it comes back to its spot. ${verb(shooter, "shoot", "shoots")} again.`;
    }
    return next;
  }

  if (blackPotted) {
    if (clearedBefore && !foul) {
      next.winner = shooter;
      next.message = `${verb(shooter, "sank", "sank")} the black and ${you(shooter) ? "win" : "wins"}!`;
    } else {
      next.winner = other;
      next.message = foul
        ? `${verb(shooter, "sank", "sank")} the black but fouled (${foul}). ${verb(other, "win", "wins")}.`
        : `${verb(shooter, "sank", "sank")} the black before clearing ${you(shooter) ? "your" : "their"} group. ${verb(other, "win", "wins")}.`;
    }
    return next;
  }

  // Claim a group with the first legally pocketed ball on an open table.
  if (!foul && !group && !state.breakShot) {
    const first = pottedBalls.map(groupOf).find((g): g is Group => g === "solids" || g === "stripes");
    if (first) {
      next.groups[shooter] = first;
      next.groups[other] = first === "solids" ? "stripes" : "solids";
    }
  }
  const myGroup = next.groups[shooter];

  if (foul) {
    next.turn = other;
    next.ballInHand = true;
    next.message = `Foul: ${foul}. ${ballInHand}`;
    return next;
  }

  const list = pottedBalls.map((id) => `the ${ballName(id)}`).join(" and ");
  const sentence = list ? list[0].toUpperCase() + list.slice(1) : "";
  const pottedOwn = pottedBalls.filter((id) => (myGroup ? groupOf(id) === myGroup : true)).length;
  if (pottedOwn > 0) {
    next.turn = shooter;
    const claimed = !group && myGroup ? ` ${verb(shooter, "are", "is")} on ${myGroup}.` : "";
    next.message = `${sentence} went in.${claimed} ${verb(shooter, "shoot", "shoots")} again.`;
  } else {
    next.turn = other;
    next.message = pottedBalls.length
      ? `${sentence} went in, but not one of ${you(shooter) ? "yours" : "theirs"}. ${you(other) ? "Your" : `${names[other]}'s`} turn.`
      : `Nothing went in. ${you(other) ? "Your" : `${names[other]}'s`} turn.`;
  }
  return next;
}

export function ballName(id: number): string {
  if (id === 0) return "cue ball";
  if (id === 8) return "black (8)";
  return `${id} (${id < 8 ? "solid" : "stripe"})`;
}

function describeTargets(ids: number[]): string {
  if (ids.length === 1 && ids[0] === 8) return "the black";
  if (ids.every((id) => id < 8)) return "a solid";
  if (ids.every((id) => id > 8)) return "a stripe";
  return "a solid or a stripe";
}

/** Puts the black back on the foot spot (or as close as it'll fit) after it goes in on the break. */
export function respotBlack(balls: Ball[]) {
  const black = balls.find((ball) => ball.id === 8);
  if (!black || !black.pocketed) return;
  let x = footSpot.x;
  while (balls.some((ball) => !ball.pocketed && ball.id !== 8 && Math.hypot(ball.x - x, ball.y - footSpot.y) < ballRadius * 2)) x += 2;
  Object.assign(black, { x, y: footSpot.y, pocketed: false });
}

/** Whether the cue ball can be placed here (on the table, clear of other balls, behind the line on a break). */
export function canPlaceCue(balls: Ball[], x: number, y: number, breakShot: boolean) {
  if (x < ballRadius || x > tableWidth - ballRadius || y < ballRadius || y > tableHeight - ballRadius) return false;
  if (breakShot && x > headString) return false;
  return balls.every((ball) => ball.id === 0 || ball.pocketed || Math.hypot(ball.x - x, ball.y - y) >= ballRadius * 2.05);
}

// ---------- Computer player ----------

export type PlannedShot = { angle: number; power: number; english: { x: number; y: number }; place?: { x: number; y: number }; note: string };

function pathClear(balls: Ball[], from: { x: number; y: number }, to: { x: number; y: number }, ignore: number[]) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  for (const ball of balls) {
    if (ball.pocketed || ignore.includes(ball.id)) continue;
    const t = Math.max(0, Math.min(1, ((ball.x - from.x) * dx + (ball.y - from.y) * dy) / (length * length)));
    if (Math.hypot(from.x + dx * t - ball.x, from.y + dy * t - ball.y) < ballRadius * 2.05) return false;
  }
  return true;
}

/** Cue speed (mm/s) for a pot: enough for the object ball to reach the pocket still moving. */
export function speedForPot(toGhost: number, toPocket: number, cut: number) {
  const arriveAtPocket = 450;
  // Each ball starts by sliding and keeps 5/7 of its speed once it rolls; then it slows steadily.
  const objectStart = (7 / 5) * Math.sqrt(arriveAtPocket ** 2 + 2 * rollDecel * toPocket);
  // A ball cut at angle θ only receives the cos θ part of the cue ball's speed.
  const cueArrive = objectStart / (((1 + ballRestitution) / 2) * Math.max(0.2, Math.cos(cut)));
  return (7 / 5) * Math.sqrt(cueArrive ** 2 + 2 * rollDecel * toGhost) * 1.1;
}

export const powerForSpeed = (speed: number) => Math.max(0.05, Math.min(1, (speed - 250) / (maxShotSpeed - 250)));

export type Candidate = { angle: number; power: number; score: number; target: number; pocket: number; cut: number };

/** Candidate pots, best first: which ball, which pocket, how thin the cut. */
export function candidateShots(balls: Ball[], targets: number[], cue: { x: number; y: number }): Candidate[] {
  const shots: Candidate[] = [];
  for (const id of targets) {
    const ball = balls.find((b) => b.id === id && !b.pocketed);
    if (!ball) continue;
    pockets.forEach((pocket, pocketIndex) => {
      const aimX = pocket.x - ball.x;
      const aimY = pocket.y - ball.y;
      const toPocket = Math.hypot(aimX, aimY);
      const ghost = { x: ball.x - (aimX / toPocket) * ballRadius * 2, y: ball.y - (aimY / toPocket) * ballRadius * 2 };
      const shotX = ghost.x - cue.x;
      const shotY = ghost.y - cue.y;
      const toGhost = Math.hypot(shotX, shotY);
      if (toGhost < 1) return;
      const cut = Math.acos(Math.max(-1, Math.min(1, (shotX * aimX + shotY * aimY) / (toGhost * toPocket))));
      if (cut > (75 * Math.PI) / 180) return;
      // Side pockets only accept balls coming in fairly square.
      if (pocketIndex === 1 || pocketIndex === 4) {
        if (Math.abs(aimY) < Math.abs(aimX) * 0.9) return;
      }
      if (!pathClear(balls, cue, ghost, [0, id]) || !pathClear(balls, ball, pocket, [0, id])) return;
      const score = Math.cos(cut) ** 2 / (1 + toGhost / 1800 + toPocket / 1500);
      const power = powerForSpeed(speedForPot(toGhost, toPocket, cut));
      shots.push({ angle: Math.atan2(shotY, shotX), power, score, target: id, pocket: pocketIndex, cut });
    });
  }
  return shots.sort((a, b) => b.score - a.score);
}

/**
 * Picks a shot by trying the most promising pots (with and without a little draw) in a quick
 * simulation and keeping the one that pots and leaves the best next shot. Then adds some human
 * error, more for a lower skill. Falls back to a gentle safety if nothing is on.
 */
export function planShot(balls: Ball[], state: PoolState, skill = 0.75): PlannedShot {
  const targets = legalTargets(balls, state);
  let place: { x: number; y: number } | undefined;

  if (state.ballInHand) place = choosePlacement(balls, state, targets);
  const cue = place ?? balls[0];

  if (state.breakShot) {
    return { angle: Math.atan2(footSpot.y - cue.y + (Math.random() - 0.5) * 20, footSpot.x - cue.x), power: 0.95, english: { x: 0, y: 0 }, place, note: "Breaking" };
  }

  const candidates = candidateShots(balls, targets, cue).slice(0, 5);
  let chosen: { candidate: Candidate; english: { x: number; y: number } } | null = null;
  let bestOutcome = -Infinity;
  for (const candidate of candidates) {
    for (const english of [{ x: 0, y: 0 }, { x: 0, y: -0.3 }, { x: 0, y: 0.25 }]) {
      const trial = cloneBalls(balls);
      if (place) Object.assign(trial[0], place);
      strike(trial, candidate.angle, candidate.power, english);
      const events = simulate(trial, 1 / 200, 10);
      let outcome = candidate.score;
      if (events.pocketed.includes(0)) outcome -= 3;
      if (events.firstHit !== candidate.target) outcome -= 1;
      if (events.pocketed.includes(8) && candidate.target !== 8) outcome -= 6;
      if (events.pocketed.includes(candidate.target) && !events.pocketed.includes(0)) {
        outcome += 2;
        // Position play: how good is the next shot from where the cue ball stopped?
        const after = { ...state, breakShot: false, ballInHand: false };
        const nextTargets = legalTargets(trial, after);
        const follow = nextTargets.length ? candidateShots(trial, nextTargets, trial[0])[0] : null;
        outcome += follow ? follow.score : nextTargets.length === 0 ? 1 : -0.2;
      }
      if (outcome > bestOutcome) {
        bestOutcome = outcome;
        chosen = { candidate, english };
      }
    }
  }

  const error = ((1 - skill) * (Math.random() + Math.random() - 1) * 2.2 * Math.PI) / 180;
  if (chosen && bestOutcome > 1) {
    const { candidate, english } = chosen;
    return { angle: candidate.angle + error, power: candidate.power * (0.95 + Math.random() * 0.1), english, place, note: `Going for the ${ballName(candidate.target)}` };
  }

  // No pot available: roll softly into the nearest legal ball.
  const nearest = balls
    .filter((ball) => targets.includes(ball.id) && !ball.pocketed && pathClear(balls, cue, ball, [0, ball.id]))
    .sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0];
  if (nearest) {
    const distance = Math.hypot(nearest.x - cue.x, nearest.y - cue.y);
    return { angle: Math.atan2(nearest.y - cue.y, nearest.x - cue.x) + error, power: powerForSpeed(speedForPot(distance, 400, 0)), english: { x: 0, y: 0 }, place, note: "Playing safe" };
  }
  // Snookered: try a quick search for any angle that hits a legal ball first.
  for (let attempt = 0; attempt < 48; attempt++) {
    const angle = (attempt / 48) * Math.PI * 2;
    const trial = cloneBalls(balls);
    if (place) Object.assign(trial[0], place);
    strike(trial, angle, 0.45, { x: 0, y: 0 });
    const events = simulate(trial, 1 / 150, 6);
    if (events.firstHit !== null && targets.includes(events.firstHit) && !events.pocketed.includes(0)) {
      return { angle, power: 0.45, english: { x: 0, y: 0 }, place, note: "Kicking off a cushion" };
    }
  }
  return { angle: Math.random() * Math.PI * 2, power: 0.4, english: { x: 0, y: 0 }, place, note: "Hoping for the best" };
}

function choosePlacement(balls: Ball[], state: PoolState, targets: number[]): { x: number; y: number } {
  if (state.breakShot) return { x: headString - ballRadius * 2, y: tableHeight / 2 + (Math.random() - 0.5) * 300 };
  // Try spots behind each target ball, in line with a pocket, and keep the best straight-ish pot.
  let best: { x: number; y: number; score: number } | null = null;
  for (const id of targets) {
    const ball = balls.find((b) => b.id === id && !b.pocketed);
    if (!ball) continue;
    for (const pocket of pockets) {
      const dx = ball.x - pocket.x;
      const dy = ball.y - pocket.y;
      const length = Math.hypot(dx, dy);
      for (const back of [300, 450, 600]) {
        const x = ball.x + (dx / length) * back;
        const y = ball.y + (dy / length) * back;
        if (!canPlaceCue(balls, x, y, false)) continue;
        if (!pathClear(balls, { x, y }, ball, [0, id]) || !pathClear(balls, ball, pocket, [0, id])) continue;
        const score = 1 / (1 + length / 1500 + back / 2000);
        if (!best || score > best.score) best = { x, y, score };
      }
    }
  }
  if (best) return { x: best.x, y: best.y };
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = ballRadius + Math.random() * (tableWidth - ballRadius * 2);
    const y = ballRadius + Math.random() * (tableHeight - ballRadius * 2);
    if (canPlaceCue(balls, x, y, false)) return { x, y };
  }
  return { x: headString, y: tableHeight / 2 };
}

export const poolLessons = [
  {
    title: "The goal",
    text: "One player takes the solids (1 to 7), the other the stripes (9 to 15). Pocket all of yours, then the black 8 ball, to win.",
  },
  {
    title: "Breaking and claiming",
    text: "The game starts with a hard break into the rack. The table stays open until someone pockets a ball after the break: that ball's group becomes theirs.",
  },
  {
    title: "Your turn",
    text: "Hit one of your own balls first. Keep shooting as long as you pocket one of yours. If you miss, it's the other player's turn.",
  },
  {
    title: "Fouls",
    text: "Sinking the cue ball, missing everything, or hitting the wrong ball first is a foul. The other player then gets ball in hand: they can put the cue ball anywhere.",
  },
  {
    title: "The black",
    text: "Only go for the 8 after your group is cleared. Sinking it early, or fouling while sinking it, loses the game.",
  },
  {
    title: "Aiming",
    text: "Picture a ghost ball touching the object ball on the side away from the pocket, and send the cue ball to that spot. The guide line shows it for you.",
  },
  {
    title: "The 90 degree rule",
    text: "With no spin, after a cut shot the cue ball leaves at right angles to the object ball's path. The dashed line shows where it goes, so you can avoid scratches.",
  },
  {
    title: "Spin",
    text: "Hit high (top spin) to make the cue ball follow through, low (back spin) to draw it back, and left or right (side spin) to change how it bounces off cushions.",
  },
];
