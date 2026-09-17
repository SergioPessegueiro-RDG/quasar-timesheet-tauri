import { DEFAULT_END_HOUR, DEFAULT_START_HOUR, SLOT_MINUTES } from "./constants.ts";
import { toMinutes } from "./types.ts";

export const DAY_MS = 86_400_000;

export function calendarFocusStart(currentMinute: number): number {
  return Math.min(16 * 60, Math.max(7 * 60, currentMinute - 4 * 60));
}

export function startOfWeek(value: Date): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

export function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function isoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function snapMinute(
  minute: number,
  max = (DEFAULT_END_HOUR - DEFAULT_START_HOUR) * 60,
  min = 0,
): number {
  return Math.max(min, Math.min(max, Math.round(minute / SLOT_MINUTES) * SLOT_MINUTES));
}

/** Slides a block while keeping its duration, including earlier in the day. */
export function shiftBlock(
  startMinute: number,
  endMinute: number,
  deltaMinutes: number,
  totalMinutes: number,
): { start: number; end: number } {
  const duration = endMinute - startMinute;
  const delta = snapMinute(deltaMinutes, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
  const start = Math.max(0, Math.min(totalMinutes - duration, startMinute + delta));
  return { start, end: start + duration };
}

export interface CalendarLayout {
  column: number;
  columns: number;
}

/**
 * Packs transitively-overlapping blocks into the fewest columns. Separate
 * clusters retain the full day width.
 */
export function layoutOverlaps<T extends { id: number; startTime: string; endTime: string }>(
  entries: T[],
): Map<number, CalendarLayout> {
  const result = new Map<number, CalendarLayout>();
  const sorted = [...entries].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)
      || toMinutes(a.endTime) - toMinutes(b.endTime),
  );

  const flush = (cluster: T[]) => {
    const columnEnds: number[] = [];
    const columns = new Map<number, number>();
    for (const entry of cluster) {
      const start = toMinutes(entry.startTime);
      const end = toMinutes(entry.endTime);
      const reusable = columnEnds.findIndex((lastEnd) => start >= lastEnd);
      const column = reusable === -1 ? columnEnds.length : reusable;
      columnEnds[column] = end;
      columns.set(entry.id, column);
    }
    for (const entry of cluster) {
      result.set(entry.id, { column: columns.get(entry.id) ?? 0, columns: columnEnds.length });
    }
  };

  let cluster: T[] = [];
  let clusterEnd = -1;
  for (const entry of sorted) {
    const start = toMinutes(entry.startTime);
    const end = toMinutes(entry.endTime);
    if (cluster.length && start >= clusterEnd) {
      flush(cluster);
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush(cluster);
  return result;
}

export function textColor(background: string): "#111827" | "#ffffff" {
  const hex = background.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111827" : "#ffffff";
}
