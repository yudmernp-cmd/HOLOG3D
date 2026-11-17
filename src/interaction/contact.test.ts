import { expect, it } from "vitest";
import {
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  TorusGeometry,
  SphereGeometry,
} from "three";
import { SurfaceContact } from "./contact";
function scene() {
  const camera = new PerspectiveCamera(
    (2 * Math.atan(300 / 1000) * 180) / Math.PI,
    800 / 600,
    0.1,
    5000,
  );
  camera.position.z = 1000;
  camera.updateMatrixWorld();
  const mesh: Mesh = new Mesh(
    new TorusGeometry(80, 25, 16, 48),
    new MeshBasicMaterial(),
  );
  mesh.updateMatrixWorld();
  return { camera, mesh, contact: new SurfaceContact() };
}
it("raycast uses actual geometry: torus hole cannot be grabbed", () => {
  const { camera, mesh, contact } = scene();
  contact.probe(0, 0, 800, 600, camera, mesh);
  expect(contact.hit).toBe(false);
  contact.probe(80, 0, 800, 600, camera, mesh);
  expect(contact.hit).toBe(true);
  mesh.geometry.dispose();
  (mesh.material as MeshBasicMaterial).dispose();
});
it("proximity halo never grants contact and translated geometry is hit at its new position", () => {
  const { camera, mesh, contact } = scene();
  mesh.geometry.dispose();
  mesh.geometry = new SphereGeometry(100, 24, 16);
  contact.probe(105, 0, 800, 600, camera, mesh, 10);
  expect(contact.hit).toBe(false);
  expect(contact.near).toBe(true);
  mesh.position.x = 200;
  mesh.updateMatrixWorld();
  contact.probe(0, 0, 800, 600, camera, mesh);
  expect(contact.hit).toBe(false);
  contact.probe(200, 0, 800, 600, camera, mesh);
  expect(contact.hit).toBe(true);
  mesh.geometry.dispose();
  (mesh.material as MeshBasicMaterial).dispose();
});
