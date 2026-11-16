/** MediaPipe always receives the unmodified camera frame.
 * A camera facing the user sees their right on the sensor's left.
 * Flip once for a self-view that follows the user's lateral movements.
 */
export function displayX(sensorX: number, mirror: boolean): number {
  return mirror ? 1 - sensorX : sensorX;
}
export function videoTransform(mirror: boolean): string {
  return mirror ? "scaleX(-1)" : "none";
}
