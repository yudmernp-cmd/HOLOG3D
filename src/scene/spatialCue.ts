import * as T from "three";
import { ringRadii, type SpatialController } from "./spatial";
export class SpatialCue extends T.Group {
  private moveMaterial = new T.MeshBasicMaterial({
    color: 0x00d9ff,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  private rotateMaterial = new T.MeshBasicMaterial({
    color: 0xa78bfa,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  private dots: T.Mesh[] = [];
  constructor() {
    super();
    for (const [kind, radius] of Object.entries(ringRadii)) {
      const ring = new T.Mesh(
        new T.TorusGeometry(radius, 0.012, 6, 96),
        kind === "move" ? this.moveMaterial : this.rotateMaterial,
      );
      ring.renderOrder = 11;
      this.add(ring);
    }
    const geometry = new T.SphereGeometry(0.055, 8, 6);
    for (let i = 0; i < 2; i++) {
      const dot = new T.Mesh(
        geometry,
        new T.MeshBasicMaterial({
          color: 0xffffff,
          depthTest: false,
          fog: false,
        }),
      );
      dot.renderOrder = 12;
      this.dots.push(dot);
      this.add(dot);
    }
  }
  update(controller: SpatialController, aspect: number) {
    this.moveMaterial.opacity =
      controller.hover === "move" ||
      controller.state === "following" ||
      controller.state === "scaling"
        ? 1
        : 0.45;
    this.rotateMaterial.opacity =
      controller.hover === "rotate" || controller.state === "rotating"
        ? 1
        : 0.45;
    const unit = controller.handleUnit;
    this.dots.forEach((dot, i) => {
      const p = controller.cursors[i];
      dot.visible = !!p;
      if (p)
        dot.position.set(
          ((p.x - controller.pose.x) * aspect) / unit,
          (p.y - controller.pose.y) / unit,
          0,
        );
    });
  }
}
