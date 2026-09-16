/** Granularity of the calendar grid, and the unit every drag snaps to. */
export const SLOT_MINUTES = 15;

/** Defaults for the visible work day. Both are user settings; see settings.ts. */
export const DEFAULT_START_HOUR = 9;
export const DEFAULT_END_HOUR = 17; // exclusive: 17 means the grid ends at 5pm

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export const WEEKEND_NAMES = ["Saturday", "Sunday"] as const;

/** Pixels of movement before a press is treated as a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 6;

/** How close to a block's top/bottom edge counts as grabbing a resize handle. */
export const RESIZE_GRIP_PX = 7;

/** A block can never be dragged or resized shorter than one slot. */
export const MIN_BLOCK_MINUTES = SLOT_MINUTES;

export const GUTTER_WIDTH_PX = 60;
export const HEADER_HEIGHT_PX = 44;
export const MIN_SLOT_HEIGHT_PX = 22;
export const MAX_SLOT_HEIGHT_PX = 64;
export const MIN_DAY_WIDTH_PX = 140;
export const MAX_DAY_WIDTH_PX = 340;
export const BLOCK_RADIUS_PX = 10;
export const UNDO_LIMIT = 50;
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.3;
export const ZOOM_STEP = 0.15;

/**
 * Palette offered when creating a Project. Every block's colour comes from its
 * Activity's Project, so these are the only colours that ever reach the grid.
 * The last entry is a muted neutral, which is why the catch-all "General"
 * project and any orphaned block fall back to it.
 */
export const PROJECT_COLORS = [
  "#4C6EF5",
  "#12B886",
  "#F76707",
  "#E64980",
  "#7048E8",
  "#1098AD",
  "#F59F00",
  "#82C91E",
  "#E03131",
  "#495057",
] as const;

export const FALLBACK_COLOR = PROJECT_COLORS[PROJECT_COLORS.length - 1];

/**
 * Every exported row goes into the same Jira project as the same issue type, so
 * these are constants rather than settings a typo could get into. An individual
 * block may still override either one.
 */
export const DEFAULT_JIRA_PROJECT = "Quasar Delivery Management";
export const DEFAULT_ISSUE_TYPE = "Sub-task";

/** Every issue key here shares one prefix, so users only ever type the number. */
export const JIRA_KEY_PREFIX = "QDM-";

/** Strips the prefix for display in a number-only field. */
export function jiraKeyNumber(fullKey: string | null | undefined): string {
  const key = (fullKey ?? "").trim();
  if (!key) return "";
  // Anything not carrying the prefix is shown as-is rather than silently hidden.
  return key.toUpperCase().startsWith(JIRA_KEY_PREFIX) ? key.slice(JIRA_KEY_PREFIX.length).trim() : key;
}

/** Rebuilds the full key, tolerating someone typing the prefix themselves. */
export function jiraKeyFromNumber(number: string | null | undefined): string | null {
  const value = (number ?? "").trim();
  if (!value) return null;
  return value.toUpperCase().startsWith(JIRA_KEY_PREFIX) ? value : `${JIRA_KEY_PREFIX}${value}`;
}
