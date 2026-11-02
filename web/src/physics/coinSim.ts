/**
 * Coin toss physics. The coin is a rigid disc that spins about the horizontal X axis while it
 * flies, then bounces on the table (impulses at the rim corners, with friction) until it lies flat.
 * The whole toss is simulated up front and played back, so the animation is exactly the simulation.
 *
 * Coordinates: X right, Y up, Z towards the viewer. angle 0 = lying flat with the front face up.
 */

export const coinRadius = 1;
export const coinThickness = 0.13;
const gravity = 32;
const mass = 1;
const inertia = (mass * coinRadius * coinRadius) / 4 + (mass * coinThickness * coinThickness) / 12;
const step = 1 / 720;
const recordEvery = 3; // 240 frames a second

export type CoinFrame = { x: number; y: number; z: number; angle: number };

export type CoinToss = {
  frames: CoinFrame[];
  frameTime: number;
  duration: number;
  /** 0 when the front face ends up, 1 when the back face does. */
  topFace: 0 | 1;
  impacts: { time: number; strength: number }[];
};

export function restingFrame(face: 0 | 1): CoinFrame {
  return { x: 0, y: coinThickness / 2, z: 0, angle: face === 0 ? 0 : Math.PI };
}

export function simulateToss(startFace: 0 | 1, random: () => number = Math.random): CoinToss {
  let x = 0;
  let y = coinThickness / 2 + 0.02;
  let z = 0;
  let angle = startFace === 0 ? 0 : Math.PI;
  let vx = (random() - 0.5) * 0.7;
  let vy = 12.4 + random() * 1.6;
  let vz = (random() - 0.5) * 0.8;
  // The thumb flick builds the spin over the first tenth of a second, so the rim clears the table.
  const spin = (random() < 0.5 ? -1 : 1) * (24 + random() * 9);
  const flick = 0.1;
  let omega = 0;

  const frames: CoinFrame[] = [{ x, y, z, angle }];
  const impacts: CoinToss["impacts"] = [];
  let time = 0;
  let resting = 0;
  let steps = 0;

  while (time < 6) {
    if (time < flick) omega = spin * Math.min(1, (time + step) / flick);
    vy -= gravity * step;
    vx *= 1 - 0.08 * step;
    vz *= 1 - 0.08 * step;
    omega *= 1 - 0.04 * step;
    x += vx * step;
    y += vy * step;
    z += vz * step;
    angle += omega * step;
    time += step;

    // In-plane direction and face normal, as (y, z) components.
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const corners: [number, number][] = [];
    for (const along of [-1, 1]) {
      for (const across of [-1, 1]) {
        corners.push([
          along * coinRadius * -sin + across * (coinThickness / 2) * cos,
          along * coinRadius * cos + across * (coinThickness / 2) * sin,
        ]);
      }
    }

    // Resolve every touching corner together, a few passes, so a flat coin comes to rest cleanly.
    const contacts = corners.filter((corner) => y + corner[0] < 0.002);
    const touching = contacts.length > 0;
    if (touching) {
      const deepest = Math.min(...contacts.map((corner) => corner[0]));
      if (y + deepest < 0) y -= y + deepest; // lift so the lowest corner sits on the table
      for (let pass = 0; pass < 4; pass++) {
        for (const [ry, rz] of contacts) {
          const normalSpeed = vy - omega * rz;
          if (normalSpeed >= 0) continue;
          const restitution = pass === 0 && normalSpeed < -2.5 ? 0.42 : 0;
          const j = (-(1 + restitution) * normalSpeed) / (1 / mass + (rz * rz) / inertia);
          vy += j / mass;
          omega += (-rz * j) / inertia;
          // Friction along the table.
          const slide = vz + omega * ry;
          let jt = -slide / (1 / mass + (ry * ry) / inertia);
          const limit = 0.35 * j;
          jt = Math.max(-limit, Math.min(limit, jt));
          vz += jt / mass;
          omega += (ry * jt) / inertia;
          if (pass === 0 && normalSpeed < -1.2) impacts.push({ time, strength: Math.min(1, -normalSpeed / 9) });
        }
      }
      // Resting contact loses energy quickly.
      omega *= 1 - 3.5 * step;
      vx *= 1 - 3 * step;
      vz *= 1 - 3 * step;
    }

    steps += 1;
    if (steps % recordEvery === 0) frames.push({ x, y, z, angle });

    // Tiny bounces lift the coin a hair off the table, so "near the table" counts as touching.
    const lowest = y + Math.min(...corners.map((corner) => corner[0]));
    const onTable = touching || lowest < 0.005;
    const still = Math.abs(vy) < 0.1 && Math.abs(omega) < 0.35 && Math.hypot(vx, vz) < 0.1;
    if (onTable && still && time > 0.4) {
      resting += step;
      // A coin balanced near its edge gets a tiny nudge so it always falls onto a face.
      if (Math.abs(Math.sin(angle)) > 0.3) omega += (random() < 0.5 ? -1 : 1) * 1.5;
      else if (resting > 0.12) break;
    } else {
      resting = 0;
    }
  }

  const topFace: 0 | 1 = Math.cos(angle) >= 0 ? 0 : 1;
  const flat = Math.round(angle / Math.PI) * Math.PI;
  const final = { x, y: coinThickness / 2, z, angle: flat };
  // Ease the last few frames into the exact resting pose.
  const blend = Math.min(frames.length - 1, 12);
  for (let i = 1; i <= blend; i++) {
    const frame = frames[frames.length - 1 - blend + i];
    const t = i / blend;
    frame.angle += (final.angle - frame.angle) * t;
    frame.y += (final.y - frame.y) * t;
  }
  frames.push(final);

  const frameTime = step * recordEvery;
  return { frames, frameTime, duration: (frames.length - 1) * frameTime, topFace, impacts };
}

export function frameAt(toss: CoinToss, time: number): CoinFrame {
  const position = Math.max(0, time / toss.frameTime);
  const index = Math.floor(position);
  if (index >= toss.frames.length - 1) return toss.frames[toss.frames.length - 1];
  const a = toss.frames[index];
  const b = toss.frames[index + 1];
  const t = position - index;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    angle: a.angle + (b.angle - a.angle) * t,
  };
}
