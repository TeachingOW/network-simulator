const MIN_VISIBLE_REAL_MS = 140;

export function packetAnimationState(flight, simulationTime, speed = 1) {
  const rate = Number.isFinite(Number(speed))
    ? Math.max(0.1, Math.min(20, Number(speed)))
    : 1;
  const propagationTime = Math.max(0, flight.end - flight.start);
  const visibleTime = Math.max(propagationTime, MIN_VISIBLE_REAL_MS * rate);
  const visualEnd = flight.start + visibleTime;
  if (simulationTime < flight.start || simulationTime > visualEnd) return null;
  const raw = Math.max(0, Math.min(1, (simulationTime - flight.start) / visibleTime));
  return {raw, progress: raw * raw * (3 - 2 * raw)};
}
