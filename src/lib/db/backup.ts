import { database } from "./index";

const FORMAT = "quasar-timesheet-backup";
const VERSION = 1;

const TABLES = {
  projects: ["id", "name", "color", "sort_order", "collapsed", "created_at"],
  activities: [
    "id", "name", "jira_key", "default_duration_minutes", "archived",
    "project_id", "jira_project", "issue_type", "created_at",
  ],
  time_entries: [
    "id", "activity_id", "activity_label", "date", "start_time", "end_time",
    "notes", "jira_key", "jira_project", "issue_type", "created_at", "updated_at",
    "external_source", "external_id", "jira_worklog_id", "jira_uploaded_at",
  ],
  template_entries: [
    "id", "activity_id", "activity_label", "day_of_week", "start_time", "end_time",
    "notes", "jira_key", "jira_project", "issue_type", "created_at", "updated_at",
  ],
  settings: ["key", "value"],
} as const;

type TableName = keyof typeof TABLES;
type BackupRow = Record<string, unknown>;

interface BackupDocument {
  format: typeof FORMAT;
  version: typeof VERSION;
  createdAt: string;
  tables: Record<TableName, BackupRow[]>;
}

export async function createBackup(): Promise<string> {
  const db = await database();
  const tables = {} as BackupDocument["tables"];
  for (const table of Object.keys(TABLES) as TableName[]) {
    const filter = table === "settings" ? " WHERE key <> 'outlook_ics_urls'" : "";
    tables[table] = await db.select<BackupRow>(`SELECT * FROM ${table}${filter}`);
  }
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    tables,
  } satisfies BackupDocument, null, 2);
}

function parseBackup(json: string): BackupDocument {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object") throw new Error("This is not a QUASAR backup.");
  const document = value as Partial<BackupDocument>;
  if (document.format !== FORMAT || document.version !== VERSION || !document.tables) {
    throw new Error("This backup format is not supported.");
  }
  for (const table of Object.keys(TABLES) as TableName[]) {
    if (!Array.isArray(document.tables[table])) throw new Error(`Backup is missing ${table}.`);
  }
  return document as BackupDocument;
}

export async function restoreBackup(json: string): Promise<void> {
  const backup = parseBackup(json);
  const db = await database();
  await db.execute("PRAGMA foreign_keys = OFF");
  let transactionStarted = false;
  try {
    await db.execute("BEGIN IMMEDIATE");
    transactionStarted = true;
    for (const table of ["time_entries", "template_entries", "activities", "projects", "settings"] as TableName[]) {
      await db.execute(`DELETE FROM ${table}`);
    }
    for (const table of Object.keys(TABLES) as TableName[]) {
      const columns = TABLES[table];
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
      for (const row of backup.tables[table]) {
        await db.execute(sql, columns.map((column) => row[column] ?? null));
      }
    }
    const violations = await db.select<Record<string, unknown>>("PRAGMA foreign_key_check");
    if (violations.length) throw new Error("Backup contains invalid project or activity references.");
    await db.execute("COMMIT");
    transactionStarted = false;
  } catch (cause) {
    if (transactionStarted) await db.execute("ROLLBACK");
    throw cause;
  } finally {
    await db.execute("PRAGMA foreign_keys = ON");
  }
}
