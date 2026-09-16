import { FALLBACK_COLOR, PROJECT_COLORS } from "../constants";
import type { Activity, Project, TemplateEntry, TimeEntry } from "../types";
import { database } from "./index";

const now = () => new Date().toISOString();

/**
 * Colour and display name are resolved here, in SQL, rather than stored on the
 * block: `activity_label` is only consulted once the Activity itself is gone.
 */
const BLOCK_COLUMNS = `
    e.id                        AS id,
    e.activity_id               AS activityId,
    COALESCE(a.name, e.activity_label) AS activityName,
    COALESCE(p.color, '${FALLBACK_COLOR}') AS color,
    e.start_time                AS startTime,
    e.end_time                  AS endTime,
    e.notes                     AS notes,
    e.jira_key                  AS jiraKey,
    e.jira_project              AS jiraProject,
    e.issue_type                AS issueType`;

const BLOCK_JOINS = `
    LEFT JOIN activities a ON a.id = e.activity_id
    LEFT JOIN projects   p ON p.id = a.project_id`;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const db = await database();
  return db.select<Project>(
    `SELECT id, name, color, sort_order AS sortOrder, collapsed
       FROM projects
      ORDER BY sort_order, name COLLATE NOCASE`,
  );
}

/** Picks the first unused palette colour, so two projects rarely start alike. */
export async function addProject(name: string, color?: string): Promise<number> {
  const db = await database();
  const existing = await listProjects();
  const used = new Set(existing.map((p) => p.color));
  const chosen = color ?? PROJECT_COLORS.find((c) => !used.has(c)) ?? PROJECT_COLORS[0];
  const sortOrder = existing.length;

  const result = await db.execute(
    "INSERT INTO projects (name, color, sort_order, created_at) VALUES ($1, $2, $3, $4)",
    [name, chosen, sortOrder, now()],
  );
  return result.lastInsertId;
}

export async function updateProject(project: Project): Promise<void> {
  const db = await database();
  await db.execute(
    "UPDATE projects SET name = $1, color = $2, sort_order = $3, collapsed = $4 WHERE id = $5",
    [project.name, project.color, project.sortOrder, project.collapsed ? 1 : 0, project.id],
  );
}

export async function setProjectCollapsed(id: number, collapsed: boolean): Promise<void> {
  const db = await database();
  await db.execute("UPDATE projects SET collapsed = $1 WHERE id = $2", [collapsed ? 1 : 0, id]);
}

/** The bucket orphaned Activities land in. Created on demand. */
async function generalProjectId(excludeId?: number): Promise<number> {
  const db = await database();
  const rows = await db.select<{ id: number }>(
    "SELECT id FROM projects WHERE name = 'General' AND id <> $1",
    [excludeId ?? -1],
  );
  return rows[0]?.id ?? (await addProject("General", FALLBACK_COLOR));
}

/**
 * Activities are kept by default and moved into "General", because a Project is
 * an organisational grouping and deleting one should not destroy logged work.
 */
export async function deleteProject(id: number, deleteActivities = false): Promise<void> {
  const db = await database();
  if (deleteActivities) {
    const activities = await db.select<{ id: number }>(
      "SELECT id FROM activities WHERE project_id = $1",
      [id],
    );
    for (const { id: activityId } of activities) {
      await deleteActivity(activityId, false);
    }
  } else {
    await db.execute("UPDATE activities SET project_id = $1 WHERE project_id = $2", [
      await generalProjectId(id),
      id,
    ]);
  }
  await db.execute("DELETE FROM projects WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function listActivities(includeArchived = false): Promise<Activity[]> {
  const db = await database();
  return db.select<Activity>(
    `SELECT a.id                       AS id,
            a.name                     AS name,
            a.jira_key                 AS jiraKey,
            a.default_duration_minutes AS defaultDurationMinutes,
            a.archived                 AS archived,
            a.project_id               AS projectId,
            a.jira_project             AS jiraProject,
            a.issue_type               AS issueType,
            COALESCE(p.color, '${FALLBACK_COLOR}') AS color
       FROM activities a
       LEFT JOIN projects p ON p.id = a.project_id
      WHERE ($1 = 1 OR a.archived = 0)
      ORDER BY a.name COLLATE NOCASE`,
    [includeArchived ? 1 : 0],
  );
}

export async function addActivity(
  activity: Omit<Activity, "id" | "color">,
): Promise<number> {
  const db = await database();
  const result = await db.execute(
    `INSERT INTO activities
        (name, jira_key, default_duration_minutes, archived, project_id,
         jira_project, issue_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      activity.name,
      activity.jiraKey,
      activity.defaultDurationMinutes,
      activity.archived ? 1 : 0,
      activity.projectId,
      activity.jiraProject,
      activity.issueType,
      now(),
    ],
  );
  return result.lastInsertId;
}

export async function updateActivity(activity: Omit<Activity, "color">): Promise<void> {
  const db = await database();
  await db.execute(
    `UPDATE activities
        SET name = $1, jira_key = $2, default_duration_minutes = $3, archived = $4,
            project_id = $5, jira_project = $6, issue_type = $7
      WHERE id = $8`,
    [
      activity.name,
      activity.jiraKey,
      activity.defaultDurationMinutes,
      activity.archived ? 1 : 0,
      activity.projectId,
      activity.jiraProject,
      activity.issueType,
      activity.id,
    ],
  );
}

/**
 * Blocks are kept unless asked otherwise; the FK's ON DELETE SET NULL leaves them
 * showing their `activity_label` snapshot.
 */
export async function deleteActivity(id: number, deleteBlocks = false): Promise<void> {
  const db = await database();
  if (deleteBlocks) {
    await db.execute("DELETE FROM time_entries WHERE activity_id = $1", [id]);
    await db.execute("DELETE FROM template_entries WHERE activity_id = $1", [id]);
  }
  await db.execute("DELETE FROM activities WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

export async function listTimeEntries(startDate: string, endDate: string): Promise<TimeEntry[]> {
  const db = await database();
  return db.select<TimeEntry>(
    `SELECT ${BLOCK_COLUMNS}, e.date AS date
       FROM time_entries e ${BLOCK_JOINS}
      WHERE e.date BETWEEN $1 AND $2
      ORDER BY e.date, e.start_time`,
    [startDate, endDate],
  );
}

export type NewTimeEntry = Omit<TimeEntry, "id" | "color" | "activityName"> & {
  activityLabel: string;
};

export async function addTimeEntry(entry: NewTimeEntry): Promise<number> {
  const db = await database();
  const timestamp = now();
  const result = await db.execute(
    `INSERT INTO time_entries
        (activity_id, activity_label, date, start_time, end_time, notes,
         jira_key, jira_project, issue_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.activityId,
      entry.activityLabel,
      entry.date,
      entry.startTime,
      entry.endTime,
      entry.notes,
      entry.jiraKey,
      entry.jiraProject,
      entry.issueType,
      timestamp,
      timestamp,
    ],
  );
  return result.lastInsertId;
}

/** Used by every drag, resize and cross-day move, so it stays deliberately narrow. */
export async function moveTimeEntry(
  id: number,
  date: string,
  startTime: string,
  endTime: string,
): Promise<void> {
  const db = await database();
  await db.execute(
    "UPDATE time_entries SET date = $1, start_time = $2, end_time = $3, updated_at = $4 WHERE id = $5",
    [date, startTime, endTime, now(), id],
  );
}

export async function updateTimeEntry(entry: TimeEntry): Promise<void> {
  const db = await database();
  await db.execute(
    `UPDATE time_entries
        SET activity_id = $1, date = $2, start_time = $3, end_time = $4, notes = $5,
            jira_key = $6, jira_project = $7, issue_type = $8, updated_at = $9
      WHERE id = $10`,
    [
      entry.activityId,
      entry.date,
      entry.startTime,
      entry.endTime,
      entry.notes,
      entry.jiraKey,
      entry.jiraProject,
      entry.issueType,
      now(),
      entry.id,
    ],
  );
}

export async function deleteTimeEntry(id: number): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM time_entries WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------------
// Template entries (the permanent weekday-keyed grid)
// ---------------------------------------------------------------------------

export async function listTemplateEntries(): Promise<TemplateEntry[]> {
  const db = await database();
  return db.select<TemplateEntry>(
    `SELECT ${BLOCK_COLUMNS}, e.day_of_week AS dayOfWeek
       FROM template_entries e ${BLOCK_JOINS}
      ORDER BY e.day_of_week, e.start_time`,
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const db = await database();
  const rows = await db.select<{ value: string | null }>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await database();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
