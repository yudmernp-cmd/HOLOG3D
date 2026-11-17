import type { Hand, Point } from "../types";
import { LandmarkFilter } from "./smoothing";
const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
type Gesture = Hand["gesture"];
type History = {
  hand: Hand;
  time: number;
  aspect: number;
  filters: LandmarkFilter[];
  fingers: boolean[];
  candidate: Gesture;
  since: number;
  samples: number;
};
export class GestureRecognizer {
  private previous = new Map<string, History>();
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
    for (const [key, history] of this.previous) {
      if (time - history.time > 1000) this.previous.delete(key);
    }
    const old = this.previous.get(id);
    const valid =
      old && time > old.time && time - old.time < 350 && aspect === old.aspect
        ? old
        : undefined;
    const dt = valid ? Math.max(0.001, (time - valid.time) / 1000) : 0.05;
    // Classify raw geometry, then stabilize the decision; filtering the geometry
    // before classification can leave a phantom pinch after the fingers open.
    const metric = points.map((p) => ({
      ...p,
      x: p.x * aspect,
      z: p.z * aspect,
    }));
    const size = Math.max(0.015, distance(metric[0], metric[9]));
    const pinch = distance(metric[4], metric[8]) / size;
    const fingers = [8, 12, 16, 20].map((tip, index) => {
      const ratio =
        distance(metric[tip], metric[0]) /
        Math.max(0.001, distance(metric[tip - 2], metric[0]));
      return ratio > (valid ? (valid.fingers[index] ? 1.1 : 1.24) : 1.18);
    });
    const extended = fingers.filter(Boolean).length;
    const threshold = 0.32 * sensitivity;
    const candidate: Gesture =
      pinch < (valid?.hand.gesture === "pinch" ? threshold * 1.4 : threshold)
        ? "pinch"
        : extended === 4
          ? "open"
          : extended === 0
            ? "fist"
            : "neutral";
    const since = valid?.candidate === candidate ? valid.since : time;
    const samples = valid?.candidate === candidate ? valid.samples + 1 : 1;
    const clearPinchRelease =
      valid?.hand.gesture === "pinch" && pinch > threshold * 1.8;
    const gesture =
      !valid ||
      candidate === valid.hand.gesture ||
      clearPinchRelease ||
      (samples >= 2 && time - since >= 35)
        ? candidate
        : valid.hand.gesture;
    const filters =
      valid?.filters ?? points.map((p) => new LandmarkFilter(p, aspect));
    const smooth = valid
      ? points.map((p, i) => filters[i].update(p, dt))
      : points.map((p) => ({ ...p }));
    const center = {
      x: (smooth[0].x + smooth[9].x) / 2,
      y: (smooth[0].y + smooth[9].y) / 2,
      z: smooth[9].z,
    };
    const rawAngle = Math.atan2(
      smooth[5].y - smooth[17].y,
      (smooth[5].x - smooth[17].x) * aspect,
    );
    const angle = valid
      ? valid.hand.angle +
        Math.atan2(
          Math.sin(rawAngle - valid.hand.angle),
          Math.cos(rawAngle - valid.hand.angle),
        )
      : rawAngle;
    const hand: Hand = {
      id,
      points: smooth,
      gesture,
      pinchStart: gesture === "pinch" && valid?.hand.gesture !== "pinch",
      center,
      size,
      angle,
      speed: valid ? Math.min(4, distance(center, valid.hand.center) / dt) : 0,
    };
    this.previous.set(id, {
      hand,
      time,
      aspect,
      filters,
      fingers,
      candidate,
      since,
      samples,
    });
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
    x: ((mirror ? 1 - p.x : p.x) - 0.5) * vw * scale,
    y: (0.5 - p.y) * vh * scale,
    z: -p.z * vw * scale,
  };
}
