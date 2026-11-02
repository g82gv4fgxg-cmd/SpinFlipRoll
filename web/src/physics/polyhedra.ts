/**
 * Dice shapes. Each die is defined only by its corner points; the faces are found automatically
 * as the convex hull. Numbers live on faces (d6 to d20) or on corners (d4, read at the top corner).
 */
import type { DieSides } from "../types";
import { cross, dot, length, normalize, quatBetween, quatFromAxisAngle, quatMul, rotate, scale, sub, vec } from "./vec";
import type { Quat, Vec3 } from "./vec";

export type Polyhedron = {
  sides: DieSides;
  /** Corner points, scaled so the furthest corner is 1 from the centre. */
  vertices: Vec3[];
  /** Corner indices of each face, counter-clockwise seen from outside. */
  faces: number[][];
  normals: Vec3[];
  centroids: Vec3[];
  /** For drawing a face's number: unit vectors across and up the face. */
  faceAxes: { across: Vec3; up: Vec3; size: number }[];
  /** Index of the parallel face on the other side, or -1. */
  opposite: number[];
  labelOn: "face" | "vertex";
};

const up = vec(0, 1, 0);
const golden = (1 + Math.sqrt(5)) / 2;
const cache = new Map<DieSides, Polyhedron>();

function rawVertices(sides: DieSides): Vec3[] {
  switch (sides) {
    case 4:
      return [vec(1, 1, 1), vec(1, -1, -1), vec(-1, 1, -1), vec(-1, -1, 1)];
    case 6: {
      const points: Vec3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(vec(x, y, z));
      return points;
    }
    case 8:
      return [vec(1, 0, 0), vec(-1, 0, 0), vec(0, 1, 0), vec(0, -1, 0), vec(0, 0, 1), vec(0, 0, -1)];
    case 10: {
      // Pentagonal trapezohedron: ring height chosen so each kite-shaped face is flat.
      const apex = 1.15;
      const cos36 = Math.cos(Math.PI / 5);
      const ring = (apex * (1 - cos36)) / (1 + cos36);
      const points = [vec(0, apex, 0), vec(0, -apex, 0)];
      for (let k = 0; k < 5; k++) {
        const upper = (k * 2 * Math.PI) / 5;
        const lower = upper + Math.PI / 5;
        points.push(vec(Math.cos(upper), ring, Math.sin(upper)));
        points.push(vec(Math.cos(lower), -ring, Math.sin(lower)));
      }
      return points;
    }
    case 12: {
      const points: Vec3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(vec(x, y, z));
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          points.push(vec(0, a / golden, b * golden));
          points.push(vec(a / golden, b * golden, 0));
          points.push(vec(a * golden, 0, b / golden));
        }
      }
      return points;
    }
    default: {
      const points: Vec3[] = [];
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          points.push(vec(0, a, b * golden));
          points.push(vec(a, b * golden, 0));
          points.push(vec(a * golden, 0, b));
        }
      }
      return points;
    }
  }
}

/** Finds the flat faces of a convex point set (fine for the few dozen corners a die has). */
function hullFaces(vertices: Vec3[]): number[][] {
  const faces: number[][] = [];
  const seen = new Set<string>();
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        let normal = cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i]));
        if (length(normal) < 1e-9) continue;
        normal = normalize(normal);
        if (dot(normal, vertices[i]) < 0) normal = scale(normal, -1);
        const offset = dot(normal, vertices[i]);
        if (vertices.some((v) => dot(normal, v) > offset + 1e-6)) continue;
        const members = vertices.map((v, index) => (Math.abs(dot(normal, v) - offset) < 1e-5 ? index : -1)).filter((index) => index >= 0);
        const key = members.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push(orderAround(members, vertices, normal));
      }
    }
  }
  return faces;
}

function orderAround(members: number[], vertices: Vec3[], normal: Vec3): number[] {
  const centre = scale(members.reduce((sum, index) => ({ x: sum.x + vertices[index].x, y: sum.y + vertices[index].y, z: sum.z + vertices[index].z }), vec()), 1 / members.length);
  const e1 = normalize(sub(vertices[members[0]], centre));
  const e2 = cross(normal, e1);
  return [...members].sort((a, b) => {
    const da = sub(vertices[a], centre);
    const db = sub(vertices[b], centre);
    return Math.atan2(dot(da, e2), dot(da, e1)) - Math.atan2(dot(db, e2), dot(db, e1));
  });
}

export function polyhedron(sides: DieSides): Polyhedron {
  const cached = cache.get(sides);
  if (cached) return cached;

  const raw = rawVertices(sides);
  const furthest = Math.max(...raw.map(length));
  const vertices = raw.map((v) => scale(v, 1 / furthest));
  const faces = hullFaces(vertices);
  const centroids = faces.map((face) =>
    scale(face.reduce((sum, index) => ({ x: sum.x + vertices[index].x, y: sum.y + vertices[index].y, z: sum.z + vertices[index].z }), vec()), 1 / face.length)
  );
  const normals = centroids.map((centroid, index) => {
    const face = faces[index];
    const n = normalize(cross(sub(vertices[face[1]], vertices[face[0]]), sub(vertices[face[2]], vertices[face[0]])));
    return dot(n, centroid) < 0 ? scale(n, -1) : n;
  });
  const faceAxes = faces.map((face, index) => {
    const centroid = centroids[index];
    // Numbers point at the face's furthest corner (the tip of a d10 kite; any corner otherwise).
    const tip = face.reduce((best, vertex) => (length(sub(vertices[vertex], centroid)) > length(sub(vertices[best], centroid)) + 1e-6 ? vertex : best), face[0]);
    const faceUp = normalize(sub(vertices[tip], centroid));
    const across = cross(faceUp, normals[index]);
    // Room for a label: distance from the centre to the nearest edge.
    let size = Infinity;
    for (let i = 0; i < face.length; i++) {
      const a = vertices[face[i]];
      const b = vertices[face[(i + 1) % face.length]];
      const edge = normalize(sub(b, a));
      const toCentre = sub(centroid, a);
      size = Math.min(size, length(sub(toCentre, scale(edge, dot(toCentre, edge)))));
    }
    return { across, up: faceUp, size };
  });
  const opposite = normals.map((normal) => normals.findIndex((other) => dot(normal, other) < -0.999));

  const shape: Polyhedron = {
    sides,
    vertices,
    faces,
    normals,
    centroids,
    faceAxes,
    opposite,
    labelOn: sides === 4 ? "vertex" : "face",
  };
  cache.set(sides, shape);
  return shape;
}

/** Starting numbers: opposite faces add up to sides + 1, like real dice. */
export function baseLabels(shape: Polyhedron): number[] {
  if (shape.labelOn === "vertex") return shape.vertices.map((_, index) => index + 1);
  const labels = new Array<number>(shape.faces.length).fill(0);
  let next = 1;
  shape.faces.forEach((_, face) => {
    if (labels[face]) return;
    const other = shape.opposite[face];
    labels[face] = next;
    if (other >= 0) labels[other] = shape.sides + 1 - next;
    next += 1;
  });
  return labels;
}

/** The face pointing up (or, for a d4, the corner pointing up). */
export function topIndex(shape: Polyhedron, orientation: Quat): number {
  const items = shape.labelOn === "vertex" ? shape.vertices : shape.normals;
  let best = 0;
  let bestHeight = -Infinity;
  items.forEach((item, index) => {
    const height = rotate(orientation, item).y;
    if (height > bestHeight) {
      bestHeight = height;
      best = index;
    }
  });
  return best;
}

export function valueShown(shape: Polyhedron, labels: number[], orientation: Quat): number {
  return labels[topIndex(shape, orientation)];
}

/**
 * Renumbers the die so `desired` is on top, swapping it with whatever landed there. For dice with
 * opposite faces the opposite numbers are swapped too, so they still add up to sides + 1.
 */
export function relabel(shape: Polyhedron, labels: number[], orientation: Quat, desired: number): number[] {
  const next = [...labels];
  const top = topIndex(shape, orientation);
  const holder = next.indexOf(desired);
  if (holder < 0 || holder === top) return next;
  const swap = (a: number, b: number) => {
    [next[a], next[b]] = [next[b], next[a]];
  };
  const topOpposite = shape.labelOn === "face" ? shape.opposite[top] : -1;
  const holderOpposite = shape.labelOn === "face" ? shape.opposite[holder] : -1;
  swap(top, holder);
  if (topOpposite >= 0 && holderOpposite >= 0 && holder !== topOpposite) swap(topOpposite, holderOpposite);
  return next;
}

/** An orientation resting on the table with `value` on top, turned by `yaw` about the vertical. */
export function orientationShowing(shape: Polyhedron, labels: number[], value: number, yaw: number): Quat {
  const index = Math.max(0, labels.indexOf(value));
  const pointUp = shape.labelOn === "vertex" ? normalize(shape.vertices[index]) : shape.normals[index];
  return quatMul(quatFromAxisAngle(up, yaw), quatBetween(pointUp, up));
}

/** Height of the centre above the table when resting in this orientation (for a die of size `size`). */
export function restHeight(shape: Polyhedron, orientation: Quat, size: number): number {
  return -Math.min(...shape.vertices.map((v) => rotate(orientation, v).y)) * size;
}
