import type { Tracking } from "../types";
/** Capture time measures latency; receipt time determines whether the worker has stopped responding. */
export function trackingIsFresh(data: Tracking, now: number) {
  const received = data.receivedAt ?? data.timestamp;
  return received === undefined || now - received <= 500;
}
