import { describe, it, expect } from "vitest";
import { defaults } from "../types";
import { displayX, videoTransform } from "./orientation";
import { project } from "./gestures";
import { spatialPosition, spatialViewport } from "../scene/spatial";

describe("camera facing the user", () => {
  it("maps movement to the user's right to screen right by default", () => {
    // A front-facing camera sees a user's rightward motion as decreasing sensor x.
    const start = project(
      { x: 0.5, y: 0.5, z: 0 },
      640,
      480,
      960,
      540,
      defaults.mirror,
    );
    const right = project(
      { x: 0.3, y: 0.5, z: 0 },
      640,
      480,
      960,
      540,
      defaults.mirror,
    );
    const left = project(
      { x: 0.7, y: 0.5, z: 0 },
      640,
      480,
      960,
      540,
      defaults.mirror,
    );
    expect(right.x).toBeGreaterThan(start.x);
    expect(left.x).toBeLessThan(start.x);
  });
  it("uses the same single reflection for camera pixels, landmark overlay and world position", () => {
    for (const mirror of [true, false])
      for (const [w, h] of [
        [960, 540],
        [390, 844],
      ]) {
        const view = spatialViewport(640, 480, w, h);
        const point = { x: 0.23, y: 0.68, z: 0 };
        const overlay = project(point, 640, 480, w, h, mirror);
        const normalized = {
          x: displayX(point.x, mirror) - 0.5,
          y: 0.5 - point.y,
          depth: 1,
          scale: 1,
          roll: 0,
        };
        const world = spatialPosition(normalized, view);
        expect(overlay.x).toBeCloseTo(world.x);
        expect(overlay.y).toBeCloseTo(world.y);
        expect(overlay.x).toBeCloseTo(
          (displayX(point.x, mirror) - 0.5) * view.videoWidth,
        );
        expect(videoTransform(mirror)).toBe(mirror ? "scaleX(-1)" : "none");
      }
  });
});
