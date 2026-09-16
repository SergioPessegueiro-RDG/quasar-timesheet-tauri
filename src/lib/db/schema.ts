import { PROJECT_COLORS } from "../constants";
import type { SqlDriver } from "./driver";

/**
 * Schema changes are appended here as a new array, never edited in place. The
 * index of each entry is its version, tracked in SQLite's own `user_version`.
 *
 * Two deliberate differences from the Python app's schema this replaces:
 *
 *  - A block does not store a colour. Colour is joined in from its Activity's
 *    Project at read time. The old schema copied it onto every row, which meant
 *    recolouring a Project had to fan out UPDATEs across three tables and could
 *    drift out of sync. Here it simply cannot.
 *  - `activity_label` is only a fallback, read when `activity_id` is NULL because
 *    the Activity was deleted while its blocks were kept. It is never synced on
 *    rename, so there is nothing to keep in step.
 */
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE projects (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        color       TEXT    NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        collapsed   INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL
     )`,
    `CREATE TABLE activities (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        name                     TEXT    NOT NULL,
        jira_key                 TEXT,
        default_duration_minutes INTEGER,
        archived                 INTEGER NOT NULL DEFAULT 0,
        project_id               INTEGER NOT NULL REFERENCES projects(id),
        jira_project             TEXT,
        issue_type               TEXT,
        created_at               TEXT    NOT NULL
     )`,
    `CREATE TABLE time_entries (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id    INTEGER REFERENCES activities(id) ON DELETE SET NULL,
        activity_label TEXT    NOT NULL,
        date           TEXT    NOT NULL,
        start_time     TEXT    NOT NULL,
        end_time       TEXT    NOT NULL,
        notes          TEXT    NOT NULL DEFAULT '',
        jira_key       TEXT,
        jira_project   TEXT,
        issue_type     TEXT,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
     )`,
    `CREATE TABLE template_entries (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id    INTEGER REFERENCES activities(id) ON DELETE SET NULL,
        activity_label TEXT    NOT NULL,
        day_of_week    INTEGER NOT NULL,
        start_time     TEXT    NOT NULL,
        end_time       TEXT    NOT NULL,
        notes          TEXT    NOT NULL DEFAULT '',
        jira_key       TEXT,
        jira_project   TEXT,
        issue_type     TEXT,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
     )`,
    `CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT
     )`,
    `CREATE INDEX idx_time_entries_date ON time_entries(date)`,
    `CREATE INDEX idx_activities_project ON activities(project_id)`,
  ],
  [
    `ALTER TABLE time_entries ADD COLUMN external_source TEXT`,
    `ALTER TABLE time_entries ADD COLUMN external_id TEXT`,
    `CREATE UNIQUE INDEX idx_time_entries_external
       ON time_entries(external_source, external_id)
       WHERE external_id IS NOT NULL`,
  ],
  [
    `ALTER TABLE time_entries ADD COLUMN jira_worklog_id TEXT`,
    `ALTER TABLE time_entries ADD COLUMN jira_uploaded_at TEXT`,
  ],
  [
    `DELETE FROM time_entries WHERE external_source = 'outlook'`,
  ],
  [
    `CREATE UNIQUE INDEX idx_time_entries_jira_worklog
       ON time_entries(jira_worklog_id)
       WHERE jira_worklog_id IS NOT NULL`,
  ],
  [
    `ALTER TABLE activities ADD COLUMN jira_status TEXT`,
  ],
  [
    `ALTER TABLE time_entries ADD COLUMN jira_dirty INTEGER NOT NULL DEFAULT 0`,
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Brings the database up to SCHEMA_VERSION. Safe to call on every launch. */
export async function migrate(driver: SqlDriver): Promise<void> {
  await driver.execute("PRAGMA foreign_keys = ON");

  const rows = await driver.select<{ user_version: number }>("PRAGMA user_version");
  const current = rows[0]?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    for (const statement of MIGRATIONS[version]) {
      await driver.execute(statement);
    }
  }

  if (current < MIGRATIONS.length) {
    // Interpolated rather than bound: SQLite does not allow a parameter here.
    await driver.execute(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }
}

/**
 * First-run content, so a new install opens on something recognisable instead of
 * an empty grid. Skipped the moment any activity exists.
 */
export async function seedIfEmpty(driver: SqlDriver): Promise<void> {
  const [{ count }] = await driver.select<{ count: number }>(
    "SELECT COUNT(*) AS count FROM activities",
  );
  if (count > 0) return;

  const now = new Date().toISOString();

  const general = await driver.execute(
    "INSERT INTO projects (name, color, sort_order, created_at) VALUES ($1, $2, $3, $4)",
    ["General", PROJECT_COLORS[0], 0, now],
  );
  const client = await driver.execute(
    "INSERT INTO projects (name, color, sort_order, created_at) VALUES ($1, $2, $3, $4)",
    ["Client Alpha", PROJECT_COLORS[3], 1, now],
  );

  const activities: Array<[string, string | null, number | null, number]> = [
    ["Sprint Planning", null, 60, general.lastInsertId],
    ["Team Standup", null, 15, general.lastInsertId],
    ["Code Review", null, 30, general.lastInsertId],
    ["Development", "QDM-100", 120, client.lastInsertId],
  ];

  for (const [name, jiraKey, duration, projectId] of activities) {
    await driver.execute(
      `INSERT INTO activities (name, jira_key, default_duration_minutes, project_id, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, jiraKey, duration, projectId, now],
    );
  }
}
