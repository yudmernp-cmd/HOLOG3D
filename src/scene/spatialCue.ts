import * as T from "three";
import type { SpatialState } from "./spatial";

/** A lightweight floating reference plane, not a detected floor or real-world anchor. */
export class SpatialCue extends T.Group {
  private material = new T.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  constructor() {
    super();
    const orbit = new T.Mesh(
      new T.TorusGeometry(1.2, 0.008, 5, 80),
      this.material,
    );
    orbit.rotation.x = Math.PI / 2;
    orbit.position.y = -1.15;
    this.add(orbit);
    const core = new T.Mesh(new T.RingGeometry(0.16, 0.18, 24), this.material);
    core.rotation.x = -Math.PI / 2;
    core.position.y = -1.15;
    this.add(core);
  }
  update(state: SpatialState) {
    this.material.color.set(
      state === "following" ? 0x00d9ff : state === "held" ? 0xfbbf24 : 0xa78bfa,
    );
    this.material.opacity = state === "calibrating" ? 0.3 : 0.5;
  }
}
