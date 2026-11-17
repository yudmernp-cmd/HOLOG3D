import { expect, it } from "vitest";
import { HandIdentity } from "./identity";
const points = (x: number) => [{ x, y: 0.5, z: 0 }];
it("keeps identities through reordered detections and duplicate handedness labels", () => {
  const tracker = new HandIdentity();
  const first = tracker.assign([points(0.2), points(0.8)], ["Left", "Left"], 0);
  const next = tracker.assign(
    [points(0.79), points(0.21)],
    ["Left", "Left"],
    50,
  );
  expect(first[0]).not.toBe(first[1]);
  expect(next).toEqual([first[1], first[0]]);
  expect(tracker.assign([points(0.22)], ["Left"], 100)[0]).toBe(first[0]);
  expect(tracker.assign([points(0.23)], ["Left"], 500)[0]).not.toBe(first[0]);
});
