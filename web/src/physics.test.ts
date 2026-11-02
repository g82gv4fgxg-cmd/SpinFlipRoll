import { describe, expect, it } from "vitest";
import { dieSides } from "./dice";
import { simulateToss } from "./physics/coinSim";
import { dieSize, simulateRoll } from "./physics/diceSim";
import { baseLabels, orientationShowing, polyhedron, relabel, restHeight, valueShown } from "./physics/polyhedra";
import { randomQuat, rotate, seededRandom, vec } from "./physics/vec";
import { angleAt, createFlapper, distanceTo, planCoast, planFling, planSpin, stepFlapper, velocityAt } from "./physics/wheelMotion";

const tau = Math.PI * 2;
const sameAngle = (a: number, b: number) => Math.abs(((((a - b) % tau) + tau + Math.PI) % tau) - Math.PI) < 1e-6;

describe("wheel motion", () => {
  it("a planned spin stops exactly on the target and comes to rest", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 300; i++) {
      const start = random() * 50 - 25;
      const target = random() * tau;
      const motion = planSpin(start, target, 0.8 + random() * 4, 4 + Math.floor(random() * 4));
      expect(sameAngle(angleAt(motion, motion.duration), target)).toBe(true);
      expect(velocityAt(motion, motion.duration * 0.999)).toBeLessThan(0.5);
      expect(velocityAt(motion, 0)).toBeCloseTo(motion.omega0, 6);
      // Always slowing down, never reversing.
      let previous = angleAt(motion, 0);
      for (let t = 0.05; t <= motion.duration; t += 0.05) {
        const angle = angleAt(motion, t);
        expect(angle).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = angle;
      }
    }
  });

  it("a fling keeps the release speed and still lands on the target, in either direction", () => {
    const random = seededRandom(11);
    for (let i = 0; i < 300; i++) {
      const velocity = (random() < 0.5 ? -1 : 1) * (6 + random() * 40);
      const target = random() * tau;
      const motion = planFling(1.3, target, velocity, 4.4)!;
      expect(motion).not.toBeNull();
      expect(velocityAt(motion, 0)).toBeCloseTo(velocity, 6);
      expect(sameAngle(angleAt(motion, motion.duration), target)).toBe(true);
      expect(motion.duration).toBeGreaterThan(0.5);
      expect(motion.duration).toBeLessThan(12);
    }
  });

  it("slow releases coast instead of spinning", () => {
    expect(planFling(0, 1, 3, 4)).toBeNull();
    const coast = planCoast(0, -3);
    expect(angleAt(coast, coast.duration)).toBeLessThan(0);
    expect(velocityAt(coast, coast.duration)).toBe(0);
  });

  it("measures the distance to the target the right way round", () => {
    expect(distanceTo(0, 1, 1)).toBeCloseTo(1);
    expect(distanceTo(0, 1, -1)).toBeCloseTo(tau - 1);
  });

  it("the flapper is pushed by pegs and clacks as each one passes", () => {
    const flapper = createFlapper();
    const pegs = [0, tau / 3, (2 * tau) / 3].map((p) => p - Math.PI / 2);
    let clacks = 0;
    let maxDeflection = 0;
    let angle = -0.3;
    for (let i = 0; i < 2400; i++) {
      angle += 2 * (1 / 240);
      if (stepFlapper(flapper, angle, 2, pegs, tau / 3, 1 / 240)) clacks++;
      maxDeflection = Math.max(maxDeflection, flapper.angle);
    }
    // 10 seconds at 2 rad/s is a bit over three turns past three pegs.
    expect(clacks).toBeGreaterThanOrEqual(9);
    expect(clacks).toBeLessThanOrEqual(10);
    expect(maxDeflection).toBeGreaterThan(0.3);
  });
});

describe("coin toss", () => {
  it("flies, bounces and settles flat on one face", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const toss = simulateToss(seed % 2 === 0 ? 0 : 1, seededRandom(seed));
      const last = toss.frames[toss.frames.length - 1];
      expect(Math.abs(Math.sin(last.angle))).toBeLessThan(1e-9);
      expect(toss.topFace).toBe(Math.cos(last.angle) > 0 ? 0 : 1);
      expect(toss.duration).toBeGreaterThan(0.8);
      expect(toss.duration).toBeLessThan(6);
      expect(Math.max(...toss.frames.map((f) => f.y))).toBeGreaterThan(1.5);
      expect(toss.impacts.length).toBeGreaterThan(0);
      expect(Math.min(...toss.frames.map((f) => f.y))).toBeGreaterThan(-0.05);
    }
  });

  it("lands on each face about half the time", () => {
    let front = 0;
    for (let seed = 1; seed <= 400; seed++) if (simulateToss(0, seededRandom(seed * 31)).topFace === 0) front++;
    expect(front / 400).toBeGreaterThan(0.3);
    expect(front / 400).toBeLessThan(0.7);
  });
});

describe("dice shapes", () => {
  const expectedFaces: Record<number, number> = { 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 20: 20 };

  it.each(dieSides)("d%i has the right faces, all flat and numbered once", (sides) => {
    const shape = polyhedron(sides);
    expect(shape.faces).toHaveLength(expectedFaces[sides]);
    shape.faces.forEach((face, index) => {
      for (const vertex of face) {
        const offset = Math.abs(
          (shape.vertices[vertex].x - shape.centroids[index].x) * shape.normals[index].x +
            (shape.vertices[vertex].y - shape.centroids[index].y) * shape.normals[index].y +
            (shape.vertices[vertex].z - shape.centroids[index].z) * shape.normals[index].z
        );
        expect(offset).toBeLessThan(1e-6);
      }
    });
    const labels = baseLabels(shape);
    expect([...labels].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
    if (shape.labelOn === "face") {
      shape.opposite.forEach((other, face) => {
        expect(other).toBeGreaterThanOrEqual(0);
        expect(labels[face] + labels[other]).toBe(sides + 1);
      });
    }
  });

  it.each(dieSides)("d%i can be turned to show any number, and renumbered to show any number", (sides) => {
    const shape = polyhedron(sides);
    const random = seededRandom(sides);
    const labels = baseLabels(shape);
    for (let value = 1; value <= sides; value++) {
      const pose = orientationShowing(shape, labels, value, random() * tau);
      expect(valueShown(shape, labels, pose)).toBe(value);
      expect(restHeight(shape, pose, 1)).toBeGreaterThan(0);
    }
    for (let i = 0; i < 100; i++) {
      const pose = randomQuat(random);
      const desired = 1 + Math.floor(random() * sides);
      const renumbered = relabel(shape, labels, pose, desired);
      expect(valueShown(shape, renumbered, pose)).toBe(desired);
      expect([...renumbered].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, n) => n + 1));
      if (shape.labelOn === "face") shape.opposite.forEach((other, face) => expect(renumbered[face] + renumbered[other]).toBe(sides + 1));
    }
  });
});

describe("dice roll", () => {
  it.each(dieSides)("d%i dice tumble and settle flat inside the tray", (sides) => {
    const shape = polyhedron(sides);
    const tray = { halfWidth: 4, halfDepth: 2.6 };
    for (let seed = 1; seed <= 6; seed++) {
      const dice = Array.from({ length: 4 }, () => ({ shape, position: vec(), orientation: { w: 1, x: 0, y: 0, z: 0 }, held: false }));
      const roll = simulateRoll(dice, tray, seededRandom(seed * 97 + sides));
      const last = roll.frames[roll.frames.length - 1];
      expect(roll.duration).toBeLessThan(4.6);
      expect(roll.impacts.length).toBeGreaterThan(0);
      last.positions.forEach((position, die) => {
        const orientation = last.orientations[die];
        expect(Math.abs(position.x)).toBeLessThan(tray.halfWidth);
        expect(Math.abs(position.z)).toBeLessThan(tray.halfDepth);
        const flat = Math.max(...shape.normals.map((n) => -rotate(orientation, n).y));
        expect(flat).toBeGreaterThan(0.97);
        expect(position.y).toBeCloseTo(restHeight(shape, orientation, dieSize), 1);
      });
    }
  });

  it("held dice stay exactly where they are", () => {
    const shape = polyhedron(6);
    const labels = baseLabels(shape);
    const heldPose = orientationShowing(shape, labels, 6, 0.4);
    const heldPosition = vec(-2, restHeight(shape, heldPose, dieSize), 0);
    const roll = simulateRoll(
      [
        { shape, position: heldPosition, orientation: heldPose, held: true },
        { shape, position: vec(), orientation: { w: 1, x: 0, y: 0, z: 0 }, held: false },
      ],
      { halfWidth: 4, halfDepth: 2.6 },
      seededRandom(5)
    );
    for (const frame of roll.frames) {
      expect(frame.positions[0]).toEqual(heldPosition);
      expect(frame.orientations[0]).toEqual(heldPose);
    }
  });
});
