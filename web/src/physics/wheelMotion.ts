/**
 * Wheel spin physics. The wheel slows under constant friction plus air drag:
 *   dω/dt = -a - b·ω
 * which has a closed-form solution, so a spin can be planned to stop exactly on the winner
 * while still starting at whatever speed the user flung it.
 */

export const wheelDrag = 0.8; // b, per second
export const minFlingSpeed = 6; // rad/s; slower releases just coast
const coastFriction = 3.2; // rad/s²
const tau = Math.PI * 2;

export type WheelMotion = {
  start: number;
  direction: 1 | -1;
  omega0: number;
  a: number;
  b: number;
  duration: number;
  travel: number;
};

/** How far the wheel must turn (in `direction`) to get from `start` to `target`, in [0, 2π). */
export function distanceTo(start: number, target: number, direction: 1 | -1): number {
  const raw = direction === 1 ? target - start : start - target;
  return ((raw % tau) + tau) % tau;
}

function stopTime(omega0: number, a: number, b: number) {
  return Math.log(1 + (b * omega0) / a) / b;
}

function travelFor(omega0: number, a: number, b: number) {
  return (omega0 - a * stopTime(omega0, a, b)) / b;
}

/** A spin of a set length that ends at `target` after `turns` extra full turns (used by the Spin button). */
export function planSpin(start: number, target: number, durationSeconds: number, turns: number, direction: 1 | -1 = 1): WheelMotion {
  const b = wheelDrag;
  const travel = distanceTo(start, target, direction) + tau * turns;
  const r = Math.exp(b * durationSeconds) - 1;
  const a = (travel * b) / (r / b - durationSeconds);
  const omega0 = (a * r) / b;
  return { start, direction, omega0, a, b, duration: durationSeconds, travel };
}

/**
 * A spin that starts at the speed the wheel was flung and ends at `target`. Picks the number of
 * extra turns whose stopping time is closest to `preferredSeconds`. Returns null if too slow to spin.
 */
export function planFling(start: number, target: number, velocity: number, preferredSeconds: number): WheelMotion | null {
  const speed = Math.abs(velocity);
  if (speed < minFlingSpeed) return null;
  const direction: 1 | -1 = velocity >= 0 ? 1 : -1;
  const b = wheelDrag;
  const maxTravel = speed / b;
  const base = distanceTo(start, target, direction);
  let best: WheelMotion | null = null;

  for (let turns = 0; turns < 400; turns++) {
    const travel = base + tau * turns;
    if (travel >= maxTravel * 0.999) break;
    const a = solveFriction(speed, travel, b);
    const duration = stopTime(speed, a, b);
    const motion: WheelMotion = { start, direction, omega0: speed, a, b, duration, travel };
    if (!best || Math.abs(duration - preferredSeconds) < Math.abs(best.duration - preferredSeconds)) best = motion;
  }
  return best;
}

/** A gentle release that just coasts to a stop, without picking a winner. */
export function planCoast(start: number, velocity: number): WheelMotion {
  const speed = Math.abs(velocity);
  const direction: 1 | -1 = velocity >= 0 ? 1 : -1;
  const b = wheelDrag;
  const a = coastFriction;
  return { start, direction, omega0: speed, a, b, duration: stopTime(speed, a, b), travel: travelFor(speed, a, b) };
}

/** Friction `a` that makes a wheel starting at `speed` travel exactly `travel` (travel shrinks as a grows). */
function solveFriction(speed: number, travel: number, b: number) {
  let low = Math.log(1e-6);
  let high = Math.log(1e5);
  for (let i = 0; i < 90; i++) {
    const mid = (low + high) / 2;
    if (travelFor(speed, Math.exp(mid), b) > travel) low = mid;
    else high = mid;
  }
  return Math.exp((low + high) / 2);
}

export function angleAt(motion: WheelMotion, t: number): number {
  if (t >= motion.duration) return motion.start + motion.direction * motion.travel;
  const { omega0, a, b } = motion;
  const time = Math.max(0, t);
  const distance = ((omega0 + a / b) * (1 - Math.exp(-b * time))) / b - (a * time) / b;
  return motion.start + motion.direction * distance;
}

export function velocityAt(motion: WheelMotion, t: number): number {
  if (t >= motion.duration) return 0;
  const { omega0, a, b } = motion;
  return motion.direction * Math.max(0, (omega0 + a / b) * Math.exp(-b * Math.max(0, t)) - a / b);
}

/**
 * The pointer flapper: a damped spring that pegs on the rim push aside as they pass.
 * Angles are radians; positive deflection moves the tip to the right.
 */
export type Flapper = {
  angle: number;
  velocity: number;
  /** Peg currently pushing the flapper, if any. */
  contact: number | null;
};

export const createFlapper = (): Flapper => ({ angle: 0, velocity: 0, contact: null });

const stiffness = 950;
const damping = 20;

/**
 * Advances the flapper by dt. `pegs` are the peg angles in the wheel's own frame; the pointer sits
 * at the top (-π/2). Returns true when a peg lets go of the flapper (the "clack").
 */
export function stepFlapper(flapper: Flapper, wheelAngle: number, wheelVelocity: number, pegs: number[], sliceAngle: number, dt: number): boolean {
  const reach = Math.min(0.16, sliceAngle * 0.45);
  const maxDeflection = 0.55 * (reach / 0.16);
  const pass = 0.02;
  let push = 0;
  let pusher: number | null = null;

  if (wheelVelocity !== 0) {
    const direction = wheelVelocity > 0 ? 1 : -1;
    for (let index = 0; index < pegs.length; index++) {
      const offset = wrapAngle(pegs[index] + wheelAngle + Math.PI / 2);
      // Pegs approach from the left when the wheel turns clockwise, from the right otherwise.
      const along = offset * direction;
      if (along >= -reach && along <= pass) {
        const deflection = maxDeflection * ((along + reach) / (reach + pass)) * direction;
        if (Math.abs(deflection) > Math.abs(push)) {
          push = deflection;
          pusher = index;
        }
      }
    }
  }

  flapper.velocity += (-stiffness * flapper.angle - damping * flapper.velocity) * dt;
  flapper.angle += flapper.velocity * dt;

  if (pusher !== null && Math.abs(flapper.angle) < Math.abs(push)) {
    flapper.angle = push;
    flapper.velocity = 0;
  }

  const released = flapper.contact !== null && flapper.contact !== pusher;
  flapper.contact = pusher;
  return released;
}

export function wrapAngle(angle: number): number {
  return ((((angle + Math.PI) % tau) + tau) % tau) - Math.PI;
}
