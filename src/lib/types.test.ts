import assert from "node:assert/strict";
import test from "node:test";
import { isJiraSyncPending, requiredWorkDescription } from "./types.ts";

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
