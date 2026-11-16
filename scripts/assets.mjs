import { execFileSync } from "node:child_process";
import {
  mkdir,
  cp,
  readFile,
  writeFile,
  rename,
  rm,
  access,
} from "node:fs/promises";
const target = "public/models/hand_landmarker.task";
const url =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
function validate(bytes) {
  // MediaPipe task bundles are ZIP containers (possibly with a short prefix).
  if (
    bytes.length < 1000000 ||
    !bytes.subarray(0, 8).includes(Buffer.from("PK\x03\x04")) ||
    !bytes.includes(Buffer.from("hand_detector.tflite"))
  ) {
    throw new Error("El archivo no es un paquete Hand Landmarker válido.");
  }
}
try {
  if (process.argv.includes("--check")) {
    validate(await readFile(target));
    await access("public/wasm/vision_wasm_internal.wasm");
    console.log("Modelo y runtime WASM presentes.");
  } else {
    await mkdir("public/wasm", { recursive: true });
    await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", {
      recursive: true,
    });
    await mkdir("public/models", { recursive: true });
    let existing = false;
    try {
      validate(await readFile(target));
      existing = true;
    } catch {}
    if (!existing) {
      let bytes;
      if (process.env.HTTPS_PROXY) {
        bytes = execFileSync(
          "curl",
          [
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--max-time",
            "120",
            url,
          ],
          { maxBuffer: 16000000, stdio: ["ignore", "pipe", "inherit"] },
        );
      } else {
        const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        bytes = Buffer.from(await r.arrayBuffer());
      }
      validate(bytes);
      await writeFile(`${target}.tmp`, bytes);
      await rename(`${target}.tmp`, target);
    }
    console.log("Recursos de visión local preparados.");
  }
} catch (error) {
  await rm(`${target}.tmp`, { force: true });
  console.error(
    `No se pudo preparar el seguimiento real: ${error.message}\nPermite storage.googleapis.com en la configuración de red y ejecuta npm run setup:assets. No se puede publicar la aplicación completa sin el modelo.`,
  );
  process.exitCode = 1;
}
