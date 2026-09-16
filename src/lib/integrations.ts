import { jiraCloudUrl, type JiraCredentials } from "./jira.ts";
import { parseOutlookFeedList } from "./outlook.ts";

export function normalizeIntegrationSetup(
  jiraBaseUrl: string,
  jiraEmail: string,
  jiraApiToken: string,
  outlookUrls: string,
): { jira: JiraCredentials | null; outlookFeeds: string[] } {
  const hasAnyJiraDetail = Boolean(jiraBaseUrl.trim() || jiraEmail.trim() || jiraApiToken);
  if (hasAnyJiraDetail && !(jiraBaseUrl.trim() && jiraEmail.trim() && jiraApiToken)) {
    throw new Error("Complete all three Jira fields, or leave all three empty.");
  }
  return {
    jira: hasAnyJiraDetail ? {
      baseUrl: jiraCloudUrl(jiraBaseUrl),
      email: jiraEmail.trim(),
      apiToken: jiraApiToken,
    } : null,
    outlookFeeds: outlookUrls.trim() ? parseOutlookFeedList(outlookUrls) : [],
  };
}
