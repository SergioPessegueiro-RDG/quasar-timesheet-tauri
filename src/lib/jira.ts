import type { TimeEntry } from "./types.ts";
import { durationMinutes } from "./types.ts";

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
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

function jiraStarted(entry: TimeEntry): string {
  const local = new Date(`${entry.date}T${entry.startTime}:00`);
  const offset = -local.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${entry.date}T${entry.startTime}:00.000${sign}${hours}${minutes}`;
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
  if (!credentials.email.trim() || !credentials.apiToken) throw new Error("Jira email and API token are required.");
  const baseUrl = jiraCloudUrl(credentials.baseUrl);
  const native = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const request = fetcher ?? (native ? (await import("@tauri-apps/plugin-http")).fetch : fetch);
  const description = entry.notes.trim() || entry.activityName;
  const response = await request(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuth(credentials.email.trim(), credentials.apiToken),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        started: jiraStarted(entry),
        timeSpentSeconds: durationMinutes(entry) * 60,
        comment: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: description }] }],
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Jira rejected ${issueKey} (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error(`Jira accepted ${issueKey} but returned no worklog ID.`);
  return result.id;
}
