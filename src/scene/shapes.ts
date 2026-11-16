import type { Shape } from "../types";
export function shapePositions(shape: Shape, count: number) {
  const a = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const t = (i * 0.618033988749895) % 1,
      phi = i * golden,
      y = 1 - 2 * t,
      r = Math.sqrt(1 - y * y);
    let x = r * Math.cos(phi),
      z = r * Math.sin(phi),
      v = y;
    switch (shape) {
      case "Galaxia": {
        const radius = Math.sqrt(t);
        const angle = radius * 13 + ((i % 3) * Math.PI * 2) / 3;
        x = radius * Math.cos(angle);
        z = radius * Math.sin(angle);
        v = Math.sin(i * 13.3) * 0.08;
        break;
      }
      case "Corazón": {
        const q = t * Math.PI * 2;
        x = (16 * Math.sin(q) ** 3) / 18;
        v =
          (13 * Math.cos(q) -
            5 * Math.cos(2 * q) -
            2 * Math.cos(3 * q) -
            Math.cos(4 * q)) /
          18;
        z = Math.sin(phi) * 0.18;
        break;
      }
      case "Espiral":
        x = Math.cos(t * 30) * (0.2 + t * 0.8);
        z = Math.sin(t * 30) * (0.2 + t * 0.8);
        v = y;
        break;
      case "Cubo": {
        x = Math.sin(i * 12.3);
        v = Math.sin(i * 7.7);
        z = Math.sin(i * 3.9);
        const axis = i % 3;
        if (axis === 0) x = i % 2 ? 1 : -1;
        if (axis === 1) v = i % 2 ? 1 : -1;
        if (axis === 2) z = i % 2 ? 1 : -1;
        break;
      }
      case "Toroide": {
        const q = t * Math.PI * 2;
        const k = phi;
        x = (0.75 + 0.25 * Math.cos(k)) * Math.cos(q);
        z = (0.75 + 0.25 * Math.cos(k)) * Math.sin(q);
        v = 0.25 * Math.sin(k);
        break;
      }
      case "ADN": {
        const q = t * 24 + (i % 2) * Math.PI;
        x = 0.55 * Math.cos(q);
        z = 0.55 * Math.sin(q);
        v = y;
        break;
      }
    }
    a.set([x, v, z], i * 3);
  }
  return a;
}
