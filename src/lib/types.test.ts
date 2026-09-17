import assert from "node:assert/strict";
import test from "node:test";
import { activityMatchesQuery, isJiraSyncPending, isJiraTimeDirty, requiredWorkDescription } from "./types.ts";

test("calendar entries require a trimmed work description", () => {
  assert.equal(requiredWorkDescription("  Reviewed delivery plan  "), "Reviewed delivery plan");
  assert.throws(() => requiredWorkDescription(" \n "), /description is required/i);
});

test("Jira sync status distinguishes new, changed, and synced calendar entries", () => {
  assert.equal(isJiraSyncPending({ jiraKey: "QDM-1", jiraWorklogId: null, jiraDirty: false }), true);
  assert.equal(isJiraSyncPending({ jiraKey: "QDM-1", jiraWorklogId: "10", jiraDirty: true }), true);
  assert.equal(isJiraSyncPending({ jiraKey: "QDM-1", jiraWorklogId: "10", jiraDirty: false }), false);
  assert.equal(isJiraSyncPending({ jiraKey: null, jiraWorklogId: null, jiraDirty: false }), false);
});

test("moving a synced block back onto its last Jira time is not pending", () => {
  const synced = { date: "2026-09-17", startTime: "09:00", endTime: "10:00" };
  assert.equal(isJiraTimeDirty(true, { ...synced, startTime: "11:00", endTime: "12:00" }, synced), true);
  assert.equal(isJiraTimeDirty(true, synced, synced), false);
  assert.equal(isJiraTimeDirty(true, synced, { date: null, startTime: null, endTime: null }), true);
  assert.equal(isJiraTimeDirty(false, { ...synced, startTime: "11:00", endTime: "12:00" }, synced), false);
});

test("activity search matches QDM names, full keys, and issue numbers", () => {
  const activity = { name: "Delivery planning", jiraKey: "QDM-1234" };
  assert.equal(activityMatchesQuery(activity, "delivery"), true);
  assert.equal(activityMatchesQuery(activity, "qdm-1234"), true);
  assert.equal(activityMatchesQuery(activity, "1234"), true);
  assert.equal(activityMatchesQuery(activity, "4321"), false);
  assert.equal(activityMatchesQuery(activity, ""), true);
});
