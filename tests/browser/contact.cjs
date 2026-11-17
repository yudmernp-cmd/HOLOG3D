const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.TEST_URL || "http://localhost:5173");
    const result = await page.evaluate(async () => {
      const { Engine } = await import("/src/scene/engine.ts");
      const { defaults } = await import("/src/types.ts");
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "width:800px;height:600px";
      document.body.append(canvas);
      let tracking = { hands: [], width: 800, height: 600 };
      const engine = new Engine(
        canvas,
        { ...defaults, mode: "hologram", shape: "Esfera" },
        () => tracking,
        () => {},
      );
      cancelAnimationFrame(engine.raf);
      let now = 100;
      const tick = () => {
        engine.animate((now += 50));
        cancelAnimationFrame(engine.raf);
      };
      const hand = (x, pinch, id = "a") => ({
        id,
        points: Array.from({ length: 21 }, () => ({
          x: 0.5 - x / 800,
          y: 0.5,
          z: 0,
        })),
        gesture: pinch ? "pinch" : "open",
        center: { x: 0.5, y: 0.5, z: 0 },
        angle: 0,
        size: 0.1,
        speed: 0,
        pinchStart: false,
      });
      tick();
      tracking = { ...tracking, hands: [hand(300, false)] };
      tick();
      tracking = { ...tracking, hands: [hand(300, true)] };
      tick();
      const outside = engine.interaction.grips.size;
      tracking = { ...tracking, hands: [hand(0, false)] };
      tick();
      tracking = { ...tracking, hands: [hand(0, true)] };
      tick();
      const acquired = engine.interaction.grips.size;
      tracking = { ...tracking, hands: [hand(80, true)] };
      for (let i = 0; i < 10; i++) tick();
      const moved = engine.group.position.x;
      tracking = { ...tracking, hands: [hand(80, false)] };
      tick();
      const released = engine.group.position.x;
      tracking = { ...tracking, hands: [hand(-200, false)] };
      for (let i = 0; i < 10; i++) tick();
      const stationary = engine.group.position.x;
      engine.update({ ...defaults, mode: "hologram", manipulation: "rotate" });
      tick();
      tracking = { ...tracking, hands: [hand(80, true)] };
      tick();
      tracking = { ...tracking, hands: [hand(130, true)] };
      for (let i = 0; i < 10; i++) tick();
      const rotation = engine.group.quaternion.y;
      engine.dispose();
      canvas.remove();
      return { outside, acquired, moved, released, stationary, rotation };
    });
    assert.equal(result.outside, 0);
    assert.equal(result.acquired, 1);
    assert.ok(result.moved > 79);
    assert.equal(result.stationary, result.released);
    assert.ok(Math.abs(result.rotation) > 0.1);
    await page.getByRole("button", { name: "Explorar con ratón" }).click();
    await page.locator("#manipulation").selectOption("rotate");
    await page.screenshot({
      path: "/tmp/holomotion-contact.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS projected contact, real Engine drag/hold/arcball, UI",
      result,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
