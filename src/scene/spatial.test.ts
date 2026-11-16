import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { SpatialController, spatialViewport, spatialPosition } from "./spatial";
import type { Hand } from "../types";

function hand(
  gesture: Hand["gesture"] = "open",
  x = 0.5,
  y = 0.55,
  size = 1,
  id = "Left",
): Hand {
  const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  points[0] = { x, y: y + 0.1 * size, z: 0 };
  points[9] = { x, y: y - 0.1 * size, z: 0 };
  points[5] = { x: x - 0.06 * size, y: y - 0.07 * size, z: 0 };
  points[17] = { x: x + 0.06 * size, y: y - 0.07 * size, z: 0 };
  return {
    id,
    points,
    gesture,
    pinchStart: false,
    center: { x, y, z: 0 },
    angle: 0,
    size: 0.2 * size,
    speed: 0,
  };
}
function rig() {
  const control = new SpatialController();
  let now = 0;
  const step = (hands: Hand[]) => {
    control.update(hands, now, 0.05, false, 4 / 3);
    now += 50;
  };
  for (let i = 0; i < 22; i++) step([hand()]);
  expect(control.calibrated).toBe(true);
  expect(control.state).toBe("following");
  return { control, step };
}
describe("intentional spatial manipulation", () => {
  it("requires stable observations for calibration, not repeated rendering of one sample", () => {
    const c = new SpatialController();
    const sample = [hand()];
    for (let t = 0; t < 1000; t += 16) c.update(sample, t, 0.016, false, 4 / 3);
    expect(c.calibrated).toBe(false);
    expect(c.pose.x).toBe(0);
  });
  it("does not calibrate while the open palm is moving", () => {
    const c = new SpatialController();
    for (let t = 0; t < 1500; t += 50)
      c.update(
        [hand("open", t % 100 === 0 ? 0.3 : 0.7)],
        t,
        0.05,
        false,
        4 / 3,
      );
    expect(c.calibrated).toBe(false);
  });
  it("freezes position, depth, scale and roll immediately on a fist and on tracking loss", () => {
    const { control: c, step } = rig();
    for (let i = 0; i < 12; i++) step([hand("open", 0.7, 0.45, 1.2)]);
    expect(c.pose.x).toBeGreaterThan(0.1);
    expect(c.pose.depth).toBeLessThan(1);
    const fixed = { ...c.pose };
    for (let i = 0; i < 10; i++) step([hand("fist", 0.1, 0.9, 0.5)]);
    expect(c.pose).toEqual(fixed);
    expect(c.state).toBe("held");
    for (let i = 0; i < 10; i++) step([]);
    expect(c.pose).toEqual(fixed);
  });
  it("regrabs at an offset without teleporting and ignores brief accidental opening", () => {
    const { control: c, step } = rig();
    for (let i = 0; i < 10; i++) step([hand("open", 0.7)]);
    step([hand("fist")]);
    const fixed = { ...c.pose };
    step([hand("open", 0.1)]);
    step([hand("fist", 0.1)]);
    expect(c.pose).toEqual(fixed);
    for (let i = 0; i < 8; i++) step([hand("open", 0.1)]);
    expect(c.pose).toEqual(fixed);
    expect(c.state).toBe("following");
    for (let i = 0; i < 8; i++) step([hand("open", 0.2)]);
    expect(c.pose.x).toBeGreaterThan(fixed.x + 0.03);
  });
  it("suppresses sub-deadzone hand tremor", () => {
    const { control: c, step } = rig();
    for (let i = 0; i < 40; i++)
      step([
        hand(
          "open",
          0.5 + (i % 2 ? 0.002 : -0.002),
          0.55,
          1 + (i % 2 ? 0.01 : -0.01),
        ),
      ]);
    expect(c.pose).toEqual({ x: 0, y: 0, depth: 1, scale: 1, roll: 0 });
  });
  it("changes virtual depth rather than geometry scale and rejects tilted-palm depth changes", () => {
    const { control: c, step } = rig();
    for (let i = 0; i < 30; i++) step([hand("open", 0.5, 0.55, 1.4)]);
    expect(c.pose.depth).toBeLessThan(0.8);
    expect(c.pose.scale).toBe(1);
    step([hand("fist")]);
    for (let i = 0; i < 8; i++) step([hand("open", 0.5, 0.55, 1.4)]);
    const before = c.pose.depth;
    for (let i = 0; i < 20; i++) {
      const h = hand("open", 0.5, 0.55, 0.6);
      h.points[5].z = 0.25;
      step([h]);
    }
    expect(c.pose.depth).toBeCloseTo(before);
  });
  it("two deliberate open palms scale only; either fist freezes everything", () => {
    const { control: c, step } = rig();
    for (let i = 0; i < 6; i++)
      step([hand("open", 0.3), hand("open", 0.7, 0.55, 1, "Right")]);
    const fixed = { ...c.pose };
    expect(c.state).toBe("scaling");
    for (let i = 0; i < 15; i++)
      step([hand("open", 0.15), hand("open", 0.85, 0.55, 1, "Right")]);
    expect(c.pose.scale).toBeGreaterThan(1.3);
    expect(c.pose.x).toBe(fixed.x);
    expect(c.pose.depth).toBe(fixed.depth);
    const scaled = { ...c.pose };
    step([hand("open", 0.1), hand("fist", 0.9, 0.55, 1, "Right")]);
    expect(c.state).toBe("held");
    expect(c.pose).toEqual(scaled);
  });
  it("freezes if an open-hand observation becomes stale", () => {
    const { control: c } = rig();
    const hands = [hand("open", 0.7)];
    c.update(hands, 1500, 0.05, false, 4 / 3);
    c.update(hands, 1900, 0.05, false, 4 / 3);
    const pose = { ...c.pose };
    c.update(hands, 2200, 0.05, false, 4 / 3);
    expect(c.state).toBe("held");
    expect(c.pose).toEqual(pose);
  });
  it("supports recalibration without relocating a suspended object", () => {
    const { control: c, step } = rig();
    for (let i = 0; i < 10; i++) step([hand("open", 0.7)]);
    const pose = { ...c.pose };
    c.recalibrate();
    for (let i = 0; i < 22; i++) step([hand("open", 0.2, 0.4, 0.8)]);
    expect(c.calibrated).toBe(true);
    expect(c.pose).toEqual(pose);
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
