import {
  Camera,
  Intersection,
  Mesh,
  Points,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
/** Exact projected geometry hit, with a separate proximity halo that never grants a grab. */
export class SurfaceContact {
  private ray = new Raycaster();
  private ndc = new Vector2();
  private hits: Intersection[] = [];
  point = new Vector3();
  hit = false;
  near = false;
  probe(
    x: number,
    y: number,
    width: number,
    height: number,
    camera: Camera,
    object: Mesh | Points,
    proximity = 8,
  ) {
    this.hit = this.near = false;
    const cast = (px: number, py: number) => {
      this.ndc.set((px * 2) / width, (py * 2) / height);
      this.ray.setFromCamera(this.ndc, camera);
      this.hits.length = 0;
      this.ray.params.Points.threshold = 4;
      this.ray.intersectObject(object, false, this.hits);
      return this.hits[0];
    };
    const direct = cast(x, y);
    if (direct) {
      this.hit = this.near = true;
      this.point.copy(direct.point);
      return;
    }
    for (const [dx, dy] of [
      [proximity, 0],
      [-proximity, 0],
      [0, proximity],
      [0, -proximity],
    ]) {
      const nearby = cast(x + dx, y + dy);
      if (nearby) {
        this.near = true;
        this.point.copy(nearby.point);
        return;
      }
    }
  }
}
