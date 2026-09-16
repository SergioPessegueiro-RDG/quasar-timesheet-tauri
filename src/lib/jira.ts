import type { TimeEntry } from "./types.ts";
import { durationMinutes } from "./types.ts";

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  issueType: string;
  status: string;
  parent?: { id: string; key: string; summary: string };
}

export interface JiraTransition {
  id: string;
  name: string;
  status: string;
}

export interface JiraWorklog {
  id: string;
  issue: JiraIssue;
  started: string;
  timeSpentSeconds: number;
  notes: string;
}

export function jiraWorklogTimes(
  started: string,
  timeSpentSeconds: number,
): { date: string; startTime: string; endTime: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(started);
  if (!match) throw new Error("Jira returned an invalid worklog start time.");
  const startMinute = Number(match[2]) * 60 + Number(match[3]);
  const duration = Math.max(1, Math.round(timeSpentSeconds / 60));
  const endMinute = Math.min(23 * 60 + 59, startMinute + duration);
  const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return { date: match[1], startTime: time(startMinute), endTime: time(endMinute) };
}

type Fetcher = typeof fetch;

export function jiraCloudUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || !url.hostname.endsWith(".atlassian.net") || url.username || url.password) {
    throw new Error("Use an HTTPS Jira Cloud URL ending in .atlassian.net.");
  }
  return url.origin;
}

function basicAuth(email: string, token: string): string {
  const bytes = new TextEncoder().encode(`${email}:${token}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function jiraFetch(
  path: string,
  credentials: JiraCredentials,
  init: RequestInit = {},
  fetcher?: Fetcher,
): Promise<Response> {
  if (!credentials.email.trim() || !credentials.apiToken) throw new Error("Jira email and API token are required.");
  const url = `${jiraCloudUrl(credentials.baseUrl)}${path}`;
  const native = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const request = fetcher ?? (native ? (await import("@tauri-apps/plugin-http")).fetch : fetch);
  const requestUrl = fetcher || native || import.meta.env?.DEV !== true
    ? url
    : `/__jira_api?url=${encodeURIComponent(url)}`;
  return request(requestUrl, {
    ...init,
    headers: {
      Authorization: basicAuth(credentials.email.trim(), credentials.apiToken),
      Accept: "application/json",
      ...init.headers,
    },
  });
}

async function jiraJson<T>(
  path: string,
  credentials: JiraCredentials,
  init: RequestInit = {},
  fetcher?: Fetcher,
): Promise<T> {
  const response = await jiraFetch(path, credentials, init, fetcher);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Jira returned ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  return response.json() as Promise<T>;
}

function issueFromApi(value: {
  id?: string;
  key?: string;
  fields?: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    parent?: { id?: string; key?: string; fields?: { summary?: string } };
  };
}): JiraIssue | null {
  if (!value.id || !value.key || !value.fields?.summary) return null;
  const parent = value.fields.parent;
  return {
    id: value.id,
    key: value.key,
    summary: value.fields.summary,
    issueType: value.fields.issuetype?.name ?? "Task",
    status: value.fields.status?.name ?? "Unknown",
    ...(parent?.id && parent.key && parent.fields?.summary
      ? { parent: { id: parent.id, key: parent.key, summary: parent.fields.summary } }
      : {}),
  };
}

async function searchJiraIssues(
  credentials: JiraCredentials,
  jql: string,
  fetcher?: Fetcher,
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const result = await jiraJson<{
      issues?: Array<Parameters<typeof issueFromApi>[0]>;
      isLast?: boolean;
      nextPageToken?: string;
    }>("/rest/api/3/search/jql", credentials, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql,
        fields: ["summary", "issuetype", "status", "parent"],
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    }, fetcher);
    issues.push(...(result.issues ?? []).map(issueFromApi).filter((issue): issue is JiraIssue => issue !== null));
    nextPageToken = result.isLast === false ? result.nextPageToken : undefined;
  } while (nextPageToken);
  return issues;
}

function adfText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(adfText).filter(Boolean).join(" ") : "";
}

export async function testJiraConnection(
  credentials: JiraCredentials,
  fetcher?: Fetcher,
): Promise<JiraUser> {
  const user = await jiraJson<Partial<JiraUser>>("/rest/api/3/myself", credentials, {}, fetcher);
  if (!user.accountId || !user.displayName) throw new Error("Jira returned an incomplete user profile.");
  return { accountId: user.accountId, displayName: user.displayName };
}

export function fetchAssignedJiraIssues(
  credentials: JiraCredentials,
  fetcher?: Fetcher,
): Promise<JiraIssue[]> {
  return searchJiraIssues(
    credentials,
    "project = QDM AND assignee = currentUser() AND (resolution = Unresolved OR status = Closed) ORDER BY updated DESC",
    fetcher,
  );
}

export async function fetchJiraWorklogs(
  credentials: JiraCredentials,
  accountId: string,
  startDate: string,
  endDate: string,
  fetcher?: Fetcher,
): Promise<JiraWorklog[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error("Invalid Jira worklog date range.");
  }
  const issues = await searchJiraIssues(
    credentials,
    `project = QDM AND worklogAuthor = currentUser() AND worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`,
    fetcher,
  );
  const startedAfter = new Date(`${startDate}T00:00:00`).getTime();
  const afterEnd = new Date(`${endDate}T00:00:00`);
  afterEnd.setDate(afterEnd.getDate() + 1);
  const worklogs: JiraWorklog[] = [];

  for (const issue of issues) {
    let startAt = 0;
    let total = 1;
    while (startAt < total) {
      const query = new URLSearchParams({
        startAt: String(startAt),
        maxResults: "100",
        startedAfter: String(startedAfter),
        startedBefore: String(afterEnd.getTime()),
      });
      const page = await jiraJson<{
        startAt?: number;
        maxResults?: number;
        total?: number;
        worklogs?: Array<{
          id?: string;
          author?: { accountId?: string };
          started?: string;
          timeSpentSeconds?: number;
          comment?: unknown;
        }>;
      }>(`/rest/api/3/issue/${encodeURIComponent(issue.key)}/worklog?${query}`, credentials, {}, fetcher);
      for (const worklog of page.worklogs ?? []) {
        if (
          worklog.id
          && worklog.author?.accountId === accountId
          && worklog.started
          && Number.isFinite(worklog.timeSpentSeconds)
          && worklog.timeSpentSeconds! > 0
        ) {
          worklogs.push({
            id: worklog.id,
            issue,
            started: worklog.started,
            timeSpentSeconds: worklog.timeSpentSeconds!,
            notes: adfText(worklog.comment),
          });
        }
      }
      total = page.total ?? 0;
      startAt = (page.startAt ?? startAt) + (page.maxResults ?? page.worklogs?.length ?? total);
    }
  }
  return worklogs;
}

/**
 * Sources:
 * https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-get
 * https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post
 */
export async function fetchJiraTransitions(
  credentials: JiraCredentials,
  issueKey: string,
  fetcher?: Fetcher,
): Promise<JiraTransition[]> {
  const key = issueKey.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) throw new Error("Invalid Jira issue key.");
  const result = await jiraJson<{
    transitions?: Array<{ id?: string; name?: string; to?: { name?: string } }>;
  }>(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, credentials, {}, fetcher);
  return (result.transitions ?? []).flatMap((transition) => (
    transition.id && transition.name && transition.to?.name
      ? [{ id: transition.id, name: transition.name, status: transition.to.name }]
      : []
  ));
}

export async function transitionJiraIssue(
  credentials: JiraCredentials,
  issueKey: string,
  transitionId: string,
  fetcher?: Fetcher,
): Promise<void> {
  const key = issueKey.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) throw new Error("Invalid Jira issue key.");
  if (!/^\d+$/.test(transitionId)) throw new Error("Invalid Jira transition.");
  const response = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
    credentials,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transition: { id: transitionId } }),
    },
    fetcher,
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Jira could not update ${key} (${response.status})${detail ? `: ${detail}` : "."}`);
  }
}

function jiraStarted(entry: TimeEntry): string {
  const local = new Date(`${entry.date}T${entry.startTime}:00`);
  const offset = -local.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${entry.date}T${entry.startTime}:00.000${sign}${hours}${minutes}`;
}

function jiraWorklogBody(entry: TimeEntry) {
  const description = entry.notes.trim();
  if (!description) throw new Error("A Jira work description is required.");
  return {
    started: jiraStarted(entry),
    timeSpentSeconds: durationMinutes(entry) * 60,
    comment: {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: description }] }],
    },
  };
}

/**
 * Uploads one worklog using Jira Cloud REST API v3.
 * Sources:
 * https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-issue-issueidorkey-worklog-post
 * https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
 */
export async function uploadJiraWorklog(
  entry: TimeEntry,
  credentials: JiraCredentials,
  fetcher?: Fetcher,
): Promise<string> {
  const issueKey = entry.jiraKey?.trim().toUpperCase();
  if (!issueKey || !/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) throw new Error("Invalid Jira issue key.");
  const response = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    credentials,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jiraWorklogBody(entry)),
    },
    fetcher,
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Jira rejected ${issueKey} (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error(`Jira accepted ${issueKey} but returned no worklog ID.`);
  return result.id;
}

/** Updates an existing Jira worklog instead of creating a duplicate. */
export async function updateJiraWorklog(
  entry: TimeEntry,
  credentials: JiraCredentials,
  fetcher?: Fetcher,
): Promise<void> {
  const issueKey = entry.jiraKey?.trim().toUpperCase();
  const worklogId = entry.jiraWorklogId?.trim();
  if (!issueKey || !/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) throw new Error("Invalid Jira issue key.");
  if (!worklogId || !/^\d+$/.test(worklogId)) throw new Error("Invalid Jira worklog ID.");
  const response = await jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    credentials,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jiraWorklogBody(entry)),
    },
    fetcher,
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Jira could not update ${issueKey} (${response.status})${detail ? `: ${detail}` : "."}`);
  }
}
