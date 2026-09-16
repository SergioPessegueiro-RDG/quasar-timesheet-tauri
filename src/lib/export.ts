import { DEFAULT_ISSUE_TYPE, DEFAULT_JIRA_PROJECT } from "./constants.ts";
import type { TimeEntry } from "./types.ts";
import { durationMinutes } from "./types.ts";

export const CSV_HEADER = [
  "Project",
  "Issue Type",
  "Key",
  "Date Started",
  "Display Name",
  "Time Spent (h)",
  "Work Description",
];

export function formatTimeSpent(minutes: number): string {
  const safe = Math.max(0, minutes);
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(
  entries: TimeEntry[],
  displayName: string,
): { csv: string; written: number; skipped: number } {
  const exportable = entries
    .filter((entry) => entry.jiraKey?.trim())
    .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));

  const rows = exportable.map((entry) => [
    entry.jiraProject?.trim() || DEFAULT_JIRA_PROJECT,
    entry.issueType?.trim() || DEFAULT_ISSUE_TYPE,
    entry.jiraKey?.trim() ?? "",
    `${entry.date} 00:00:00`,
    displayName.trim(),
    formatTimeSpent(durationMinutes(entry)),
    (entry.notes || entry.activityName).replace(/\s*\n\s*/g, " ").trim(),
  ]);

  return {
    csv: [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
    written: exportable.length,
    skipped: entries.length - exportable.length,
  };
}
