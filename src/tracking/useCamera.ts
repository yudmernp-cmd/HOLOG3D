import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { GestureRecognizer } from "./gestures";
import type { Settings, Tracking } from "../types";
export function useCamera(
  video: RefObject<HTMLVideoElement | null>,
  settings: RefObject<Settings>,
) {
  const tracking = useRef<Tracking>({ hands: [], width: 640, height: 480 });
  const [status, setStatus] = useState("Cámara desactivada");
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const resources = useRef<{
    stream?: MediaStream;
    model?: HandLandmarker;
    raf: number;
    generation: number;
  }>({ raf: 0, generation: 0 });
  const stop = useCallback(() => {
    const r = resources.current;
    r.generation++;
    cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.model?.close();
    r.model = undefined;
    r.stream = undefined;
    tracking.current.hands = [];
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setLoading(false);
    setStatus("Cámara desactivada");
  }, [video]);
  const start = useCallback(async () => {
    stop();
    const r = resources.current;
    const generation = r.generation;
    setLoading(true);
    setStatus("Preparando visión local…");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "La cámara necesita HTTPS o localhost y un navegador compatible.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      if (generation !== r.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      r.stream = stream;
      stream.getVideoTracks()[0].addEventListener(
        "ended",
        () => {
          stop();
          setStatus("La cámara se desconectó. Vuelve a activarla.");
        },
        { once: true },
      );
      const asset = await fetch(
        `${import.meta.env.BASE_URL}models/hand_landmarker.task`,
        { signal: AbortSignal.timeout(30000) },
      );
      if (
        !asset.ok ||
        asset.headers.get("content-type")?.includes("text/html")
      ) {
        throw new Error(
          "Falta el modelo de manos. Ejecuta npm run setup:assets con acceso a storage.googleapis.com.",
        );
      }
      const modelBytes = new Uint8Array(await asset.arrayBuffer());
      if (generation !== r.generation) return;
      const files = await FilesetResolver.forVisionTasks(
        `${import.meta.env.BASE_URL}wasm`,
      );
      const model = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetBuffer: modelBytes,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
      });
      if (generation !== r.generation) {
        model.close();
        return;
      }
      r.model = model;
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      if (generation !== r.generation) return;
      setActive(true);
      setLoading(false);
      setStatus("Seguimiento local activo");
      const gestures = new GestureRecognizer();
      let last = -1;
      let tick = 0;
      const loop = (now: number) => {
        if (generation !== r.generation) return;
        try {
          if (v.readyState >= 2 && v.currentTime !== last && now - tick > 40) {
            last = v.currentTime;
            tick = now;
            const result = model.detectForVideo(v, now);
            tracking.current = {
              width: v.videoWidth,
              height: v.videoHeight,
              hands: result.landmarks.map((p, i) =>
                gestures.update(
                  p,
                  result.handedness[i]?.[0]?.categoryName ?? String(i),
                  now,
                  settings.current.sensitivity,
                  v.videoWidth / v.videoHeight,
                ),
              ),
            };
          }
        } catch {
          stop();
          setStatus(
            "Falló el seguimiento. Reactiva la cámara para reintentar.",
          );
          return;
        }
        if (now - tick > 250) tracking.current.hands = [];
        r.raf = requestAnimationFrame(loop);
      };
      r.raf = requestAnimationFrame(loop);
    } catch (error) {
      if (generation !== r.generation) return;
      stop();
      const e = error as Error;
      setStatus(
        e.name === "NotAllowedError"
          ? "Permiso denegado. Habilita la cámara en tu navegador."
          : e.name === "NotFoundError"
            ? "No se encontró una cámara. Puedes usar el modo ratón."
            : e.name === "NotReadableError"
              ? "La cámara está ocupada o no está disponible."
              : `No se pudo iniciar: ${e.message}`,
      );
    }
  }, [stop, video, settings]);
  useEffect(() => stop, [stop]);
  return { tracking, status, active, loading, start, stop };
}
