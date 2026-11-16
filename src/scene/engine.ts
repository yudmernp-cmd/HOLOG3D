import * as T from "three";
import type { Settings, Tracking } from "../types";
import { counts } from "../types";
import { project } from "../tracking/gestures";
import { shapePositions } from "./shapes";
import {
  SpatialController,
  spatialViewport,
  spatialPosition,
  type SpatialState,
} from "./spatial";
import { SpatialCue } from "./spatialCue";
export class Engine {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(45, 1, 0.1, 5000);
  group = new T.Group();
  geometry = new T.BufferGeometry();
  positions = new Float32Array(45000);
  target = shapePositions("Esfera", 15000);
  points: T.Points;
  hologram: T.Mesh;
  wire: T.LineSegments;
  rings: T.Mesh[] = [];
  strokes = new T.InstancedMesh(
    new T.CylinderGeometry(1, 1, 1, 6),
    new T.MeshBasicMaterial({ fog: false }),
    1800,
  );
  strokeTransform = new T.Object3D();
  strokeDirection = new T.Vector3();
  strokeAxis = new T.Vector3(0, 1, 0);
  spatial = new SpatialController();
  spinSpeed = 0.22;
  spatialCue = new SpatialCue();
  view = spatialViewport(640, 480, 640, 480);
  private videoWidth = 640;
  private videoHeight = 480;
  private lastFeedback = "";
  color = new T.Color();
  strokeGroup = new T.Group();
  markers: T.Points;
  markerData = new Float32Array(126);
  lineGeometry = new T.BufferGeometry();
  lineData = new Float32Array(300);
  skeleton: T.LineSegments;
  settings: Settings;
  frame = 0;
  last = 0;
  fpsTime = 0;
  frames = 0;
  slow = 0;
  autoLevel = 2;
  lastShape = "";
  lastPoint: T.Vector3 | null = null;
  drawingHand: string | null = null;
  drawCount = 0;
  pointer: { x: number; y: number; down: boolean } | null = null;
  width = 1;
  height = 1;
  raf = 0;
  observer: ResizeObserver;
  onStats: (fps: number, quality: number) => void;
  disposed = false;
  burst = 0;
  previousGesture = "";
  beamData = new Float32Array(99);
  beam: T.Line;
  constructor(
    public canvas: HTMLCanvasElement,
    settings: Settings,
    public tracking: () => Tracking,
    onStats: (fps: number, quality: number) => void,
    public onSpatial?: (state: SpatialState, calibrated: boolean) => void,
  ) {
    this.settings = settings;
    this.strokes.count = 0;
    this.strokes.frustumCulled = false;
    this.strokes.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.strokeGroup.add(this.strokes);
    this.onStats = onStats;
    this.renderer = new T.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.geometry.setAttribute(
      "position",
      new T.BufferAttribute(this.positions, 3),
    );
    this.positions.set(this.target);
    this.points = new T.Points(
      this.geometry,
      new T.PointsMaterial({
        color: settings.color,
        size: 2.2,
        transparent: true,
        opacity: 0.85,
        blending: T.NormalBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.hologram = new T.Mesh(
      new T.IcosahedronGeometry(1, 1),
      new T.MeshPhongMaterial({
        color: settings.color,
        emissive: settings.color,
        emissiveIntensity: 0.12,
        shininess: 90,
        transparent: true,
        opacity: 0.23,
        side: T.FrontSide,
        depthWrite: false,
      }),
    );
    this.wire = new T.LineSegments(
      new T.EdgesGeometry(this.hologram.geometry),
      new T.LineBasicMaterial({
        color: settings.color,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.hologram.add(this.wire);
    this.group.add(this.hologram);
    for (let i = 0; i < 6; i++) {
      const ring = new T.Mesh(
        new T.TorusGeometry(1 + i * 0.18, 0.006, 6, 100),
        new T.MeshBasicMaterial({
          color: settings.color,
          transparent: true,
          opacity: 0.5,
          blending: T.AdditiveBlending,
        }),
      );
      ring.rotation.x = i % 2 ? Math.PI / 2 : 0.3 * i;
      this.rings.push(ring);
      this.group.add(ring);
    }
    const mg = new T.BufferGeometry();
    mg.setAttribute("position", new T.BufferAttribute(this.markerData, 3));
    this.markers = new T.Points(
      mg,
      new T.PointsMaterial({
        color: 0x67e8f9,
        size: 5,
        depthTest: false,
        fog: false,
      }),
    );
    this.scene.add(this.markers);
    this.lineGeometry.setAttribute(
      "position",
      new T.BufferAttribute(this.lineData, 3),
    );
    this.skeleton = new T.LineSegments(
      this.lineGeometry,
      new T.LineBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.4,
        depthTest: false,
        fog: false,
      }),
    );
    this.scene.add(this.skeleton);
    const beamGeometry = new T.BufferGeometry();
    beamGeometry.setAttribute(
      "position",
      new T.BufferAttribute(this.beamData, 3),
    );
    this.beam = new T.Line(
      beamGeometry,
      new T.LineBasicMaterial({
        color: settings.color,
        transparent: true,
        opacity: 0.8,
        blending: T.AdditiveBlending,
        depthTest: false,
        fog: false,
      }),
    );
    this.scene.add(this.beam);
    this.scene.add(this.group, this.strokeGroup, this.spatialCue);
    this.scene.add(new T.AmbientLight(0xb9e9ff, 0.8));
    const light = new T.DirectionalLight(0xffffff, 2.2);
    light.position.set(-1, 2, 3);
    this.scene.add(light);
    this.markers.renderOrder = this.skeleton.renderOrder = 10;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.animate);
  }
  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.syncProjection();
  }
  private syncProjection() {
    this.view = spatialViewport(
      this.videoWidth,
      this.videoHeight,
      Math.max(1, this.width),
      Math.max(1, this.height),
    );
    this.camera.position.z = this.view.focal;
    this.camera.aspect = Math.max(1, this.width) / Math.max(1, this.height);
    this.camera.fov = this.view.fov;
    this.camera.updateProjectionMatrix();
    this.scene.fog = new T.Fog(
      0x071524,
      this.view.focal * 0.5,
      this.view.focal * 2.7,
    );
  }
  recalibrate() {
    this.spatial.recalibrate();
  }
  update(s: Settings) {
    if (s.mirror !== this.settings.mirror) {
      this.spatial.pose.x *= -1;
      this.spatial.pose.roll *= -1;
      this.spatial.hold();
      this.strokeGroup.scale.x *= -1;
      this.lastPoint = null;
    }
    if (s.mode !== this.settings.mode) this.spatial.hold();
    if (s.quality !== this.settings.quality) {
      this.autoLevel = s.quality;
      this.slow = 0;
    }
    this.settings = s;
  }
  clear() {
    this.strokes.count = 0;
    this.drawCount = 0;
    this.lastPoint = null;
  }
  reset() {
    this.clear();
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.spatial.reset();
    this.autoLevel = this.settings.quality;
  }
  export() {
    const link = document.createElement("a");
    link.download = "holomotion.png";
    this.renderer.render(this.scene, this.camera);
    link.href = this.canvas.toDataURL("image/png");
    link.click();
  }
  animate = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    const s = this.settings;
    const data = this.tracking();
    if (data.width !== this.videoWidth || data.height !== this.videoHeight) {
      this.videoWidth = data.width;
      this.videoHeight = data.height;
      this.syncProjection();
      this.spatial.hold();
    }
    const hands = data.hands;
    const hand = hands[0];
    const mode = s.mode;
    const quality = Math.min(s.quality, this.autoLevel);
    if (this.lastShape !== s.shape) {
      this.lastShape = s.shape;
      this.target = shapePositions(s.shape, 15000);
      this.hologram.geometry.dispose();
      this.wire.geometry.dispose();
      this.hologram.geometry =
        s.shape === "Cubo"
          ? new T.BoxGeometry(1.5, 1.5, 1.5)
          : s.shape === "Toroide"
            ? new T.TorusGeometry(0.8, 0.25, 16, 48)
            : s.shape === "Pirámide"
              ? new T.ConeGeometry(1, 1.7, 4)
              : s.shape === "Esfera"
                ? new T.SphereGeometry(1, 24, 16)
                : new T.IcosahedronGeometry(1, s.shape === "Icosaedro" ? 0 : 1);
      this.wire.geometry = new T.EdgesGeometry(this.hologram.geometry);
    }
    const color = this.color.set(s.color);
    (this.points.material as T.PointsMaterial).color.copy(color);
    (this.hologram.material as T.MeshPhongMaterial).color.copy(color);
    (this.hologram.material as T.MeshPhongMaterial).emissive.copy(color);
    (this.wire.material as T.LineBasicMaterial).color.copy(color);
    const count = Math.max(
      100,
      Math.floor((counts[quality] * s.intensity) / 100),
    );
    this.geometry.setDrawRange(0, count);
    this.points.visible = mode === "particles" || mode === "energy";
    this.hologram.visible = mode === "hologram";
    this.strokeGroup.visible = mode === "draw";
    const p = hand
      ? project(
          hand.center,
          data.width,
          data.height,
          this.width,
          this.height,
          s.mirror,
        )
      : this.pointer
        ? { x: this.pointer.x, y: this.pointer.y, z: 0 }
        : { x: 0, y: 0, z: 0 };
    const smoothing = 1 - Math.exp(-dt * 8);
    if (mode !== "draw") {
      if (!hands.length && this.pointer)
        this.spatial.updatePointer(
          this.pointer.x / this.view.videoWidth,
          this.pointer.y / this.view.videoHeight,
          this.pointer.down,
          now,
          dt,
          data.width / data.height,
        );
      else
        this.spatial.update(hands, now, dt, s.mirror, data.width / data.height);
      const pose = this.spatial.pose;
      const position = spatialPosition(pose, this.view);
      this.group.position.set(position.x, position.y, position.z);
      this.group.scale.setScalar(
        this.view.videoHeight * this.spatial.radius * pose.scale,
      );
      this.group.rotation.z = pose.roll;
    } else this.spatial.hold();
    // Rotation belongs to the object, not to tracking availability or the fist.
    if (this.spatial.state === "rotating") this.spinSpeed = 0;
    else this.spinSpeed += (0.22 - this.spinSpeed) * (1 - Math.exp(-dt * 4));
    this.group.rotation.y += dt * this.spinSpeed;
    this.spatialCue.visible = mode !== "draw";
    this.spatialCue.position.copy(this.group.position);
    this.spatialCue.scale.setScalar(
      this.view.videoHeight * this.spatial.handleUnit * this.spatial.pose.depth,
    );
    this.spatialCue.update(this.spatial, data.width / data.height);
    const feedback = this.spatial.state + this.spatial.calibrated;
    if (feedback !== this.lastFeedback) {
      this.lastFeedback = feedback;
      this.onSpatial?.(this.spatial.state, this.spatial.calibrated);
    }
    const energy = mode === "energy";
    if (hand?.gesture === "open" && this.previousGesture === "fist")
      this.burst = 1;
    this.previousGesture = hand?.gesture ?? "";
    this.burst = Math.max(0, this.burst - dt * 0.8);
    this.beam.visible = energy && hands.length === 2;
    if (this.beam.visible) {
      const a = project(
          hands[0].center,
          data.width,
          data.height,
          this.width,
          this.height,
          s.mirror,
        ),
        b = project(
          hands[1].center,
          data.width,
          data.height,
          this.width,
          this.height,
          s.mirror,
        );
      for (let i = 0; i < 33; i++) {
        const t = i / 32;
        const wave =
          Math.sin(t * Math.PI) *
          Math.sin(i * 3.1 + now * 0.018) *
          (8 + (hand?.speed ?? 0) * 20);
        this.beamData.set(
          [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + wave, 1],
          i * 3,
        );
      }
      this.beam.geometry.attributes.position.needsUpdate = true;
      (this.beam.material as T.LineBasicMaterial).color.copy(color);
    }
    if (this.points.visible)
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        for (let k = 0; k < 3; k++) {
          let target = this.target[j + k];
          if (energy) {
            const t = (i * 0.618033988749895) % 1;
            const a = t * 45 + now * 0.0003 * (1 + (hand?.speed ?? 0));
            target =
              k === 0
                ? Math.cos(a) * Math.sqrt(t)
                : k === 2
                  ? Math.sin(a) * Math.sqrt(t)
                  : Math.sin(t * 20 + now * 0.002) * 0.25;
            target *= 1 + (hand?.speed ?? 0) * 0.4 + this.burst * 2;
          }
          this.positions[j + k] += (target - this.positions[j + k]) * smoothing;
        }
      }
    if (this.points.visible)
      this.geometry.attributes.position.needsUpdate = true;
    this.rings.forEach((ring, i) => {
      ring.visible = energy && (quality > 0 || i < 2);
      ring.rotation.z += dt * (0.1 + i * 0.08) * (1 + (hand?.speed ?? 0));
      (ring.material as T.MeshBasicMaterial).color.copy(color);
      ring.scale.setScalar(
        1 + Math.sin(now * 0.002 - i) * 0.08 * (1 + (hand?.speed ?? 0)),
      );
    });
    let n = 0,
      l = 0;
    for (const h of hands) {
      const projected = h.points.map((q) =>
        project(q, data.width, data.height, this.width, this.height, s.mirror),
      );
      for (const q of projected) this.markerData.set([q.x, q.y, 0], n++ * 3);
      for (const chain of [
        [0, 1, 2, 3, 4],
        [0, 5, 6, 7, 8],
        [5, 9, 10, 11, 12],
        [9, 13, 14, 15, 16],
        [13, 17, 18, 19, 20],
        [0, 17],
      ])
        for (let i = 1; i < chain.length; i++)
          for (const ix of [chain[i - 1], chain[i]]) {
            const q = projected[ix];
            if (l < 100) this.lineData.set([q.x, q.y, 0], l++ * 3);
          }
    }
    this.markers.geometry.setDrawRange(0, n);
    this.markers.geometry.attributes.position.needsUpdate = true;
    this.lineGeometry.setDrawRange(0, l);
    this.lineGeometry.attributes.position.needsUpdate = true;
    this.markers.visible = this.skeleton.visible = s.landmarks;
    const pinching = hand?.gesture === "pinch" || !!this.pointer?.down;
    if (mode === "draw" && pinching) {
      const drawingHand = hand?.id ?? "mouse";
      if (drawingHand !== this.drawingHand) this.lastPoint = null;
      this.drawingHand = drawingHand;
      const q = hand
        ? project(
            hand.points[8],
            data.width,
            data.height,
            this.width,
            this.height,
            s.mirror,
          )
        : p;
      const point = new T.Vector3(q.x / this.strokeGroup.scale.x, q.y, 0);
      if (
        this.lastPoint &&
        point.distanceTo(this.lastPoint) > 2 &&
        this.drawCount < 1800
      ) {
        this.strokeDirection.subVectors(point, this.lastPoint);
        this.strokeTransform.position
          .copy(this.lastPoint)
          .add(point)
          .multiplyScalar(0.5);
        this.strokeTransform.quaternion.setFromUnitVectors(
          this.strokeAxis,
          this.strokeDirection.clone().normalize(),
        );
        this.strokeTransform.scale.set(
          s.thickness / 2,
          this.strokeDirection.length(),
          s.thickness / 2,
        );
        this.strokeTransform.updateMatrix();
        this.strokes.setMatrixAt(this.drawCount, this.strokeTransform.matrix);
        this.strokes.setColorAt(this.drawCount, color);
        this.strokes.count = this.drawCount + 1;
        this.strokes.instanceMatrix.needsUpdate = true;
        if (this.strokes.instanceColor)
          this.strokes.instanceColor.needsUpdate = true;
        this.drawCount++;
      }
      this.lastPoint = point;
    } else this.lastPoint = null;
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.fpsTime > 1000) {
      const fps = Math.round((this.frames * 1000) / (now - this.fpsTime));
      this.frames = 0;
      this.fpsTime = now;
      this.slow = fps < 27 ? this.slow + 1 : 0;
      if (this.slow >= 4 && this.autoLevel > 0) {
        this.autoLevel--;
        this.slow = 0;
        this.renderer.setPixelRatio(1);
      }
      this.onStats(fps, Math.min(s.quality, this.autoLevel));
    }
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as T.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.strokes.dispose();
    this.renderer.dispose();
  }
}
