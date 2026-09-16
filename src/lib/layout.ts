export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 440;

export function clampSidebarWidth(value: number, viewportWidth: number): number {
  const responsiveMaximum = Math.min(MAX_SIDEBAR_WIDTH, viewportWidth * 0.45);
  return Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(value, responsiveMaximum)));
}
