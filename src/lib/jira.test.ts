import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchAssignedJiraIssues,
  fetchJiraWorklogs,
  jiraCloudUrl,
  jiraWorklogTimes,
  testJiraConnection,
  uploadJiraWorklog,
} from "./jira.ts";
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

test("Jira connection test returns the authenticated user", async () => {
  const user = await testJiraConnection({
    baseUrl: "https://example.atlassian.net",
    email: "user@example.com",
    apiToken: "secret-token",
  }, async (url) => {
    assert.equal(String(url), "https://example.atlassian.net/rest/api/3/myself");
    return Response.json({ accountId: "account-1", displayName: "Sergio" });
  });
  assert.deepEqual(user, { accountId: "account-1", displayName: "Sergio" });
});

test("Jira worklogs map to local calendar times and stay within one day", () => {
  assert.deepEqual(jiraWorklogTimes("2026-09-16T09:00:00.000+0100", 3600), {
    date: "2026-09-16",
    startTime: "09:00",
    endTime: "10:00",
  });
  assert.deepEqual(jiraWorklogTimes("2026-09-16T23:30:00.000+0100", 7200), {
    date: "2026-09-16",
    startTime: "23:30",
    endTime: "23:59",
  });
});

test("Jira sync fetches assigned open QDMs and only the current user's worklogs", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/search/jql")) {
      const body = JSON.parse(String(init?.body));
      if (body.jql.includes("worklogAuthor")) {
        return Response.json({
          isLast: true,
          issues: [{ id: "100", key: "QDM-100", fields: { summary: "Delivery planning", issuetype: { name: "Task" } } }],
        });
      }
      return Response.json({
        isLast: true,
        issues: [{ id: "100", key: "QDM-100", fields: { summary: "Delivery planning", issuetype: { name: "Task" } } }],
      });
    }
    return Response.json({
      startAt: 0,
      maxResults: 100,
      total: 2,
      worklogs: [
        {
          id: "501",
          author: { accountId: "account-1" },
          started: "2026-09-16T09:00:00.000+0100",
          timeSpentSeconds: 3600,
          comment: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Review" }] }] },
        },
        {
          id: "502",
          author: { accountId: "someone-else" },
          started: "2026-09-16T10:00:00.000+0100",
          timeSpentSeconds: 1800,
        },
      ],
    });
  };
  const credentials = {
    baseUrl: "https://example.atlassian.net",
    email: "user@example.com",
    apiToken: "secret-token",
  };

  const issues = await fetchAssignedJiraIssues(credentials, fetcher);
  const worklogs = await fetchJiraWorklogs(
    credentials,
    "account-1",
    "2026-09-14",
    "2026-09-18",
    fetcher,
  );

  assert.deepEqual(issues, [{
    id: "100",
    key: "QDM-100",
    summary: "Delivery planning",
    issueType: "Task",
  }]);
  assert.deepEqual(worklogs, [{
    id: "501",
    issue: issues[0],
    started: "2026-09-16T09:00:00.000+0100",
    timeSpentSeconds: 3600,
    notes: "Review",
  }]);
  const jqlBodies = requests
    .filter(({ url }) => url.endsWith("/search/jql"))
    .map(({ init }) => JSON.parse(String(init?.body)).jql);
  assert.ok(jqlBodies.some((jql) => jql.includes("assignee = currentUser()")));
  assert.ok(jqlBodies.some((jql) => jql.includes("worklogAuthor = currentUser()")));
});
