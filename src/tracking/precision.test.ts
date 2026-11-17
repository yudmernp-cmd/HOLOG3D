import { describe, it, expect } from "vitest";
import { AdaptiveFilter } from "./smoothing";
import { GestureRecognizer } from "./gestures";
import type { Point } from "../types";
function points(): Point[] {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6, z: 0 }));
  p[0] = { x: 0.5, y: 0.8, z: 0 };
  p[4] = { x: 0.2, y: 0.6, z: 0 };
  for (const tip of [8, 12, 16, 20]) {
    p[tip] = { x: 0.5, y: 0.3, z: 0 };
    p[tip - 2] = { x: 0.5, y: 0.55, z: 0 };
  }
  return p;
}
function fist() {
  const p = points();
  for (const i of [8, 12, 16, 20]) p[i] = { x: 0.5, y: 0.7, z: 0 };
  return p;
}
function pinch() {
  const p = points();
  p[4] = { ...p[8] };
  return p;
}
const rms = (v: number[]) =>
  Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
describe("precision without changing interactions", () => {
  it("reduces stationary landmark jitter by at least half", () => {
    const f = new AdaptiveFilter(0.5);
    const raw: number[] = [],
      filtered: number[] = [];
    for (let i = 0; i < 100; i++) {
      const value = 0.5 + (i % 2 ? 0.006 : -0.006);
      const result = f.update(value, 0.05);
      if (i > 10) {
        raw.push(value - 0.5);
        filtered.push(result - 0.5);
      }
    }
    expect(rms(filtered)).toBeLessThan(rms(raw) * 0.5);
  });
  it("responds to a deliberate movement promptly rather than adding a fixed long lag", () => {
    const f = new AdaptiveFilter(0.5);
    for (let i = 0; i < 20; i++) f.update(0.5, 0.05);
    expect(f.update(0.7, 0.05)).toBeGreaterThan(0.64);
    expect(f.update(0.7, 0.05)).toBeGreaterThan(0.68);
  });
  it("filters the index tip used for drawing, not just the palm", () => {
    const r = new GestureRecognizer();
    const raw: number[] = [],
      filtered: number[] = [];
    for (let i = 0; i < 80; i++) {
      const p = points();
      p[8].x += i % 2 ? 0.006 : -0.006;
      const h = r.update(p, "left", i * 50);
      if (i > 10) {
        raw.push(p[8].x - 0.5);
        filtered.push(h.points[8].x - 0.5);
      }
    }
    expect(rms(filtered)).toBeLessThan(rms(raw) * 0.5);
  });
  it("rejects one-frame fist flicker but confirms an intentional fist promptly", () => {
    const r = new GestureRecognizer();
    r.update(points(), "left", 0);
    expect(r.update(fist(), "left", 50).gesture).toBe("open");
    expect(r.update(points(), "left", 100).gesture).toBe("open");
    expect(r.update(fist(), "left", 150).gesture).toBe("open");
    expect(r.update(fist(), "left", 200).gesture).toBe("fist");
  });
  it("does not initiate a stroke for a single-frame false pinch; confirmed pinch starts only once", () => {
    const r = new GestureRecognizer();
    r.update(points(), "left", 0);
    expect(r.update(pinch(), "left", 50).pinchStart).toBe(false);
    expect(r.update(points(), "left", 100).pinchStart).toBe(false);
    expect(r.update(pinch(), "left", 150).pinchStart).toBe(false);
    expect(r.update(pinch(), "left", 200).pinchStart).toBe(true);
    expect(r.update(pinch(), "left", 250).pinchStart).toBe(false);
    expect(r.update(points(), "left", 300).gesture).toBe("open");
  });
  it("keeps an open palm stable near the finger extension threshold", () => {
    const r = new GestureRecognizer();
    r.update(points(), "left", 0);
    for (let i = 1; i < 30; i++) {
      const p = points();
      for (const tip of [8, 12, 16, 20])
        p[tip].y = 0.8 - 0.25 * (i % 2 ? 1.16 : 1.2);
      expect(r.update(p, "left", i * 50).gesture).toBe("open");
    }
  });
  it("resets filtering on tracking loss, resolution changes and explicit reset", () => {
    const r = new GestureRecognizer();
    const p = points();
    r.update(p, "left", 0);
    const moved = points().map((v) => ({ ...v, x: v.x + 0.2 }));
    expect(r.update(moved, "left", 1000).points[8].x).toBe(moved[8].x);
    expect(r.update(p, "left", 1050, 1, 16 / 9).points[8].x).toBe(p[8].x);
    r.reset();
    expect(r.update(moved, "left", 1100).points[8].x).toBe(moved[8].x);
  });
  it("keeps wrist angle continuous across the minus-pi/pi seam", () => {
    const r = new GestureRecognizer();
    let previous = 0;
    for (let i = 0; i < 20; i++) {
      const p = points();
      const angle = ((179 + i * 0.3) * Math.PI) / 180;
      p[5] = {
        x: 0.5 + 0.1 * Math.cos(angle),
        y: 0.5 + 0.1 * Math.sin(angle),
        z: 0,
      };
      p[17] = {
        x: 0.5 - 0.1 * Math.cos(angle),
        y: 0.5 - 0.1 * Math.sin(angle),
        z: 0,
      };
      const h = r.update(p, "left", i * 50);
      if (i) expect(Math.abs(h.angle - previous)).toBeLessThan(0.05);
      previous = h.angle;
    }
  });
});
