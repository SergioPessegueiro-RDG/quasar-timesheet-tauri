import assert from "node:assert/strict";
import test from "node:test";
import { jiraCloudUrl, uploadJiraWorklog } from "./jira.ts";
import type { TimeEntry } from "./types.ts";

const entry: TimeEntry = {
  id: 1,
  activityId: 2,
  activityName: "Planning",
  color: "#000",
  date: "2026-09-16",
  startTime: "09:00",
  endTime: "10:30",
  notes: "Sprint plan",
  jiraKey: "QDM-123",
  jiraProject: null,
  issueType: null,
};

test("Jira upload uses Cloud v3 worklogs and never puts credentials in the URL", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({ id: "456" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  const id = await uploadJiraWorklog(entry, {
    baseUrl: "https://example.atlassian.net/",
    email: "user@example.com",
    apiToken: "secret-token",
  }, fetcher);

  assert.equal(id, "456");
  assert.equal(requestUrl, "https://example.atlassian.net/rest/api/3/issue/QDM-123/worklog");
  assert.ok(!requestUrl.includes("secret-token"));
  assert.match(String(new Headers(requestInit?.headers).get("Authorization")), /^Basic /);
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.timeSpentSeconds, 5_400);
  assert.equal(body.comment.content[0].content[0].text, "Sprint plan");
});

test("Jira URL validation blocks token exfiltration to arbitrary hosts", () => {
  assert.throws(() => jiraCloudUrl("http://example.atlassian.net"), /HTTPS Jira Cloud/);
  assert.throws(() => jiraCloudUrl("https://atlassian.net.evil.example"), /HTTPS Jira Cloud/);
});
