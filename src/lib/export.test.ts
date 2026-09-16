import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv, formatTimeSpent } from "./export.ts";
import type { TimeEntry } from "./types.ts";

test("Jira duration and CSV ordering match the original exporter", () => {
  assert.equal(formatTimeSpent(65), "1h 05m");
  const base: Omit<TimeEntry, "id" | "date" | "startTime"> = {
    activityId: 1,
    activityName: "Review",
    color: "#000000",
    endTime: "10:00",
    notes: 'Line one,\n"line two"',
    jiraKey: "QDM-7",
    jiraProject: null,
    issueType: null,
  };
  const entries: TimeEntry[] = [
    { ...base, id: 1, date: "2026-09-14", startTime: "09:00" },
    { ...base, id: 2, date: "2026-09-16", startTime: "09:30" },
  ];

  const result = buildCsv(entries, "Sergio");
  assert.equal(result.written, 2);
  assert.ok(result.csv.indexOf("2026-09-16") < result.csv.indexOf("2026-09-14"));
  assert.match(result.csv, /\"Line one, \"\"line two\"\"\"/);
});
