const { chromium } = require("playwright");
const assert = require("node:assert/strict");
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
  const page = await browser.newPage();
  await page.goto(process.env.TEST_URL || "http://localhost:5173");
  const result = await page.evaluate(async () => {
    const { Engine } = await import("/src/scene/engine.ts");
    const { defaults } = await import("/src/types.ts");
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:500px;height:400px";
    document.body.append(canvas);
    const engine = new Engine(
      canvas,
      { ...defaults, mode: "draw", landmarks: false },
      () => ({ hands: [], width: 640, height: 480 }),
      () => {},
    );
    cancelAnimationFrame(engine.raf);
    for (let i = 0; i < 1801; i++) {
      engine.pointer = {
        x: (i % 100) * 4,
        y: Math.floor(i / 100) * 4,
        down: true,
      };
      engine.animate(i * 17 + 100);
      cancelAnimationFrame(engine.raf);
    }
    const result = {
      segments: engine.strokes.count,
      calls: engine.renderer.info.render.calls,
      geometry: engine.renderer.info.memory.geometries,
    };
    engine.clear();
    result.cleared = engine.strokes.count;
    engine.dispose();
    canvas.remove();
    return result;
  });
  assert.equal(result.segments, 1800);
  assert.equal(result.calls, 1);
  assert.equal(result.cleared, 0);
  console.log(result);
  await page.getByRole("button", { name: "Explorar con ratón" }).click();
  await page.getByRole("button", { name: /Dibujo en el aire/ }).click();
  await page.mouse.move(700, 300);
  await page.mouse.down();
  await page.mouse.move(900, 450, { steps: 15 });
  await page.mouse.up();
  const download = page.waitForEvent("download");
  await page.getByTitle("Guardar gráficos como PNG transparente").click();
  const file = await download;
  assert.equal(await file.failure(), null);
  console.log("PASS: 1800 strokes in one draw call, clear, PNG download.");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
