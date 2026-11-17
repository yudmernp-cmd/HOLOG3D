import { Quaternion, Vector3, MathUtils } from "three";
export type InteractionState =
  "IDLE" | "HOVER" | "CONTACT" | "GRABBING" | "TRANSFORMING" | "RELEASE";
export type Manipulation = "move" | "rotate" | "combined";
export type Contact = {
  id: string;
  x: number;
  y: number;
  pinch: boolean;
  hit: boolean;
  near: boolean;
};
type Grip = { start: Vector3; current: Vector3; seen: number };
export function arcball(
  x: number,
  y: number,
  radius: number,
  v = new Vector3(),
) {
  v.set(x / radius, y / radius, 0);
  const length = v.lengthSq();
  if (length <= 1) v.z = Math.sqrt(1 - length);
  else v.normalize();
  return v;
}
/** Screen-plane virtual contact; deliberately makes no metric depth claim. */
export class InteractionController {
  state: InteractionState = "IDLE";
  position = new Vector3();
  rotation = new Quaternion();
  scale = 1;
  grips = new Map<string, Grip>();
  private previousPinch = new Map<string, boolean>();
  private lastSeen = new Map<string, number>();
  private origin = new Vector3();
  private orientation = new Quaternion();
  private initialScale = 1;
  private suspended = false;
  private blocked = false;
  private targetPosition = new Vector3();
  private targetRotation = new Quaternion();
  private initialVector = new Vector3();
  private currentVector = new Vector3();
  private delta = new Vector3();
  private turn = new Quaternion();
  private zAxis = new Vector3(0, 0, 1);
  constructor(
    public mode: Manipulation = "move",
    public graceMs = 280,
  ) {}
  reset() {
    this.position.set(0, 0, 0);
    this.rotation.identity();
    this.scale = 1;
    this.cancel();
  }
  cancel() {
    this.grips.clear();
    this.state = "RELEASE";
    this.suspended = false;
    // A held pinch must be opened before grabbing after a context change.
    this.blocked = true;
  }
  private rebase() {
    this.origin.copy(this.position);
    this.orientation.copy(this.rotation);
    this.initialScale = this.scale;
    for (const grip of this.grips.values()) grip.start.copy(grip.current);
  }
  step(
    contacts: Contact[],
    now: number,
    dt: number,
    radius: number,
    width: number,
    height: number,
    sensitivity = 1,
  ) {
    for (const [id, seen] of this.lastSeen) {
      if (now - seen > 1500 && !this.grips.has(id)) {
        this.lastSeen.delete(id);
        this.previousPinch.delete(id);
      }
    }
    if (this.blocked && !contacts.some((c) => c.pinch)) this.blocked = false;
    let changed = false,
      missing = false;
    for (const [id, grip] of this.grips) {
      const c = contacts.find((c) => c.id === id);
      if (!c) {
        if (now - grip.seen > this.graceMs) {
          this.grips.delete(id);
          changed = true;
        } else missing = true;
      } else if (!c.pinch) {
        this.grips.delete(id);
        changed = true;
      } else {
        if (
          Math.hypot(c.x - grip.current.x, c.y - grip.current.y) >
          2.5 / sensitivity
        )
          grip.current.set(c.x, c.y, 0);
        grip.seen = now;
      }
    }
    for (const c of contacts) {
      if (
        !this.blocked &&
        c.pinch &&
        !this.previousPinch.get(c.id) &&
        c.hit &&
        !this.grips.has(c.id)
      ) {
        const p = new Vector3(c.x, c.y, 0);
        this.grips.set(c.id, { start: p.clone(), current: p, seen: now });
        changed = true;
      }
      this.previousPinch.set(c.id, c.pinch);
      this.lastSeen.set(c.id, now);
    }
    // Keep pinch latches through disappearance: reacquisition cannot silently re-grab.
    if (missing) {
      this.suspended = true;
      return;
    }
    if (changed || this.suspended) {
      this.rebase();
      this.suspended = false;
      this.state = this.grips.size ? "GRABBING" : "RELEASE";
      return;
    }
    if (!this.grips.size) {
      this.state = contacts.some((c) => c.hit)
        ? "CONTACT"
        : contacts.some((c) => c.near)
          ? "HOVER"
          : "IDLE";
      return;
    }
    const iterator = this.grips.values();
    const a = iterator.next().value!;
    const b = iterator.next().value;
    const position = this.targetPosition.copy(this.origin);
    const rotation = this.targetRotation.copy(this.orientation);
    let scale = this.initialScale;
    const dead = 2.5 / sensitivity;
    if (b) {
      const initial = this.initialVector.subVectors(b.start, a.start),
        current = this.currentVector.subVectors(b.current, a.current);
      if (initial.length() < 24 || current.length() < 8) return;
      if (Math.abs(current.length() - initial.length()) > dead * 2)
        scale = MathUtils.clamp(
          (this.initialScale * current.length()) / initial.length(),
          0.3,
          2.5,
        );
      if (this.mode === "combined") {
        const delta = this.delta
          .copy(a.current)
          .add(b.current)
          .sub(a.start)
          .sub(b.start)
          .multiplyScalar(0.5);
        if (delta.length() > dead) position.add(delta);
        const angle =
          Math.atan2(current.y, current.x) - Math.atan2(initial.y, initial.x);
        if (Math.abs(angle) > 0.02)
          rotation.premultiply(this.turn.setFromAxisAngle(this.zAxis, angle));
      }
    } else {
      const delta = this.delta.subVectors(a.current, a.start);
      if (delta.length() > dead) {
        if (this.mode === "rotate") {
          const start = arcball(
            a.start.x - this.origin.x,
            a.start.y - this.origin.y,
            radius * this.initialScale,
            this.initialVector,
          );
          const end = arcball(
            a.current.x - this.origin.x,
            a.current.y - this.origin.y,
            radius * this.initialScale,
            this.currentVector,
          );
          rotation.premultiply(this.turn.setFromUnitVectors(start, end));
        } else position.add(delta);
      }
    }
    const margin = Math.min(radius * scale * 0.5, width * 0.4, height * 0.4);
    position.x = MathUtils.clamp(
      position.x,
      -width / 2 + margin,
      width / 2 - margin,
    );
    position.y = MathUtils.clamp(
      position.y,
      -height / 2 + margin,
      height / 2 - margin,
    );
    const alpha = 1 - Math.exp(-Math.min(dt, 0.05) * 30);
    this.position.lerp(position, alpha);
    this.rotation.slerp(rotation, alpha);
    this.scale += (scale - this.scale) * alpha;
    this.state = "TRANSFORMING";
  }
}
