import type { Hand } from "../types";
import { displayX } from "../tracking/orientation";
export type SpatialState =
  "held" | "arming" | "following" | "rotating" | "scaling";
export type SpatialPose = {
  x: number;
  y: number;
  depth: number;
  scale: number;
  roll: number;
};
export const ringRadii = { move: 1.2, rotate: 1.65 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const initial = (): SpatialPose => ({
  x: 0,
  y: 0,
  depth: 1,
  scale: 1,
  roll: 0,
});
type Cursor = { x: number; y: number };
type Grip = { point: Cursor; kind: "move" | "rotate" };
export class SpatialController {
  pose = initial();
  state: SpatialState = "held";
  calibrated = true;
  radius = 0.16;
  get handleUnit() {
    return Math.min((this.radius * this.pose.scale) / this.pose.depth, 0.23);
  }
  hover: "move" | "rotate" | null = null;
  cursors: Cursor[] = [];
  private grips = new Map<string, Grip>();
  private previousPinches = new Set<string>();
  private previousHands?: Hand[];
  private contacts = new Map<
    string,
    { kind: "move" | "rotate"; point: Cursor; time: number }
  >();
  private uncertainSince?: number;
  private lastSample = 0;
  private anchor = initial();
  private target = initial();
  private distance = 1;
  private angle = 0;
  hold() {
    this.grips.clear();
    this.contacts.clear();
    this.uncertainSince = undefined;
    this.target = { ...this.pose };
    this.hover = null;
    this.cursors = [];
    this.state = "held";
  }
  recalibrate() {
    this.hold();
  }
  reset() {
    this.pose = initial();
    this.previousPinches.clear();
    this.hold();
  }
  hit(point: Cursor, aspect: number): "move" | "rotate" | null {
    const distance = Math.hypot(
      (point.x - this.pose.x) * aspect,
      point.y - this.pose.y,
    );
    const unit = this.handleUnit;
    // Limit overlap between the handles, even when the object is small.
    const tolerance = Math.min(
      0.028,
      unit * (ringRadii.rotate - ringRadii.move) * 0.4,
    );
    if (Math.abs(distance - unit * ringRadii.move) < tolerance) return "move";
    if (Math.abs(distance - unit * ringRadii.rotate) < tolerance)
      return "rotate";
    return null;
  }
  updatePointer(
    x: number,
    y: number,
    down: boolean,
    now: number,
    dt: number,
    aspect: number,
  ) {
    const point = { x: x + 0.5, y: 0.5 - y, z: 0 };
    this.update(
      [
        {
          id: "mouse",
          points: Array.from({ length: 21 }, () => point),
          center: point,
          gesture: down ? "pinch" : "neutral",
          pinchStart: false,
          size: 0.1,
          angle: 0,
          speed: 0,
        },
      ],
      now,
      dt,
      false,
      aspect,
    );
  }
  update(
    hands: Hand[],
    now: number,
    dt: number,
    mirror: boolean,
    aspect: number,
  ) {
    const fresh = hands !== this.previousHands;
    if (fresh) {
      this.previousHands = hands;
      this.lastSample = now;
    }
    const points = new Map(
      hands.map((h) => [
        h.id,
        { x: displayX(h.points[8].x, mirror) - 0.5, y: 0.5 - h.points[8].y },
      ]),
    );
    const pinches = new Set(
      hands.filter((h) => h.gesture === "pinch").map((h) => h.id),
    );
    const missing = [...this.grips.keys()].some((id) => !points.has(id));
    const released = [...this.grips.keys()].some(
      (id) => hands.find((h) => h.id === id)?.gesture === "open",
    );
    if (
      !hands.length ||
      hands.some((h) => h.gesture === "fist") ||
      now - this.lastSample > 350 ||
      missing ||
      released
    ) {
      this.hold();
      this.previousPinches = pinches;
      return;
    }
    const uncertain = [...this.grips.keys()].some((id) => !pinches.has(id));
    if (uncertain) {
      this.uncertainSince ??= now;
      if (now - this.uncertainSince > 150) {
        this.hold();
        this.previousPinches = pinches;
      }
      return; // Brief ambiguity freezes the object instead of moving on uncertain input.
    }
    let changed = this.uncertainSince !== undefined;
    this.uncertainSince = undefined;
    this.hover = null;
    this.cursors = [...points.values()];
    for (const h of hands) {
      const point = points.get(h.id)!;
      let hit = this.hit(point, aspect);
      if (fresh && hit && !pinches.has(h.id))
        this.contacts.set(h.id, { kind: hit, point: { ...point }, time: now });
      const contact = this.contacts.get(h.id);
      if (
        !hit &&
        pinches.has(h.id) &&
        contact &&
        now - contact.time < 450 &&
        Math.hypot(
          (point.x - contact.point.x) * aspect,
          point.y - contact.point.y,
        ) < 0.12
      )
        hit = contact.kind;
      if (hit) this.hover = hit;
      if (
        fresh &&
        hit &&
        pinches.has(h.id) &&
        !this.previousPinches.has(h.id) &&
        !this.grips.has(h.id)
      ) {
        const current = [...this.grips.values()][0];
        if (
          !current ||
          (current.kind === "move" && hit === "move" && this.grips.size === 1)
        ) {
          this.grips.set(h.id, { point, kind: hit });
          this.contacts.delete(h.id);
          changed = true;
        }
      }
    }
    if (fresh) this.previousPinches = pinches;
    const entries = [...this.grips];
    if (changed) {
      this.anchor = { ...this.pose };
      this.target = { ...this.pose };
      for (const [id, grip] of entries) grip.point = points.get(id)!;
      if (entries.length === 2) {
        const a = entries[0][1].point,
          b = entries[1][1].point;
        this.distance = Math.max(
          0.04,
          Math.hypot((a.x - b.x) * aspect, a.y - b.y),
        );
      }
      if (entries.length === 1) {
        const p = entries[0][1].point;
        this.angle = Math.atan2(
          p.y - this.pose.y,
          (p.x - this.pose.x) * aspect,
        );
      }
    }
    if (entries.length === 2) {
      this.state = "scaling";
      const a = points.get(entries[0][0])!,
        b = points.get(entries[1][0])!;
      this.target.scale = clamp(
        (this.anchor.scale * Math.hypot((a.x - b.x) * aspect, a.y - b.y)) /
          this.distance,
        0.35,
        3,
      );
    } else if (entries.length === 1) {
      const [id, grip] = entries[0],
        p = points.get(id)!;
      if (grip.kind === "move") {
        this.state = "following";
        this.target.x = clamp(this.anchor.x + p.x - grip.point.x, -0.42, 0.42);
        this.target.y = clamp(this.anchor.y + p.y - grip.point.y, -0.42, 0.42);
      } else {
        this.state = "rotating";
        const angle = Math.atan2(
          p.y - this.pose.y,
          (p.x - this.pose.x) * aspect,
        );
        if (fresh) {
          this.target.roll += Math.atan2(
            Math.sin(angle - this.angle),
            Math.cos(angle - this.angle),
          );
          this.angle = angle;
        }
      }
    } else {
      this.state = this.hover ? "arming" : "held";
      return;
    }
    const alpha = 1 - Math.exp(-Math.min(0.05, dt) * 16);
    for (const key of ["x", "y", "scale", "roll"] as const)
      this.pose[key] += (this.target[key] - this.pose[key]) * alpha;
  }
}

/** Fixed virtual lens aligned to object-fit:contain, including letterboxing. */
export function spatialViewport(
  vw: number,
  vh: number,
  width: number,
  height: number,
) {
  const fit = Math.min(width / vw, height / vh);
  const videoWidth = vw * fit,
    videoHeight = vh * fit;
  const focal = videoHeight / (2 * Math.tan((50 * Math.PI) / 360));
  return {
    videoWidth,
    videoHeight,
    focal,
    fov: (2 * Math.atan(height / (2 * focal)) * 180) / Math.PI,
  };
}
export function spatialPosition(
  pose: SpatialPose,
  view: ReturnType<typeof spatialViewport>,
) {
  return {
    x: pose.x * view.videoWidth * pose.depth,
    y: pose.y * view.videoHeight * pose.depth,
    z: view.focal * (1 - pose.depth),
  };
}
