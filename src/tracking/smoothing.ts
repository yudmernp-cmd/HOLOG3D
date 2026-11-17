import type { Point } from "../types";

/** One Euro filter: steadier at rest, more responsive during deliberate motion. */
export class AdaptiveFilter {
  private filtered: number;
  private raw: number;
  private velocity = 0;
  constructor(
    value: number,
    private minCutoff = 2,
    private beta = 8,
  ) {
    this.filtered = this.raw = value;
  }
  update(value: number, dt: number) {
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const velocity = (value - this.raw) / dt;
    this.raw = value;
    this.velocity += alpha(1) * (velocity - this.velocity);
    this.filtered +=
      alpha(this.minCutoff + this.beta * Math.abs(this.velocity)) *
      (value - this.filtered);
    return this.filtered;
  }
}
export class LandmarkFilter {
  private x: AdaptiveFilter;
  private y: AdaptiveFilter;
  private z: AdaptiveFilter;
  constructor(
    p: Point,
    private aspect: number,
  ) {
    this.x = new AdaptiveFilter(p.x * aspect);
    this.y = new AdaptiveFilter(p.y);
    this.z = new AdaptiveFilter(p.z * aspect);
  }
  update(p: Point, dt: number): Point {
    return {
      x: this.x.update(p.x * this.aspect, dt) / this.aspect,
      y: this.y.update(p.y, dt),
      z: this.z.update(p.z * this.aspect, dt) / this.aspect,
    };
  }
}
