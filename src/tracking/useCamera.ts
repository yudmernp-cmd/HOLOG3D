import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { HandIdentity } from "./identity";
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
    worker?: Worker;
    cancelInit?: () => void;
    raf: number;
    generation: number;
  }>({ raf: 0, generation: 0 });
  const stop = useCallback(() => {
    const r = resources.current;
    r.generation++;
    cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.cancelInit?.();
    r.cancelInit = undefined;
    r.worker?.terminate();
    r.worker = undefined;
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
      const worker = new Worker(`${import.meta.env.BASE_URL}hand-worker.js`);
      r.worker = worker;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("El seguimiento tardó demasiado en iniciar.")),
          45000,
        );
        r.cancelInit = () => {
          clearTimeout(timeout);
          reject(new Error("Inicio cancelado"));
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          r.cancelInit = undefined;
          reject(new Error("No se pudo iniciar el procesador de manos."));
        };
        worker.onmessage = ({ data }) => {
          clearTimeout(timeout);
          r.cancelInit = undefined;
          if (data.type === "ready") resolve();
          else reject(new Error(data.message));
        };
        worker.postMessage({ type: "init" });
      });
      if (generation !== r.generation) return;
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      if (generation !== r.generation) return;
      setActive(true);
      setLoading(false);
      setStatus("Seguimiento local activo");
      const gestures = new GestureRecognizer();
      const identities = new HandIdentity();
      let last = -1,
        tick = 0,
        received = performance.now(),
        interval = 50;
      let busy = false;
      const fail = () => {
        if (generation !== r.generation) return;
        stop();
        setStatus("Falló el seguimiento. Reactiva la cámara para reintentar.");
      };
      worker.onerror = fail;
      worker.onmessage = ({
        data,
      }: MessageEvent<
        HandLandmarkerResult & {
          type: string;
          duration: number;
          timestamp: number;
        }
      >) => {
        if (generation !== r.generation) return;
        busy = false;
        if (data.type !== "result") {
          fail();
          return;
        }
        received = performance.now();
        interval = Math.min(200, Math.max(50, data.duration * 1.25));
        const ids = identities.assign(
          data.landmarks,
          data.handedness.map((h) => h[0]?.categoryName ?? ""),
          data.timestamp,
        );
        tracking.current = {
          timestamp: data.timestamp,
          width: v.videoWidth,
          height: v.videoHeight,
          hands: data.landmarks.map((points, i) =>
            gestures.update(
              points,
              ids[i],
              data.timestamp,
              settings.current.sensitivity,
              v.videoWidth / v.videoHeight,
            ),
          ),
        };
      };
      const loop = (now: number) => {
        if (generation !== r.generation) return;
        if (
          !busy &&
          !document.hidden &&
          v.readyState >= 2 &&
          v.currentTime !== last &&
          now - tick >= interval
        ) {
          busy = true;
          last = v.currentTime;
          tick = now;
          createImageBitmap(v)
            .then((bitmap) => {
              if (generation !== r.generation) {
                bitmap.close();
                return;
              }
              worker.postMessage({ type: "frame", bitmap, timestamp: now }, [
                bitmap,
              ]);
            })
            .catch(fail);
        }
        if (now - received > 500) tracking.current.hands = [];
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
