import { describe, it, expect } from "vitest";
import { parsePreferences, preferenceVersion } from "./preferences";
describe("camera orientation migration", () => {
  it("defaults to the direct image for new or corrupted preferences", () => {
    for (const raw of [null, "broken", "null", "123"])
      expect(parsePreferences(raw).mirror).toBe(false);
  });
  it("fixes the old mirrored default without losing color or quality", () => {
    expect(
      parsePreferences(
        JSON.stringify({ mirror: true, quality: 2, color: "#8b5cf6" }),
      ),
    ).toMatchObject({ mirror: false, quality: 2, color: "#8b5cf6" });
  });
  it("remembers a deliberate mirror toggle in the new version", () => {
    for (const mirror of [true, false])
      expect(
        parsePreferences(JSON.stringify({ version: preferenceVersion, mirror }))
          .mirror,
      ).toBe(mirror);
  });
});
