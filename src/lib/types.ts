/**
 * Three different things in this app could reasonably be called "project", so
 * to be explicit, matching the vocabulary users already know:
 *
 *  - Activity    what you log time against, e.g. "Sprint Planning".
 *  - Project     the colour-owning group an Activity belongs to, e.g. "Client A".
 *                Recolouring a Project recolours every block inside it.
 *  - jiraProject the real Jira project time exports *into*, unrelated to either.
 */

/** A collapsible, colour-owning group in the sidebar. */
export interface Project {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  collapsed: boolean;
  jiraKey?: string | null;
}

/** A single loggable thing, dragged onto the calendar. Belongs to one Project. */
export interface Activity {
  id: number;
  name: string;
  jiraKey: string | null;
  defaultDurationMinutes: number | null;
  archived: boolean;
  projectId: number;
  jiraProject: string | null;
  issueType: string | null;
  jiraStatus?: string | null;
  /** Read-only, joined in from the owning Project. Never stored on the activity. */
  color: string;
}

/** Fields shared by a real dated block and a recurring template block. */
interface BlockBase {
  id: number;
  activityId: number | null;
  /** Joined from the activity, falling back to the label kept for deleted ones. */
  activityName: string;
  /** Joined from the activity's project. */
  color: string;
  startTime: string; // "HH:MM", 24h
  endTime: string; // "HH:MM", 24h
  notes: string;
  jiraKey: string | null;
  jiraProject: string | null;
  issueType: string | null;
}

/** A block on a real calendar date. */
export interface TimeEntry extends BlockBase {
  date: string; // "YYYY-MM-DD"
  jiraWorklogId?: string | null;
  jiraDirty?: boolean;
}

/** A block on the permanent Template grid, keyed by weekday rather than a date. */
export interface TemplateEntry extends BlockBase {
  dayOfWeek: number; // 0 = Monday
}

export type AnyBlock = TimeEntry | TemplateEntry;

export function requiredWorkDescription(value: string): string {
  const description = value.trim();
  if (!description) throw new Error("A work description is required.");
  return description;
}

export function isJiraSyncPending(
  entry: Pick<TimeEntry, "jiraKey" | "jiraWorklogId" | "jiraDirty">,
): boolean {
  return Boolean(entry.jiraKey && (!entry.jiraWorklogId || entry.jiraDirty));
}

export function isTimeEntry(block: AnyBlock): block is TimeEntry {
  return "date" in block;
}

/** Minutes covered by a block, derived rather than stored. */
export function durationMinutes(block: Pick<BlockBase, "startTime" | "endTime">): number {
  return toMinutes(block.endTime) - toMinutes(block.startTime);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
