import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { SpatialController, spatialViewport, spatialPosition } from "./spatial";
import type { Hand } from "../types";
function hand(
  x: number,
  y = 0,
  gesture: Hand["gesture"] = "neutral",
  id = "left",
): Hand {
  const p = { x: x + 0.5, y: 0.5 - y, z: 0 };
  return {
    id,
    points: Array.from({ length: 21 }, () => p),
    center: p,
    gesture,
    pinchStart: false,
    size: 0.1,
    angle: 0,
    speed: 0,
  };
}
function rig() {
  const c = new SpatialController();
  let time = 0;
  return {
    c,
    step: (hands: Hand[]) => {
      c.update(hands, time, 0.05, false, 1);
      time += 50;
    },
  };
}
describe("ring manipulation", () => {
  it("accepts a pinch that pulls the fingertip slightly away from a recently touched ring", () => {
    const { c, step } = rig();
    step([hand(0.192)]);
    step([hand(0.145, 0, "pinch")]);
    expect(c.state).toBe("following");
    for (let i = 0; i < 10; i++) step([hand(0.245, 0, "pinch")]);
    expect(c.pose.x).toBeGreaterThan(0.09);
  });
  it("rejects distant and expired contact history", () => {
    const { c, step } = rig();
    step([hand(0.192)]);
    step([hand(0.4, 0, "pinch")]);
    expect(c.state).not.toBe("following");
    step([]);
    step([hand(0.192)]);
    for (let i = 0; i < 12; i++) step([hand(0)]);
    step([hand(0.145, 0, "pinch")]);
    expect(c.state).not.toBe("following");
  });
  it("freezes briefly on uncertain classification and resumes without a jump", () => {
    const { c, step } = rig();
    step([hand(0.192, 0, "pinch")]);
    step([hand(0.25, 0, "pinch")]);
    const pose = { ...c.pose };
    step([hand(0.3)]);
    expect(c.pose).toEqual(pose);
    step([hand(0.3, 0, "pinch")]);
    expect(c.pose.x).toBeCloseTo(pose.x, 12);
    for (let i = 0; i < 8; i++) step([hand(0.35, 0, "pinch")]);
    expect(c.pose.x).toBeGreaterThan(pose.x);
  });

  it("stays centered for free hand movement and highlights proximity only", () => {
    const { c, step } = rig();
    step([hand(0.192)]);
    expect(c.state).toBe("arming");
    expect(c.pose.x).toBe(0);
    step([hand(0.3)]);
    expect(c.state).toBe("held");
    expect(c.pose.x).toBe(0);
  });
  it("requires a new pinch on a ring, not an already pinching hand passing through", () => {
    const { c, step } = rig();
    step([hand(0.4, 0, "pinch")]);
    step([hand(0.192, 0, "pinch")]);
    expect(c.state).toBe("arming");
    step([hand(0.192)]);
    step([hand(0.192, 0, "pinch")]);
    expect(c.state).toBe("following");
  });
  it("drags at an offset without snapping and freezes on release", () => {
    const { c, step } = rig();
    step([hand(0.192, 0, "pinch")]);
    expect(c.pose.x).toBe(0);
    for (let i = 0; i < 10; i++) step([hand(0.292, 0, "pinch")]);
    expect(c.pose.x).toBeGreaterThan(0.09);
    const pose = { ...c.pose };
    step([hand(0.4, 0, "open")]);
    step([]);
    expect(c.pose).toEqual(pose);
  });
  it("freezes immediately on fist", () => {
    const { c, step } = rig();
    step([hand(0.192, 0, "pinch")]);
    step([hand(0.292, 0, "pinch")]);
    const pose = { ...c.pose };
    step([hand(-0.3, 0, "fist")]);
    expect(c.pose).toEqual(pose);
  });
  it("two pinches on the cyan ring scale independently of position and allow shrink", () => {
    const { c, step } = rig();
    step([hand(0.192, 0, "pinch"), hand(-0.192, 0, "pinch", "right")]);
    expect(c.state).toBe("scaling");
    for (let i = 0; i < 12; i++)
      step([hand(0.384, 0, "pinch"), hand(-0.384, 0, "pinch", "right")]);
    expect(c.pose.scale).toBeGreaterThan(1.9);
    expect(c.pose.x).toBe(0);
    for (let i = 0; i < 12; i++)
      step([hand(0.096, 0, "pinch"), hand(-0.096, 0, "pinch", "right")]);
    expect(c.pose.scale).toBeLessThan(0.6);
  });
  it("requires the second pinch to contact the movement ring", () => {
    const { c, step } = rig();
    step([hand(0.192, 0, "pinch"), hand(-0.4, 0, "pinch", "right")]);
    expect(c.state).toBe("following");
    expect(c.pose.scale).toBe(1);
  });
  it("rotates on the outer ring and unwraps angles across the pi boundary", () => {
    const { c, step } = rig();
    step([hand(0.264, 0, "pinch")]);
    expect(c.state).toBe("rotating");
    for (let i = 1; i <= 40; i++) {
      const a = i * 0.1;
      step([hand(Math.cos(a) * 0.264, Math.sin(a) * 0.264, "pinch")]);
    }
    expect(c.pose.roll).toBeGreaterThan(3.5);
    expect(c.pose.x).toBe(0);
    expect(c.pose.scale).toBe(1);
  });
  it("stale observations and losing either grip stop manipulation", () => {
    const { c, step } = rig();
    const hands = [hand(0.192, 0, "pinch")];
    step(hands);
    c.update(hands, 500, 0.05, false, 1);
    expect(c.state).toBe("held");
    step([]);
    step([hand(0.192, 0, "pinch"), hand(-0.192, 0, "pinch", "right")]);
    step([hand(0.192, 0, "pinch")]);
    expect(c.state).toBe("held");
  });
});
describe("camera-aligned perspective", () => {
  for (const [width, height] of [
    [1000, 500],
    [400, 800],
  ]) {
    it(`preserves contain projection at every virtual depth in ${width}x${height}`, () => {
      const view = spatialViewport(640, 480, width, height);
      const camera = new PerspectiveCamera(view.fov, width / height, 0.1, 5000);
      camera.position.z = view.focal;
      camera.updateMatrixWorld();
      const sizes = [];
      for (const depth of [0.7, 1, 1.65]) {
        const pose = { x: 0.2, y: -0.1, depth, scale: 1, roll: 0 };
        const p = spatialPosition(pose, view);
        const projected = new Vector3(p.x, p.y, p.z).project(camera);
        expect((projected.x * width) / 2).toBeCloseTo(pose.x * view.videoWidth);
        expect((projected.y * height) / 2).toBeCloseTo(
          pose.y * view.videoHeight,
        );
        const edge = new Vector3(p.x + 100, p.y, p.z).project(camera);
        sizes.push(edge.x - projected.x);
      }
      expect(sizes[0]).toBeGreaterThan(sizes[1]);
      expect(sizes[1]).toBeGreaterThan(sizes[2]);
    });
  }
});
