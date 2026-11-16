import { defaults, type Settings } from "../types";

// Version 3 migrates the misleading 'direct image' default to user-relative
// controls. Store an explicit orientation, not the ambiguous legacy mirror flag.
export const preferenceVersion = 3;
export function parsePreferences(raw: string | null): Settings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return { ...defaults };
    return {
      ...defaults,
      color:
        typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)
          ? value.color
          : defaults.color,
      quality: [0, 1, 2].includes(value.quality)
        ? value.quality
        : defaults.quality,
      mirror:
        value.version === preferenceVersion &&
        value.cameraOrientation === "camera"
          ? false
          : true,
    };
  } catch {
    return { ...defaults };
  }
}
export function serializePreferences(settings: Settings): string {
  const { mirror, ...rest } = settings;
  return JSON.stringify({
    ...rest,
    version: preferenceVersion,
    cameraOrientation: mirror ? "user" : "camera",
  });
}
