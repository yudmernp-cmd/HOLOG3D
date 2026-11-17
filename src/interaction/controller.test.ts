import { describe, it, expect } from "vitest";
import { InteractionController, arcball, type Contact } from "./controller";
const hand = (
  id: string,
  x: number,
  y = 0,
  pinch = true,
  hit = true,
): Contact => ({ id, x, y, pinch, hit, near: hit });
function setup(mode: "move" | "rotate" | "combined" = "move") {
  const c = new InteractionController(mode);
  let now = 0;
  const step = (hands: Contact[], ms = 50) => {
    now += ms;
    c.step(hands, now, ms / 1000, 100, 800, 600);
  };
  return { c, step };
}
describe("direct manipulation scenarios", () => {
  it("free hands and outside pinches cannot move or acquire on entering already pinched", () => {
    const { c, step } = setup();
    step([hand("a", 100, 20, false)]);
    expect(c.state).toBe("CONTACT");
    step([hand("a", 400, 20, true, false)]);
    step([hand("a", 0)]);
    expect(c.grips.size).toBe(0);
    expect(c.position.length()).toBe(0);
    expect(c.scale).toBe(1);
  });
  it("surface pinch grabs with offset and release preserves the last displayed transform", () => {
    const { c, step } = setup();
    step([hand("a", 50)]);
    expect(c.state).toBe("GRABBING");
    expect(c.position.x).toBe(0);
    for (let i = 0; i < 10; i++) step([hand("a", 150, 40)]);
    expect(c.position.x).toBeCloseTo(100, 2);
    expect(c.position.y).toBeCloseTo(40, 2);
    const held = c.position.clone();
    step([hand("a", 160, 40, false)]);
    expect(c.state).toBe("RELEASE");
    step([]);
    expect(c.position.equals(held)).toBe(true);
  });
  it("jitter stays in the dead zone and translation never rotates", () => {
    const { c, step } = setup();
    step([hand("a", 0)]);
    for (let i = 0; i < 40; i++) step([hand("a", i % 2 ? 1 : -1, 1)]);
    expect(c.position.length()).toBe(0);
    expect(c.rotation.w).toBe(1);
  });
  it("dead zone also stabilizes a hand after deliberate translation", () => {
    const { c, step } = setup();
    step([hand("a", 0)]);
    for (let i = 0; i < 20; i++) step([hand("a", 70)]);
    for (let i = 0; i < 40; i++) step([hand("a", 70 + (i % 2 ? 1 : -1), 1)]);
    expect(c.position.x).toBeCloseTo(70, 6);
    expect(c.position.y).toBe(0);
  });
  it("arcball rotates in 3D without translating and holds orientation on release", () => {
    const { c, step } = setup("rotate");
    step([hand("a", 0)]);
    for (let i = 0; i < 10; i++) step([hand("a", 50, 35)]);
    expect(Math.abs(c.rotation.x)).toBeGreaterThan(0.1);
    expect(Math.abs(c.rotation.y)).toBeGreaterThan(0.1);
    expect(c.rotation.length()).toBeCloseTo(1);
    expect(c.position.length()).toBe(0);
    const q = c.rotation.clone();
    step([hand("a", 50, 35, false)]);
    step([]);
    expect(c.rotation.equals(q)).toBe(true);
    expect(arcball(500, 500, 100).length()).toBeCloseTo(1);
  });
  it("two valid grabs scale relatively around a stable center, with limits", () => {
    const { c, step } = setup();
    step([hand("a", -50), hand("b", 50)]);
    for (let i = 0; i < 10; i++) step([hand("a", -100), hand("b", 100)]);
    expect(c.scale).toBeCloseTo(2, 2);
    expect(c.position.length()).toBe(0);
    for (let i = 0; i < 10; i++) step([hand("a", -25), hand("b", 25)]);
    expect(c.scale).toBeCloseTo(0.5, 2);
    for (let i = 0; i < 10; i++) step([hand("a", -500), hand("b", 500)]);
    expect(c.scale).toBeLessThanOrEqual(2.5);
    const held = c.scale;
    step([], 300);
    step([]);
    expect(c.scale).toBe(held);
  });
  it("rejects outside second grab and unstable short-distance scaling", () => {
    const { c, step } = setup();
    step([hand("a", 0), hand("b", 200, 0, true, false)]);
    expect(c.grips.size).toBe(1);
    const other = setup();
    other.step([hand("a", 0), hand("b", 1)]);
    other.step([hand("a", -100), hand("b", 100)]);
    expect(other.c.scale).toBe(1);
  });
  it("brief loss freezes and recovery rebases, prolonged loss releases without reacquiring a held pinch", () => {
    const { c, step } = setup();
    step([hand("a", 0)]);
    step([hand("a", 40)]);
    const held = c.position.clone();
    step([]);
    expect(c.position.equals(held)).toBe(true);
    step([hand("a", 200)]);
    expect(c.position.equals(held)).toBe(true);
    step([], 300);
    expect(c.state).toBe("RELEASE");
    step([hand("a", 210)]);
    expect(c.grips.size).toBe(0);
    step([hand("a", 210, 0, false)]);
    step([hand("a", 210)]);
    expect(c.grips.size).toBe(1);
  });
  it("adding and releasing a second hand rebases without jumps", () => {
    const { c, step } = setup();
    step([hand("a", 0)]);
    step([hand("a", 50)]);
    const held = c.position.clone();
    step([hand("a", 50), hand("b", 100)]);
    expect(c.position.equals(held)).toBe(true);
    step([hand("a", 50), hand("b", 100, 0, false)]);
    expect(c.position.equals(held)).toBe(true);
  });
  it("combined mode translates midpoint, scales distance and rotates the grip vector", () => {
    const { c, step } = setup("combined");
    step([hand("a", -50), hand("b", 50)]);
    for (let i = 0; i < 10; i++)
      step([hand("a", 20, -100), hand("b", 20, 100)]);
    expect(c.position.x).toBeCloseTo(20, 2);
    expect(c.scale).toBeCloseTo(2, 2);
    expect(c.rotation.z).toBeCloseTo(Math.SQRT1_2, 2);
  });
  it("context changes require releasing the old pinch", () => {
    const { c, step } = setup();
    step([hand("a", 0)]);
    c.cancel();
    step([hand("a", 10)]);
    expect(c.grips.size).toBe(0);
    step([hand("a", 10, 0, false)]);
    step([hand("a", 10)]);
    expect(c.grips.size).toBe(1);
  });
});
