import type { Point } from "../types";
/** Associate up to two detections globally, without relying on detector result order. */
export class HandIdentity {
  private tracks: { id: string; point: Point; label: string; time: number }[] =
    [];
  private serial = 0;
  assign(points: Point[][], labels: string[], now: number) {
    this.tracks = this.tracks.filter((t) => now - t.time < 350);
    const candidates: { indices: number[]; cost: number }[] = [];
    const search = (indices: number[], cost: number) => {
      const i = indices.length;
      if (i === points.length) {
        candidates.push({ indices, cost });
        return;
      }
      search([...indices, -1], cost + 0.4);
      this.tracks.forEach((t, j) => {
        if (indices.includes(j)) return;
        const p = points[i][0];
        const d = Math.hypot(p.x - t.point.x, p.y - t.point.y);
        if (d < 0.35)
          search(
            [...indices, j],
            cost + d + (labels[i] === t.label ? 0 : 0.12),
          );
      });
    };
    search([], 0);
    candidates.sort((a, b) => a.cost - b.cost);
    const ids = points.map((p, i) => {
      const index = candidates[0].indices[i];
      const t =
        index < 0
          ? {
              id: `hand-${this.serial++}`,
              point: p[0],
              label: labels[i],
              time: now,
            }
          : this.tracks[index];
      t.point = p[0];
      t.label = labels[i];
      t.time = now;
      return t;
    });
    this.tracks = [
      ...ids,
      ...this.tracks.filter((t) => !ids.includes(t)),
    ].slice(0, 4);
    return ids.map((t) => t.id);
  }
}
