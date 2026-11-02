/** Small 3D vector and quaternion helpers for the physics simulations. */

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { w: number; x: number; y: number; z: number };

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
export const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => addScaled(a, sub(b, a), t);

export const identityQuat = (): Quat => ({ w: 1, x: 0, y: 0, z: 0 });

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l };
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return { w: Math.cos(angle / 2), x: n.x * s, y: n.y * s, z: n.z * s };
}

/** Rotates vector v by unit quaternion q. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(u x v) + 2(u x (u x v)), with u the vector part of q.
  const u = { x: q.x, y: q.y, z: q.z };
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q.w)), cross(u, t));
}

/** Advances an orientation by angular velocity w (world frame, radians per second). */
export function integrate(q: Quat, w: Vec3, dt: number): Quat {
  const spin = quatMul({ w: 0, x: w.x, y: w.y, z: w.z }, q);
  return quatNormalize({
    w: q.w + 0.5 * dt * spin.w,
    x: q.x + 0.5 * dt * spin.x,
    y: q.y + 0.5 * dt * spin.y,
    z: q.z + 0.5 * dt * spin.z,
  });
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  let end = b;
  if (cos < 0) {
    cos = -cos;
    end = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
  }
  if (cos > 0.9995) {
    return quatNormalize({
      w: a.w + (end.w - a.w) * t,
      x: a.x + (end.x - a.x) * t,
      y: a.y + (end.y - a.y) * t,
      z: a.z + (end.z - a.z) * t,
    });
  }
  const angle = Math.acos(cos);
  const s = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / s;
  const wb = Math.sin(t * angle) / s;
  return { w: a.w * wa + end.w * wb, x: a.x * wa + end.x * wb, y: a.y * wa + end.y * wb, z: a.z * wa + end.z * wb };
}

/** The shortest rotation taking unit vector `from` onto unit vector `to`. */
export function quatBetween(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d < -0.999999) {
    // Opposite vectors: rotate 180 degrees about any perpendicular axis.
    const axis = Math.abs(from.x) < 0.9 ? cross(from, vec(1, 0, 0)) : cross(from, vec(0, 1, 0));
    return quatFromAxisAngle(axis, Math.PI);
  }
  const c = cross(from, to);
  return quatNormalize({ w: 1 + d, x: c.x, y: c.y, z: c.z });
}

/** A uniformly random orientation. */
export function randomQuat(random: () => number): Quat {
  const u1 = random();
  const u2 = random() * Math.PI * 2;
  const u3 = random() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { w: a * Math.sin(u2), x: a * Math.cos(u2), y: b * Math.sin(u3), z: b * Math.cos(u3) };
}

/** Small seeded generator so simulations can be repeated in tests. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}
