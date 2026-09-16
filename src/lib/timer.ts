export function roundTimerMinutes(elapsedMinutes: number): number {
  if (elapsedMinutes <= 0) return 0;
  return Math.max(15, Math.round(elapsedMinutes / 15) * 15);
}
