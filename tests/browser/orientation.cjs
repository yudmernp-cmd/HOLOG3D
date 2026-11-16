const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const deadline = setTimeout(() => {
  console.error("Orientation test timed out");
  process.exit(1);
}, 90000);
deadline.unref();
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("holomotion"))
      localStorage.setItem(
        "holomotion",
        JSON.stringify({ version: 2, mirror: false, quality: 0 }),
      );
  });
  await page.goto(process.env.TEST_URL || "http://localhost:5173");
  await page.getByRole("button", { name: "Explorar con ratón" }).click();
  await page.getByRole("button", { name: /Dibujo en el aire/ }).click();
  // Real video compositing from an asymmetric synthetic source, no simulated hand detection.
  await page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 640;
    source.height = 480;
    const ctx = source.getContext("2d");
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, 640, 480);
    const video = document.querySelector("video");
    const stream = source.captureStream(30);
    window.orientationSource = { source, stream };
    video.srcObject = stream;
    await Promise.race([
      video.play(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Test video did not start")), 10000),
      ),
    ]);
  });
  async function markerAt(sensorX, mirror) {
    const expected = await page.evaluate(
      async ({ sensorX, mirror }) => {
        const { project } = await import("/src/tracking/gestures.ts");
        const { source } = window.orientationSource;
        const ctx = source.getContext("2d");
        ctx.fillStyle = "#111111";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(sensorX * 640 - 15, 240 - 15, 30, 30);
        const video = document.querySelector("video");
        video.style.opacity = "1";
        document.querySelector(".grid-floor").hidden = true;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("No new video frame")),
            10000,
          );
          video.requestVideoFrameCallback(() => {
            clearTimeout(timer);
            resolve();
          });
        });
        const rect = video.getBoundingClientRect();
        return (
          project(
            { x: sensorX, y: 0.5, z: 0 },
            640,
            480,
            rect.width,
            rect.height,
            mirror,
          ).x +
          rect.width / 2
        );
      },
      { sensorX, mirror },
    );
    const bytes = await page.locator("video").screenshot();
    const found = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0,
        count = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i] < 50 && data[i + 1] > 180 && data[i + 2] < 50) {
            sum += x;
            count++;
          }
        }
      return { x: sum / count, count };
    }, Array.from(bytes));
    assert.ok(
      found.count > 50,
      "The test marker must be visible in the composited video.",
    );
    assert.ok(
      Math.abs(found.x - expected) < 3,
      `Camera marker ${found.x} and overlay ${expected} must align.`,
    );
    return found.x;
  }
  const start = await markerAt(0.5, true);
  const right = await markerAt(0.25, true);
  assert.ok(
    right > start,
    "The user's rightward motion must appear to the right.",
  );
  await page
    .getByRole("button", { name: "Invertir izquierda/derecha", exact: true })
    .click();
  const raw = await markerAt(0.25, false);
  assert.ok(raw < start);
  await page.evaluate(() =>
    window.orientationSource.stream.getTracks().forEach((t) => t.stop()),
  );
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Invertir izquierda/derecha", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: version 2 direct-image migration, actual video pixel direction, exact landmark alignment, explicit inverse view, persistence, mobile layout.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
