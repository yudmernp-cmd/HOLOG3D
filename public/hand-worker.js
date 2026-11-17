// Classic worker: MediaPipe's WASM loader uses importScripts.
self.exports = {};
importScripts("./vision-runtime.js");
const { FilesetResolver, HandLandmarker } = self.exports;
let detector;
function hardwareGPU() {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return (
      !!renderer && !/swiftshader|llvmpipe|softpipe|software/i.test(renderer)
    );
  } catch {
    return false;
  }
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const base = new URL("./", self.location.href);
      const files = await FilesetResolver.forVisionTasks(
        new URL("wasm", base).href,
      );
      const response = await fetch(
        new URL("models/hand_landmarker.task", base),
      );
      if (
        !response.ok ||
        response.headers.get("content-type")?.includes("text/html")
      )
        throw new Error("No se pudo cargar el modelo de manos.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let delegate = hardwareGPU() ? "GPU" : "CPU";
      const options = {
        baseOptions: { modelAssetBuffer: bytes, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      try {
        detector = await HandLandmarker.createFromOptions(files, options);
      } catch (error) {
        if (delegate === "CPU") throw error;
        delegate = "CPU";
        options.baseOptions.delegate = "CPU";
        detector = await HandLandmarker.createFromOptions(files, options);
      }
      self.postMessage({ type: "ready", delegate });
    } else if (data.type === "frame") {
      const start = performance.now();
      try {
        const result = detector.detectForVideo(data.bitmap, data.timestamp);
        self.postMessage({
          type: "result",
          landmarks: result.landmarks,
          handedness: result.handedness,
          duration: performance.now() - start,
          timestamp: data.timestamp,
        });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error.message || "Error de seguimiento",
    });
  }
};
