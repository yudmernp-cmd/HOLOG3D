import type { Hand } from "../types";

export type SpatialState =
  "held" | "calibrating" | "arming" | "following" | "scaling";
export type SpatialPose = {
  x: number;
  y: number;
  depth: number;
  scale: number;
  roll: number;
};
export const spatialLimits = {
  near: 0.7,
  far: 1.65,
  openDwell: 180,
  calibrationDwell: 650,
};
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const initialPose = (): SpatialPose => ({
  x: 0,
  y: 0,
  depth: 1,
  scale: 1,
  roll: 0,
});
const deadband = (current: number, next: number, band: number) =>
  Math.abs(next - current) > band
    ? next - Math.sign(next - current) * band
    : current;
const angleDifference = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Approximate visible palm extent, in units of video height; not physical distance. */
export function palmMeasure(hand: Hand, aspect: number) {
  const length = (a: number, b: number) =>
    Math.hypot(
      (hand.points[a].x - hand.points[b].x) * aspect,
      hand.points[a].y - hand.points[b].y,
    );
  return Math.max(0.015, (length(0, 9) + length(5, 17)) * 0.5);
}
function frontal(hand: Hand, aspect: number) {
  return (
    (Math.max(
      Math.abs(hand.points[5].z - hand.points[17].z),
      Math.abs(hand.points[0].z - hand.points[9].z),
    ) *
      aspect) /
      hand.size <
    0.6
  );
}
function center(hand: Hand, mirror: boolean) {
  return {
    x: (mirror ? 1 - hand.center.x : hand.center.x) - 0.5,
    y: 0.5 - hand.center.y,
  };
}
function separation(hands: Hand[], aspect: number) {
  return Math.hypot(
    (hands[0].center.x - hands[1].center.x) * aspect,
    hands[0].center.y - hands[1].center.y,
  );
}

/** Pure, frame-rate independent controller. Rendering and inference remain separate. */
export class SpatialController {
  pose = initialPose();
  state: SpatialState = "held";
  calibrated = false;
  radius = 0.16;
  private target = initialPose();
  private needsCalibration = true;
  private calibration?: {
    x: number;
    y: number;
    size: number;
    sum: number;
    count: number;
    since: number;
  };
  private candidate = "";
  private since = 0;
  private samples = 0;
  private driver?: string;
  private grip?: {
    center: { x: number; y: number };
    pose: SpatialPose;
    size: number;
    angle: number;
    separation: number;
    dual: boolean;
  };
  private previousHands?: Hand[];
  private lastSample = 0;

  /** Freeze at the rendered pose, not the pending filtered target. */
  hold() {
    this.target = { ...this.pose };
    this.grip = undefined;
    this.candidate = "";
    this.samples = 0;
    this.state = "held";
  }
  recalibrate() {
    this.hold();
    this.calibration = undefined;
    this.needsCalibration = true;
    this.calibrated = false;
  }
  reset() {
    this.pose = initialPose();
    this.radius = 0.16;
    this.driver = undefined;
    this.recalibrate();
  }
  movePointer(x: number, y: number, dt: number) {
    this.hold();
    this.state = "following";
    const alpha = 1 - Math.exp(-Math.min(dt, 0.05) * 14);
    this.pose.x += (clamp(x, -0.48, 0.48) - this.pose.x) * alpha;
    this.pose.y += (clamp(y, -0.48, 0.48) - this.pose.y) * alpha;
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
    const hand = hands.find((h) => h.id === this.driver) ?? hands[0];
    // A closed fist takes priority over pinch and over a second open hand.
    if (
      !hand ||
      hands.some((h) => h.gesture === "fist") ||
      hand.gesture !== "open" ||
      now - this.lastSample > 350
    ) {
      this.hold();
      this.calibration = undefined;
      return;
    }
    const point = center(hand, mirror);
    const size = palmMeasure(hand, aspect);
    if (this.needsCalibration) {
      this.state = "calibrating";
      if (!frontal(hand, aspect)) {
        this.calibration = undefined;
        return;
      }
      if (!fresh) return;
      const c = this.calibration;
      if (
        !c ||
        Math.hypot(point.x - c.x, point.y - c.y) > 0.035 ||
        Math.abs(size / c.size - 1) > 0.08
      ) {
        this.calibration = { ...point, size, sum: size, count: 1, since: now };
        return;
      }
      c.sum += size;
      c.count++;
      if (now - c.since >= spatialLimits.calibrationDwell && c.count >= 4) {
        this.radius = clamp((c.sum / c.count) * 1.1, 0.1, 0.22);
        this.calibrated = true;
        this.needsCalibration = false;
        this.calibration = undefined;
        this.driver = hand.id;
        this.hold();
      }
      return;
    }
    const dual = hands.length === 2 && hands.every((h) => h.gesture === "open");
    const key = hand.id + (dual ? ":dual" : ":single");
    if (key !== this.candidate) {
      this.hold();
      this.candidate = key;
      this.since = now;
      this.samples = fresh ? 1 : 0;
      this.state = "arming";
    } else if (fresh) {
      this.samples++;
    }
    if (!this.grip) {
      this.state = "arming";
      if (now - this.since < spatialLimits.openDwell || this.samples < 3)
        return;
      this.driver = hand.id;
      this.grip = {
        center: point,
        pose: { ...this.pose },
        size,
        angle: hand.angle,
        separation: dual ? Math.max(0.08, separation(hands, aspect)) : 1,
        dual,
      };
      this.target = { ...this.pose };
    }
    const grip = this.grip;
    this.state = grip.dual ? "scaling" : "following";
    if (grip.dual) {
      // Two open hands scale only: no competing translation/depth gestures.
      this.target.scale = deadband(
        this.target.scale,
        clamp(
          (grip.pose.scale * separation(hands, aspect)) / grip.separation,
          0.65,
          1.65,
        ),
        0.025,
      );
    } else {
      this.target.x = deadband(
        this.target.x,
        clamp(grip.pose.x + point.x - grip.center.x, -0.48, 0.48),
        0.004,
      );
      this.target.y = deadband(
        this.target.y,
        clamp(grip.pose.y + point.y - grip.center.y, -0.48, 0.48),
        0.004,
      );
      // Foreshortening when the palm tilts must not act as a sudden depth change.
      if (frontal(hand, aspect))
        this.target.depth = deadband(
          this.target.depth,
          clamp(
            (grip.pose.depth * grip.size) / size,
            spatialLimits.near,
            spatialLimits.far,
          ),
          0.035,
        );
      this.target.roll = deadband(
        this.target.roll,
        clamp(
          grip.pose.roll +
            angleDifference(hand.angle, grip.angle) * (mirror ? -1 : 1),
          -0.65,
          0.65,
        ),
        0.06,
      );
    }
    const seconds = clamp(dt, 0, 0.05);
    const motion = Math.hypot(
      this.target.x - this.pose.x,
      this.target.y - this.pose.y,
    );
    const alpha = 1 - Math.exp(-seconds * (10 + Math.min(20, motion * 100)));
    for (const key of ["x", "y", "depth", "scale", "roll"] as const) {
      const maxSpeed = key === "depth" ? 0.7 : key === "scale" ? 1.2 : 1.8;
      this.pose[key] += clamp(
        (this.target[key] - this.pose[key]) * alpha,
        -maxSpeed * seconds,
        maxSpeed * seconds,
      );
    }
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
