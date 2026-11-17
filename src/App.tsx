import { useEffect, useRef, useState } from "react";
import {
  Atom,
  Box,
  PenTool,
  Zap,
  Camera,
  Maximize,
  RotateCcw,
  Eye,
  EyeOff,
  Download,
  Hand,
  MousePointer2,
  ChevronRight,
  HelpCircle,
  Power,
  ScanLine,
} from "lucide-react";
import {
  defaults,
  counts,
  type Settings,
  type Mode,
  type Shape,
} from "./types";
import { useCamera } from "./tracking/useCamera";
import { Engine } from "./scene/engine";
function restore(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem("holomotion") ?? "null");
    if (!v) return defaults;
    return {
      ...defaults,
      color: /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : defaults.color,
      quality: [0, 1, 2].includes(v.quality) ? v.quality : 1,
      mirror: typeof v.mirror === "boolean" ? v.mirror : true,
    };
  } catch {
    return defaults;
  }
}
const modes: { id: Mode; title: string; caption: string; icon: typeof Atom }[] =
  [
    {
      id: "particles",
      title: "Universo de partículas",
      caption: "Formas que fluyen contigo",
      icon: Atom,
    },
    {
      id: "hologram",
      title: "Hologramas 3D",
      caption: "Geometría en tus manos",
      icon: Box,
    },
    {
      id: "draw",
      title: "Dibujo en el aire",
      caption: "Imagina. Traza. Crea.",
      icon: PenTool,
    },
    {
      id: "energy",
      title: "Energía interactiva",
      caption: "Libera el movimiento",
      icon: Zap,
    },
  ];
const shapes: Shape[] = [
  "Esfera",
  "Galaxia",
  "Corazón",
  "Espiral",
  "Cubo",
  "Toroide",
  "ADN",
];
export default function App() {
  const [settings, setSettings] = useState<Settings>(restore);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null);
  const camera = useCamera(video, settingsRef);
  const [stats, setStats] = useState({
    fps: 0,
    quality: 1,
    hands: 0,
    gesture: "Sin seguimiento",
  });
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [demo, setDemo] = useState(false);
  const [help, setHelp] = useState(false);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  useEffect(() => {
    let instance: Engine;
    try {
      instance = new Engine(
        canvas.current!,
        settingsRef.current,
        () => camera.tracking.current,
        (fps, quality) => {
          const hands = camera.tracking.current.hands;
          setStats({
            fps,
            quality,
            hands: hands.length,
            gesture: hands[0]?.gesture ?? "Sin seguimiento",
          });
        },
      );
      engine.current = instance;
    } catch {
      setError(
        "WebGL no está disponible. Prueba otro navegador o activa la aceleración gráfica.",
      );
      return;
    }
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        "Se perdió el contexto gráfico. Recarga la página para recuperar la escena.",
      );
    };
    canvas.current!.addEventListener("webglcontextlost", lost);
    const c = canvas.current;
    return () => {
      c?.removeEventListener("webglcontextlost", lost);
      instance.dispose();
      engine.current = null;
    };
  }, [camera.tracking]);
  useEffect(() => {
    engine.current?.update(settings);
    try {
      localStorage.setItem("holomotion", JSON.stringify(settings));
    } catch {}
  }, [settings]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setError("Pantalla completa no disponible en este navegador.");
    }
  }
  const current = modes.find((m) => m.id === settings.mode)!;
  return (
    <div className={`app ${hidden ? "immersive" : ""}`}>
      <header>
        <a className="brand" href="#">
          <div className="brand-icon">
            <Atom size={27} />
          </div>
          <span>
            HOLO<span className="cyan">MOTION</span>
            <small>INTERACTIVE 3D LABORATORY</small>
          </span>
          <b>3D</b>
        </a>
        <div className="header-right">
          <span className="privacy">
            <i /> Procesamiento 100% local
          </span>
          <button onClick={() => setHelp(true)}>
            <HelpCircle size={16} /> Guía de gestos
          </button>
          <span
            className="version"
            title="Base fbe8eba · seguimiento estabilizado"
          >
            V 1.0-P
          </span>
        </div>
      </header>
      <main>
        <aside>
          <div className="eyebrow">TU ESPACIO CREATIVO</div>
          <h2>
            Explora lo imposible<span>.</span>
          </h2>
          <p className="intro">Tus manos son la interfaz.</p>
          <div className="section-label">
            01 <span>MODO VISUAL</span>
          </div>
          <nav>
            {modes.map(({ id, title, caption, icon: Icon }, i) => (
              <button
                key={id}
                className={`mode ${settings.mode === id ? "selected" : ""}`}
                onClick={() => {
                  change("mode", id);
                  engine.current?.clear();
                }}
              >
                <Icon size={21} />
                <span>
                  <strong>{title}</strong>
                  <small>{caption}</small>
                </span>
                <span className="mode-index">0{i + 1}</span>
              </button>
            ))}
          </nav>
          <div className="section-label">
            02{" "}
            <span>
              {settings.mode === "draw" ? "TU PINCEL" : "CONFIGURA LA ESCENA"}
            </span>
          </div>
          {settings.mode !== "draw" && (
            <>
              <label>
                Figura <span>✧</span>
              </label>
              <div className="shapes">
                {(settings.mode === "hologram"
                  ? ([
                      "Cubo",
                      "Esfera",
                      "Pirámide",
                      "Toroide",
                      "Icosaedro",
                      "ADN",
                    ] as Shape[])
                  : shapes
                ).map((s, i) => (
                  <button
                    className={settings.shape === s ? "active" : ""}
                    onClick={() => change("shape", s)}
                    key={s}
                  >
                    <span>{["◉", "✺", "♡", "◎", "◇", "◌", "〰"][i]}</span>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
          <label>
            {settings.mode === "draw" ? "Grosor del trazo" : "Intensidad"}
            <span>
              {settings.mode === "draw"
                ? `${settings.thickness} px`
                : `${settings.intensity}%`}
            </span>
          </label>
          <input
            aria-label="Intensidad o grosor"
            type="range"
            min={settings.mode === "draw" ? 1 : 10}
            max={settings.mode === "draw" ? 12 : 100}
            value={
              settings.mode === "draw" ? settings.thickness : settings.intensity
            }
            onChange={(e) =>
              settings.mode === "draw"
                ? change("thickness", +e.target.value)
                : change("intensity", +e.target.value)
            }
          />
          <label>
            Sensibilidad<span>{settings.sensitivity.toFixed(1)}×</span>
          </label>
          <input
            aria-label="Sensibilidad"
            type="range"
            min="0.6"
            max="1.6"
            step="0.1"
            value={settings.sensitivity}
            onChange={(e) => change("sensitivity", +e.target.value)}
          />
          <label>Color de energía</label>
          <div className="colors">
            {[
              "#00d9ff",
              "#8b5cf6",
              "#f472b6",
              "#34d399",
              "#fbbf24",
              "#f8fafc",
            ].map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                className={settings.color === c ? "chosen" : ""}
                style={{ background: c }}
                onClick={() => change("color", c)}
              />
            ))}
            <input
              aria-label="Color personalizado"
              type="color"
              value={settings.color}
              onChange={(e) => change("color", e.target.value)}
            />
          </div>
          <div className="quality">
            <label>Calidad adaptativa</label>
            <select
              aria-label="Calidad"
              value={settings.quality}
              onChange={(e) => change("quality", +e.target.value)}
            >
              <option value={0}>Baja · 1 000</option>
              <option value={1}>Media · 5 000</option>
              <option value={2}>Alta · 15 000</option>
            </select>
          </div>
          <div className="local-note">
            <ScanLine size={18} />
            <span>
              Tu cámara, tu privacidad.
              <small>El video nunca sale de tu dispositivo.</small>
            </span>
          </div>
        </aside>
        <section className="workspace">
          <div className="workspace-top">
            <div>
              <span className="eyebrow">LABORATORIO / </span>
              <span>{current.title}</span>
            </div>
            <span className="live">
              <i /> {camera.active ? "EN VIVO" : "LISTO PARA EXPLORAR"}
            </span>
          </div>
          <div
            className="stage"
            ref={stage}
            onPointerMove={(e) => {
              if (demo && engine.current) {
                const r = e.currentTarget.getBoundingClientRect();
                engine.current.pointer = {
                  x: e.clientX - r.left - r.width / 2,
                  y: r.height / 2 - (e.clientY - r.top),
                  down: e.buttons === 1,
                };
              }
            }}
            onPointerDown={(e) => {
              if (demo) {
                e.currentTarget.setPointerCapture(e.pointerId);
                if (engine.current?.pointer) engine.current.pointer.down = true;
              }
            }}
            onPointerUp={() => {
              if (engine.current?.pointer) engine.current.pointer.down = false;
            }}
            onPointerLeave={() => {
              if (engine.current) engine.current.pointer = null;
            }}
          >
            <video
              ref={video}
              playsInline
              muted
              className={settings.mirror ? "mirrored" : ""}
              style={{
                opacity: camera.active && settings.cameraVisible ? 0.48 : 0,
              }}
            />
            <div className="grid-floor" />
            <canvas ref={canvas} />
            <div className="stage-top">
              <span className="scene-tag">
                <i />
                {demo ? "EXPLORACIÓN CON RATÓN" : "HOLOMOTION ENGINE"}
              </span>
              <div className="stage-buttons">
                <button
                  title="Ocultar controles"
                  onClick={() => setHidden(!hidden)}
                >
                  {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
                <button title="Pantalla completa" onClick={fullscreen}>
                  <Maximize size={17} />
                </button>
              </div>
            </div>
            {!camera.active && !demo && !camera.loading && (
              <div className="welcome">
                <span className="welcome-kicker">
                  EL MOVIMIENTO SE CONVIERTE EN ARTE
                </span>
                <h1>
                  Un universo.
                  <br />
                  <span>En tus manos.</span>
                </h1>
                <p>
                  Activa tu cámara y transforma tus gestos
                  <br />
                  en una experiencia tridimensional.
                </p>
                <button className="primary" onClick={() => void camera.start()}>
                  <Camera size={18} /> Activar cámara <ChevronRight size={16} />
                </button>
                <button className="text-button" onClick={() => setDemo(true)}>
                  <MousePointer2 size={14} /> Explorar con ratón
                </button>
              </div>
            )}
            {camera.loading && (
              <div className="loading">
                <span className="spinner" />
                Preparando el seguimiento de manos…
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
                <button onClick={() => setError("")}>Cerrar</button>
              </div>
            )}
            <div className="stage-bottom">
              <div>
                <span className="coordinate">X / Y / Z</span>
                <small>PROFUNDIDAD VIRTUAL</small>
              </div>
              <div className="tracking-pill">
                <Hand size={16} />
                {camera.active
                  ? `${stats.hands} ${stats.hands === 1 ? "mano detectada" : "manos detectadas"}`
                  : demo
                    ? "Control con ratón"
                    : "Esperando tus manos"}
                <i className={stats.hands ? "detected" : ""} />
              </div>
              <span className="coordinate">
                WEBGL <span className="cyan">●</span>
              </span>
            </div>
          </div>
          <div className="toolbar">
            <div className="camera-state">
              <i className={camera.active ? "on" : ""} />
              <span>{camera.status}</span>
            </div>
            <div className="tools">
              {(camera.active || camera.loading) && (
                <button title="Desactivar cámara" onClick={camera.stop}>
                  <Power size={16} />
                </button>
              )}
              {demo && (
                <button
                  onClick={() => {
                    setDemo(false);
                    if (engine.current) engine.current.pointer = null;
                  }}
                >
                  Salir del ratón
                </button>
              )}
              <button
                title="Modo espejo"
                className={settings.mirror ? "enabled" : ""}
                onClick={() => change("mirror", !settings.mirror)}
              >
                <ScanLine size={16} />
              </button>
              <button
                title="Mostrar u ocultar cámara"
                onClick={() => change("cameraVisible", !settings.cameraVisible)}
              >
                <Camera size={16} />
              </button>
              <button
                title="Puntos de referencia"
                onClick={() => change("landmarks", !settings.landmarks)}
              >
                <Hand size={16} />
              </button>
              <button
                title="Reiniciar escena y borrar dibujo"
                onClick={() => engine.current?.reset()}
              >
                <RotateCcw size={16} />
              </button>
              <button
                title="Guardar gráficos como PNG transparente"
                onClick={() => engine.current?.export()}
              >
                <Download size={16} />
              </button>
            </div>
          </div>
          <div className="gesture-cards">
            {[
              ["✋", "Abre tu mano", "Expande el universo"],
              ["✊", "Cierra el puño", "Concentra la energía"],
              ["🤏", "Haz un pellizco", "Selecciona o dibuja"],
              ["↔", "Separa tus manos", "Cambia la escala"],
            ].map(([icon, title, desc]) => (
              <div key={title}>
                <span>{icon}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </div>
              </div>
            ))}
          </div>
          <footer>
            <span>
              <i /> SISTEMA {camera.active ? "ACTIVO" : "EN ESPERA"}
            </span>
            <span>
              {stats.fps} FPS <b>·</b> {counts[stats.quality].toLocaleString()}{" "}
              PARTÍCULAS MÁX. <b>·</b>{" "}
              {stats.gesture === "Sin seguimiento"
                ? stats.gesture
                : ({
                    open: "Mano abierta",
                    fist: "Puño",
                    pinch: "Pellizco",
                    neutral: "Movimiento",
                  }[stats.gesture] ?? "")}
            </span>
            <span>
              CREA SIN LÍMITES <span className="cyan">✧</span>
            </span>
          </footer>
        </section>
      </main>
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Guía de gestos"
          >
            <span className="eyebrow">PRIMER CONTACTO</span>
            <h2>El laboratorio sigue tus manos.</h2>
            <p>
              Activa la cámara y coloca una o dos manos dentro del encuadre, con
              buena iluminación.
            </p>
            <ol>
              <li>
                Abre la palma para expandir. Cierra el puño para concentrar.
              </li>
              <li>Mueve la palma para trasladar; gira la muñeca para rotar.</li>
              <li>Separa o acerca dos manos para cambiar la escala.</li>
              <li>
                En Dibujo, une pulgar e índice y mueve el índice. Suelta para
                terminar el trazo.
              </li>
              <li>
                En Hologramas, elige una figura y pellizca para girarla un
                octavo de vuelta.
              </li>
            </ol>
            <p>
              Ratón: mueve para desplazar; mantén pulsado para dibujar.
              Reiniciar borra los trazos. PNG exporta solo los gráficos, sin
              cámara. La profundidad es una estimación visual.
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              Entendido, a crear <ChevronRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
