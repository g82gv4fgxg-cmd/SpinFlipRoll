/**
 * Dice roll physics: rigid bodies thrown into a walled tray. Corners collide with the table and
 * walls (impulses with friction and spin), dice bump into each other as spheres, and each die
 * settles flat on a face. The roll is simulated up front and played back frame by frame.
 *
 * Coordinates: X right, Y up, Z towards the viewer. The tray floor is Y = 0.
 */
import type { Polyhedron } from "./polyhedra";
import { add, addScaled, cross, dot, integrate, length, lerpVec, normalize, quatFromAxisAngle, quatMul, quatNormalize, randomQuat, rotate, scale, slerp, sub, vec } from "./vec";
import type { Quat, Vec3 } from "./vec";

export const dieSize = 0.62;
const gravity = 34;
const step = 1 / 240;
const recordEvery = 2; // 120 frames a second
const mass = 1;

export type Tray = { halfWidth: number; halfDepth: number };

export type DieBody = {
  shape: Polyhedron;
  position: Vec3;
  orientation: Quat;
  held: boolean;
};

export type DiceRoll = {
  frames: { positions: Vec3[]; orientations: Quat[] }[];
  frameTime: number;
  duration: number;
  impacts: { time: number; strength: number }[];
};

type Body = DieBody & {
  velocity: Vec3;
  spin: Vec3;
  radius: number;
  inertia: number;
  resting: number;
  asleep: boolean;
};

const floorNormal = vec(0, 1, 0);

export function simulateRoll(dice: DieBody[], tray: Tray, random: () => number = Math.random): DiceRoll {
  const thrown = dice.filter((die) => !die.held).length;
  let order = 0;
  const bodies: Body[] = dice.map((die) => {
    // Between the die's inner and outer radius: close enough for knocks, loose enough to rest side by side.
    const radius = dieSize * 0.74;
    const body: Body = {
      ...die,
      velocity: vec(),
      spin: vec(),
      radius,
      inertia: 0.4 * mass * radius * radius,
      resting: 0,
      asleep: die.held,
    };
    if (!die.held) {
      // Thrown from the near edge of the tray, spread out sideways so they don't start overlapping.
      const lane = thrown > 1 ? order / (thrown - 1) - 0.5 : 0;
      order += 1;
      body.position = vec(lane * Math.min(tray.halfWidth * 1.3, thrown * dieSize * 2.4), 2.2 + random() * 1.2, tray.halfDepth - dieSize * 1.3);
      body.velocity = vec((random() - 0.5) * 2.4 - lane * 1.5, 3 + random() * 2.5, -(3.4 + random() * 2));
      body.orientation = randomQuat(random);
      body.spin = scale(normalize(vec(random() - 0.5, random() - 0.5, random() - 0.5)), 12 + random() * 12);
    }
    return body;
  });

  const frames: DiceRoll["frames"] = [snapshot(bodies)];
  const impacts: DiceRoll["impacts"] = [];
  let time = 0;
  let steps = 0;

  // Normal rolls settle within about 3.5 seconds; this only catches a die stuck jiggling against a wall.
  while (time < 4.5) {
    for (const body of bodies) {
      if (body.asleep) continue;
      body.velocity = addScaled(body.velocity, vec(0, -gravity, 0), step);
      body.velocity = scale(body.velocity, 1 - 0.05 * step);
      body.spin = scale(body.spin, 1 - 0.2 * step);
      body.position = addScaled(body.position, body.velocity, step);
      body.orientation = integrate(body.orientation, body.spin, step);
    }

    for (const body of bodies) {
      if (!body.asleep) collideWithTray(body, tray, time, impacts);
    }
    collideDice(bodies, time, impacts);

    for (const body of bodies) {
      if (body.asleep) continue;
      const still = length(body.velocity) < 0.08 && length(body.spin) < 0.25;
      const onTable = lowestPoint(body) < 0.02;
      if (still && onTable) {
        body.resting += step;
        if (body.resting > 0.25) {
          if (flatness(body) > 0.985) {
            body.asleep = true;
            body.velocity = vec();
            body.spin = vec();
          } else {
            // Propped against a wall or another die: knock it so it settles on a face.
            body.velocity = add(body.velocity, vec((random() - 0.5) * 1.5, 2.2, (random() - 0.5) * 1.5));
            body.spin = add(body.spin, scale(normalize(vec(random() - 0.5, random() - 0.5, random() - 0.5)), 6));
            body.resting = 0;
          }
        }
      } else {
        body.resting = 0;
      }
    }

    time += step;
    steps += 1;
    if (steps % recordEvery === 0) frames.push(snapshot(bodies));
    if (bodies.every((body) => body.asleep)) break;
  }

  // Anything still moving after the time limit is laid flat where it is.
  for (const body of bodies) {
    if (!body.asleep) settleFlat(body);
  }
  frames.push(snapshot(bodies));

  const frameTime = step * recordEvery;
  return { frames, frameTime, duration: (frames.length - 1) * frameTime, impacts };
}

function snapshot(bodies: Body[]) {
  return { positions: bodies.map((body) => body.position), orientations: bodies.map((body) => body.orientation) };
}

function worldCorners(body: Body): Vec3[] {
  return body.shape.vertices.map((v) => add(body.position, rotate(body.orientation, scale(v, dieSize))));
}

function lowestPoint(body: Body): number {
  return Math.min(...worldCorners(body).map((corner) => corner.y));
}

/** How squarely the die sits on its lowest face (1 = perfectly flat). */
function flatness(body: Body): number {
  return Math.max(...body.shape.normals.map((n) => -rotate(body.orientation, n).y));
}

function settleFlat(body: Body) {
  let best = body.shape.normals[0];
  let bestDown = -Infinity;
  for (const n of body.shape.normals) {
    const down = -rotate(body.orientation, n).y;
    if (down > bestDown) {
      bestDown = down;
      best = n;
    }
  }
  const world = rotate(body.orientation, best);
  const axis = cross(world, vec(0, -1, 0));
  const angle = Math.acos(Math.max(-1, Math.min(1, -world.y)));
  if (length(axis) > 1e-6) body.orientation = quatNormalize(quatMul(quatFromAxisAngle(axis, angle), body.orientation));
  body.position = vec(body.position.x, body.position.y - lowestPoint(body), body.position.z);
  body.velocity = vec();
  body.spin = vec();
  body.asleep = true;
}

/** Contacts between the die's corners and the floor and walls. */
function collideWithTray(body: Body, tray: Tray, time: number, impacts: DiceRoll["impacts"]) {
  const planes: { normal: Vec3; depth: (corner: Vec3) => number; restitution: number }[] = [
    { normal: floorNormal, depth: (c) => -c.y, restitution: 0.32 },
    { normal: vec(-1, 0, 0), depth: (c) => c.x - tray.halfWidth, restitution: 0.5 },
    { normal: vec(1, 0, 0), depth: (c) => -tray.halfWidth - c.x, restitution: 0.5 },
    { normal: vec(0, 0, -1), depth: (c) => c.z - tray.halfDepth, restitution: 0.5 },
    { normal: vec(0, 0, 1), depth: (c) => -tray.halfDepth - c.z, restitution: 0.5 },
  ];
  let touchingFloor = false;

  for (const plane of planes) {
    const corners = worldCorners(body);
    // Corners touching (or within a hair of) this surface, as offsets from the centre.
    const touching: Vec3[] = [];
    let deepest = 0;
    for (const corner of corners) {
      const depth = plane.depth(corner);
      if (depth > -0.002) {
        touching.push(sub(corner, body.position));
        deepest = Math.max(deepest, depth);
      }
    }
    if (touching.length === 0) continue;
    if (plane.normal === floorNormal) touchingFloor = true;
    if (deepest > 0) body.position = addScaled(body.position, plane.normal, deepest);

    // Resolve all contacts together over a few passes, so a die resting on a face really stops.
    for (let pass = 0; pass < 4; pass++) {
      for (const r of touching) {
        const pointVelocity = add(body.velocity, cross(body.spin, r));
        const normalSpeed = dot(pointVelocity, plane.normal);
        if (normalSpeed >= 0) continue;

        const rn = cross(r, plane.normal);
        const effective = 1 / mass + dot(rn, rn) / body.inertia;
        const restitution = pass === 0 && normalSpeed < -1.5 ? plane.restitution : 0;
        const j = (-(1 + restitution) * normalSpeed) / effective;
        body.velocity = addScaled(body.velocity, plane.normal, j / mass);
        body.spin = addScaled(body.spin, rn, j / body.inertia);

        // Friction against the surface, limited by the normal impulse.
        const after = add(body.velocity, cross(body.spin, r));
        const slide = sub(after, scale(plane.normal, dot(after, plane.normal)));
        const slideSpeed = length(slide);
        if (slideSpeed > 1e-6) {
          const tangent = scale(slide, 1 / slideSpeed);
          const rt = cross(r, tangent);
          const jt = Math.min(slideSpeed / (1 / mass + dot(rt, rt) / body.inertia), 0.45 * j);
          body.velocity = addScaled(body.velocity, tangent, -jt / mass);
          body.spin = addScaled(body.spin, rt, -jt / body.inertia);
        }
        if (pass === 0 && normalSpeed < -2.2) impacts.push({ time, strength: Math.min(1, -normalSpeed / 12) });
      }
    }
  }

  if (touchingFloor) {
    // Rolling resistance and scrubbing on the felt, so dice come to rest rather than skating.
    body.spin = scale(body.spin, 1 - 1.3 * step);
    body.velocity = vec(body.velocity.x * (1 - 0.7 * step), body.velocity.y, body.velocity.z * (1 - 0.7 * step));
  }
}

/** Dice knock into each other as spheres. Held and sleeping dice stay put unless hit hard. */
function collideDice(bodies: Body[], time: number, impacts: DiceRoll["impacts"]) {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      if (a.asleep && b.asleep) continue;
      const delta = sub(b.position, a.position);
      const distance = length(delta);
      const minimum = a.radius + b.radius;
      if (distance >= minimum || distance < 1e-6) continue;

      const normal = scale(delta, 1 / distance);
      const closing = dot(sub(b.velocity, a.velocity), normal);
      // Two dice settling next to each other are just touching: leave them be so they can rest.
      if (length(a.velocity) < 0.35 && length(b.velocity) < 0.35 && closing > -0.35) continue;

      // A sleeping die only wakes if it's knocked properly.
      for (const body of [a, b]) {
        if (body.asleep && !body.held && closing < -0.6) {
          body.asleep = false;
          body.resting = 0;
        }
      }
      const inverseA = a.held || a.asleep ? 0 : 1 / mass;
      const inverseB = b.held || b.asleep ? 0 : 1 / mass;
      if (inverseA + inverseB === 0) continue;

      const overlap = minimum - distance;
      a.position = addScaled(a.position, normal, (-overlap * inverseA) / (inverseA + inverseB));
      b.position = addScaled(b.position, normal, (overlap * inverseB) / (inverseA + inverseB));
      if (closing >= 0) continue;

      const impulse = (-(1 + 0.35) * closing) / (inverseA + inverseB);
      a.velocity = addScaled(a.velocity, normal, -impulse * inverseA);
      b.velocity = addScaled(b.velocity, normal, impulse * inverseB);
      // A little spin from the knock looks more natural.
      const twist = cross(normal, vec(0, 1, 0));
      if (inverseA) a.spin = addScaled(a.spin, twist, impulse * 0.6);
      if (inverseB) b.spin = addScaled(b.spin, twist, -impulse * 0.6);
      a.resting = 0;
      b.resting = 0;
      if (closing < -2) impacts.push({ time, strength: Math.min(1, -closing / 12) });
    }
  }
}

/** Every die's position and orientation at a moment in the roll, smoothly interpolated. */
export function poseAt(roll: DiceRoll, time: number): { positions: Vec3[]; orientations: Quat[] } {
  const position = Math.max(0, time / roll.frameTime);
  const index = Math.floor(position);
  if (index >= roll.frames.length - 1) return roll.frames[roll.frames.length - 1];
  const a = roll.frames[index];
  const b = roll.frames[index + 1];
  const t = position - index;
  return {
    positions: a.positions.map((p, die) => lerpVec(p, b.positions[die], t)),
    orientations: a.orientations.map((q, die) => slerp(q, b.orientations[die], t)),
  };
}
