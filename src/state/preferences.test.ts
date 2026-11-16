import { describe, it, expect } from "vitest";
import { defaults } from "../types";
import {
  parsePreferences,
  serializePreferences,
  preferenceVersion,
} from "./preferences";
describe("user-relative camera orientation", () => {
  it("defaults to following the user's right for new or corrupted preferences", () => {
    for (const raw of [null, "broken", "null", "123"])
      expect(parsePreferences(raw).mirror).toBe(true);
  });
  it("migrates both old mirror flags, including version 2 direct image, without losing color or quality", () => {
    for (const version of [undefined, 1, 2])
      for (const mirror of [true, false]) {
        expect(
          parsePreferences(
            JSON.stringify({ version, mirror, quality: 2, color: "#8b5cf6" }),
          ),
        ).toMatchObject({ mirror: true, quality: 2, color: "#8b5cf6" });
      }
  });
  it("remembers an explicit new orientation through save and reload", () => {
    for (const mirror of [true, false]) {
      const raw = serializePreferences({ ...defaults, mirror });
      expect(JSON.parse(raw)).toMatchObject({
        version: preferenceVersion,
        cameraOrientation: mirror ? "user" : "camera",
      });
      expect(parsePreferences(raw).mirror).toBe(mirror);
    }
  });
  it("ignores the obsolete boolean and rejects unknown orientation values", () => {
    for (const cameraOrientation of [undefined, "invalid", false])
      expect(
        parsePreferences(
          JSON.stringify({
            version: preferenceVersion,
            cameraOrientation,
            mirror: false,
          }),
        ).mirror,
      ).toBe(true);
  });
});
