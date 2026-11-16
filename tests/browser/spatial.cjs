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
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("holomotion"))
      localStorage.setItem(
        "holomotion",
        JSON.stringify({
          version: 2,
          mirror: false,
          color: "#00d9ff",
          quality: 0,
        }),
      );
  });
  await page.goto(process.env.TEST_URL || "http://localhost:5173");
  const orientationButton = page.getByRole("button", {
    name: "Invertir izquierda/derecha",
    exact: true,
  });
  assert.equal(await orientationButton.getAttribute("aria-pressed"), "true");
  assert.match(
    await page.locator("video").evaluate((v) => getComputedStyle(v).transform),
    /^matrix\(-1/,
  );
  await orientationButton.click();
  assert.equal(
    await page.locator("video").evaluate((v) => getComputedStyle(v).transform),
    "none",
  );
  await page.reload();
  assert.equal(await orientationButton.getAttribute("aria-pressed"), "false");
  await orientationButton.click();
  const result = await page.evaluate(async () => {
    const { Engine } = await import("/src/scene/engine.ts");
    const { defaults } = await import("/src/types.ts");
    function hand(gesture = "open", x = 0.5, y = 0.55, size = 1) {
      const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
      points[0] = { x, y: y + 0.1 * size, z: 0 };
      points[9] = { x, y: y - 0.1 * size, z: 0 };
      points[5] = { x: x - 0.06 * size, y: y - 0.07 * size, z: 0 };
      points[17] = { x: x + 0.06 * size, y: y - 0.07 * size, z: 0 };
      return {
        id: "Left",
        gesture,
        points,
        center: { x, y, z: 0 },
        size: 0.2 * size,
        angle: 0,
        pinchStart: false,
        speed: 0,
      };
    }
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:640px;height:480px";
    document.body.append(canvas);
    let tracking = { hands: [], width: 640, height: 480 };
    const engine = new Engine(
      canvas,
      { ...defaults, mode: "hologram", quality: 0 },
      () => tracking,
      () => {},
    );
    cancelAnimationFrame(engine.raf);
    let now = 0;
    function step(hands) {
      tracking = { ...tracking, hands };
      engine.animate(now);
      now += 50;
      cancelAnimationFrame(engine.raf);
    }
    step([hand("neutral", 0.356, 0.5)]);
    step([hand("pinch", 0.39, 0.5)]);
    const calibrated = engine.spatial.calibrated;
    for (let i = 0; i < 20; i++) step([hand("pinch", 0.256, 0.5)]);
    const position = engine.group.position.toArray(),
      scale = engine.group.scale.x,
      rotation = engine.group.rotation.y;
    for (let i = 0; i < 15; i++) step([hand("fist", 0.15, 0.85, 0.6)]);
    const held = {
      position: engine.group.position.toArray(),
      scale: engine.group.scale.x,
      rotation: engine.group.rotation.y,
    };
    for (let i = 0; i < 8; i++) step([hand("open", 0.2, 0.8, 0.8)]);
    const regrab = engine.group.position.toArray();
    for (let i = 0; i < 8; i++) step([]);
    const lost = {
      position: engine.group.position.toArray(),
      rotation: engine.group.rotation.y,
    };
    engine.update({
      ...defaults,
      mode: "hologram",
      quality: 0,
      mirror: !defaults.mirror,
    });
    step([]);
    const mirrored = engine.group.position.toArray();
    const pose = engine.spatial.pose;
    const tipX = 0.5 + (pose.x + (engine.spatial.handleUnit * 1.65) / (4 / 3));
    step([hand("neutral", tipX, 0.5 - pose.y)]);
    step([hand("pinch", tipX, 0.5 - pose.y)]);
    const manual = engine.spatial.state,
      spin = engine.group.rotation.y;
    step([hand("pinch", tipX, 0.5 - pose.y)]);
    const stopped = engine.group.rotation.y === spin;
    step([]);
    const resumed = engine.group.rotation.y > spin;
    engine.dispose();
    canvas.remove();
    return {
      manual,
      stopped,
      resumed,
      calibrated,
      position,
      scale,
      rotation,
      held,
      regrab,
      lost,
      mirrored,
    };
  });
  assert.equal(result.manual, "rotating");
  assert.ok(result.stopped);
  assert.ok(result.resumed);
  assert.equal(result.calibrated, true);
  assert.notEqual(result.position[0], 0);
  assert.equal(result.position[2], 0);
  assert.deepEqual(result.held.position, result.position);
  assert.equal(result.held.scale, result.scale);
  assert.ok(result.held.rotation > result.rotation);
  assert.deepEqual(result.regrab, result.position);
  assert.deepEqual(result.lost.position, result.position);
  assert.ok(result.lost.rotation > result.held.rotation);
  assert.equal(result.mirrored[0], -result.position[0]);
  assert.equal(result.mirrored[2], result.position[2]);
  await page.getByRole("button", { name: "Explorar con ratón" }).click();
  await page.getByRole("button", { name: /Hologramas 3D/ }).click();
  await page.getByRole("button", { name: "Figura Cubo", exact: true }).click();
  await page.mouse.move(820, 420);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/holomotion-spatial-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: "/tmp/holomotion-spatial-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mirror migration and persistence; ring contact drag; fist freezes position/size while rotation continues; no-snap regrab; tracking loss; mirrored world; mobile layout.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
