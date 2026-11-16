import { defaults, type Settings } from "../types";

// Version 2 replaces the old mirrored default, including already saved sessions.
// An explicit mirror choice made with this version is preserved on subsequent loads.
export const preferenceVersion = 2;
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
        value.version === preferenceVersion && typeof value.mirror === "boolean"
          ? value.mirror
          : false,
    };
  } catch {
    return { ...defaults };
  }
}
