import assert from "node:assert/strict";
import test from "node:test";
import { normalizeIntegrationSetup } from "./integrations.ts";

test("welcome setup accepts optional integrations and validates partial Jira details", () => {
  assert.deepEqual(normalizeIntegrationSetup("", "", "", ""), {
    jira: null,
    outlookFeeds: [],
  });
  assert.throws(
    () => normalizeIntegrationSetup("https://example.atlassian.net", "", "", ""),
    /all three Jira/,
  );
  assert.deepEqual(
    normalizeIntegrationSetup(
      "https://example.atlassian.net/",
      " user@example.com ",
      "token",
      "webcal://outlook.office365.com/owa/calendar/id/calendar.ics",
    ),
    {
      jira: {
        baseUrl: "https://example.atlassian.net",
        email: "user@example.com",
        apiToken: "token",
      },
      outlookFeeds: ["https://outlook.office365.com/owa/calendar/id/calendar.ics"],
    },
  );
});
