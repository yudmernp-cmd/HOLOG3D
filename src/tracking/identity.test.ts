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
  expect(tracker.assign([points(0.23)], ["Left"], 900)[0]).not.toBe(first[0]);
});

it("recovers the second identity after a brief occlusion without swapping hands", () => {
  const t = new HandIdentity();
  const ids = t.assign([points(0.2), points(0.8)], ["Left", "Right"], 0);
  t.assign([points(0.25)], ["Left"], 300);
  expect(
    t.assign([points(0.78), points(0.26)], ["Right", "Left"], 500),
  ).toEqual([ids[1], ids[0]]);
});
