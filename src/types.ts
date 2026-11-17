export type Mode = "particles" | "hologram" | "draw" | "energy";
export type Shape =
  | "Esfera"
  | "Galaxia"
  | "Corazón"
  | "Espiral"
  | "Cubo"
  | "Toroide"
  | "ADN"
  | "Pirámide"
  | "Icosaedro";
export type Point = { x: number; y: number; z: number };
export type Hand = {
  id: string;
  points: Point[];
  gesture: "open" | "fist" | "pinch" | "neutral";
  pinchStart: boolean;
  center: Point;
  angle: number;
  size: number;
  speed: number;
};
export type Tracking = {
  timestamp?: number;
  hands: Hand[];
  width: number;
  height: number;
};
export type Settings = {
  manipulation: "move" | "rotate" | "combined";
  mode: Mode;
  shape: Shape;
  color: string;
  quality: number;
  intensity: number;
  sensitivity: number;
  thickness: number;
  mirror: boolean;
  cameraVisible: boolean;
  landmarks: boolean;
};
export const defaults: Settings = {
  manipulation: "move",
  mode: "hologram",
  shape: "Esfera",
  color: "#00d9ff",
  quality: 1,
  intensity: 75,
  sensitivity: 1,
  thickness: 3,
  mirror: true,
  cameraVisible: true,
  landmarks: false,
};
export const counts = [1000, 5000, 15000];
