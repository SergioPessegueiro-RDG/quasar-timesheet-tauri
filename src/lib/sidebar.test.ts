import assert from "node:assert/strict";
import test from "node:test";
import { organizeActivities } from "./sidebar.ts";
import type { Activity, Project } from "./types.ts";

const projects: Project[] = [
  { id: 1, name: "QDM-1 · Shared", color: "#123456", sortOrder: 0, collapsed: false, jiraKey: "QDM-1" },
  { id: 2, name: "QDM-2 · Mixed", color: "#654321", sortOrder: 1, collapsed: false, jiraKey: "QDM-2" },
];
const activity = (id: number, projectId: number, jiraStatus: string): Activity => ({
  id,
  projectId,
  jiraStatus,
  name: `Ticket ${id}`,
  jiraKey: `QDM-${id}`,
  color: "#123456",
  defaultDurationMinutes: 30,
  archived: false,
  jiraProject: "QDM",
  issueType: "Task",
});

test("closed QDMs move to Archived and fully closed parents move with them", () => {
  const result = organizeActivities(projects, [
    activity(10, 1, "Closed"),
    activity(11, 1, "CLOSED"),
    activity(20, 2, "In Progress"),
    activity(21, 2, "Closed"),
  ]);

  assert.deepEqual(result.activeGroups.map(({ project, activities }) => [
    project.id,
    activities.map(({ id }) => id),
  ]), [[2, [20]]]);
  assert.deepEqual(result.archivedGroups.map(({ project, activities }) => [
    project.id,
    activities.map(({ id }) => id),
  ]), [[1, [10, 11]]]);
  assert.deepEqual(result.archivedActivities.map(({ id }) => id), [21]);
});
