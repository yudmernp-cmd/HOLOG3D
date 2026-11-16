import { describe, it, expect } from "vitest";
import { GestureRecognizer, project } from "./gestures";
import { shapePositions } from "../scene/shapes";
import type { Point, Shape } from "../types";
function hand(): Point[] {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6, z: 0 }));
  p[0] = { x: 0.5, y: 0.8, z: 0 };
  p[9] = { x: 0.5, y: 0.6, z: 0 };
  p[4] = { x: 0.2, y: 0.6, z: 0 };
  for (const tip of [8, 12, 16, 20]) {
    p[tip] = { x: 0.5 + (tip - 12) * 0.01, y: 0.3, z: 0 };
    p[tip - 2] = { x: p[tip].x, y: 0.55, z: 0 };
  }
  return p;
}
describe("real gesture geometry", () => {
  it("recognizes an open hand, then a fist", () => {
    const r = new GestureRecognizer();
    const p = hand();
    expect(r.update(p, "left", 100).gesture).toBe("open");
    for (const tip of [8, 12, 16, 20]) p[tip] = { x: 0.5, y: 0.7, z: 0 };
    expect(r.update(p, "left", 140).gesture).toBe("fist");
  });
  it("prioritizes a closed fist even when thumb and index touch", () => {
    const p = hand();
    for (const tip of [8, 12, 16, 20]) p[tip] = { x: 0.5, y: 0.7, z: 0 };
    p[4] = { ...p[8] };
    expect(new GestureRecognizer().update(p, "left", 100).gesture).toBe("fist");
  });
  it("matches direct camera and mirrored overlay using a single horizontal flip", () => {
    const point = { x: 0.8, y: 0.3, z: 0 };
    const direct = project(point, 640, 480, 1000, 500, false),
      mirror = project(point, 640, 480, 1000, 500, true);
    expect(direct.x).toBeGreaterThan(0);
    expect(mirror.x).toBeCloseTo(-direct.x);
    expect(mirror.y).toBe(direct.y);
  });
  it("pinch emits an edge once and uses release hysteresis", () => {
    const r = new GestureRecognizer();
    const p = hand();
    p[4] = { ...p[8], x: p[8].x + 0.04 };
    expect(r.update(p, "left", 100).pinchStart).toBe(true);
    p[4].x = p[8].x + 0.075;
    expect(r.update(p, "left", 140).gesture).toBe("pinch");
    expect(r.update(p, "left", 180).pinchStart).toBe(false);
    p[4].x = p[8].x + 0.12;
    expect(r.update(p, "left", 220).gesture).toBe("open");
  });
  it("does not share state across hands and expires stale history", () => {
    const r = new GestureRecognizer();
    const p = hand();
    p[4] = { ...p[8] };
    r.update(p, "left", 100);
    expect(r.update(p, "right", 140).pinchStart).toBe(true);
    expect(r.update(p, "left", 1000).pinchStart).toBe(true);
  });
  it("matches mirrored contain camera with letterboxing", () => {
    const q = project({ x: 0, y: 0, z: 0 }, 640, 480, 1000, 500, true);
    expect(q.x).toBeCloseTo(1000 / 3);
    expect(q.y).toBeCloseTo(250);
    expect(
      project({ x: 0.5, y: 0.5, z: 0 }, 640, 480, 500, 1000, false),
    ).toEqual({ x: 0, y: 0, z: -0 });
  });
  it("generates finite buffer positions for every particle shape", () => {
    for (const s of [
      "Esfera",
      "Galaxia",
      "Corazón",
      "Espiral",
      "Cubo",
      "Toroide",
      "ADN",
    ] as Shape[]) {
      const data = shapePositions(s, 15000);
      expect(data.length).toBe(45000);
      expect(data.every(Number.isFinite)).toBe(true);
    }
  });
});
