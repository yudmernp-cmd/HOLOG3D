import type { Hand, Point } from "../types";
import { displayX } from "./orientation";
const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export class GestureRecognizer {
  private previous = new Map<string, { hand: Hand; time: number }>();
  reset() {
    this.previous.clear();
  }
  update(
    points: Point[],
    id: string,
    time: number,
    sensitivity = 1,
    aspect = 1,
  ): Hand {
    const old = this.previous.get(id);
    const valid = old && time - old.time < 250 ? old : undefined;
    const metric = points.map((p) => ({
      ...p,
      x: p.x * aspect,
      z: p.z * aspect,
    }));
    const size = Math.max(0.015, distance(metric[0], metric[9]));
    const pinch = distance(metric[4], metric[8]) / size;
    const extended = [8, 12, 16, 20].filter(
      (t) =>
        distance(metric[t], metric[0]) >
        distance(metric[t - 2], metric[0]) * 1.18,
    ).length;
    const threshold = 0.32 * sensitivity;
    // Folded fingers mean a fist even when thumb and index happen to touch.
    const gesture: Hand["gesture"] =
      extended === 0
        ? "fist"
        : pinch <
            (valid?.hand.gesture === "pinch" ? threshold * 1.4 : threshold)
          ? "pinch"
          : extended === 4
            ? "open"
            : "neutral";
    const raw = {
      x: (points[0].x + points[9].x) / 2,
      y: (points[0].y + points[9].y) / 2,
      z: points[9].z,
    };
    const dt = valid ? Math.max(0.001, (time - valid.time) / 1000) : 0.033;
    const alpha = 1 - Math.exp(-dt * 15);
    const center = valid
      ? {
          x: valid.hand.center.x + (raw.x - valid.hand.center.x) * alpha,
          y: valid.hand.center.y + (raw.y - valid.hand.center.y) * alpha,
          z: raw.z,
        }
      : raw;
    const hand: Hand = {
      id,
      points,
      gesture,
      pinchStart: gesture === "pinch" && valid?.hand.gesture !== "pinch",
      center,
      size,
      angle: Math.atan2(metric[5].y - metric[17].y, metric[5].x - metric[17].x),
      speed: valid ? Math.min(4, distance(center, valid.hand.center) / dt) : 0,
    };
    this.previous.set(id, { hand, time });
    return hand;
  }
}
/** Match object-fit:contain exactly; mirror only once. Virtual depth is not metric depth. */
export function project(
  p: Point,
  vw: number,
  vh: number,
  width: number,
  height: number,
  mirror: boolean,
) {
  const scale = Math.min(width / vw, height / vh);
  return {
    x: (displayX(p.x, mirror) - 0.5) * vw * scale,
    y: (0.5 - p.y) * vh * scale,
    z: -p.z * vw * scale,
  };
}
