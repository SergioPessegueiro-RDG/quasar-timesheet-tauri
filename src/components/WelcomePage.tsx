import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../lib/db/repository";
import { normalizeIntegrationSetup } from "../lib/integrations";
import { testJiraConnection, type JiraCredentials } from "../lib/jira";

interface WelcomePageProps {
  returning: boolean;
  onComplete: (jira: JiraCredentials | null) => Promise<void>;
  onSkip: () => Promise<void>;
}

export function WelcomePage({ returning, onComplete, onSkip }: WelcomePageProps) {
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [outlookUrls, setOutlookUrls] = useState("");
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      getSetting("jira_base_url"),
      getSetting("jira_email"),
      getSetting("jira_api_token"),
      getSetting("outlook_ics_urls"),
    ]).then(([baseUrl, email, apiToken, urls]) => {
      setJiraBaseUrl(baseUrl ?? "");
      setJiraEmail(email ?? "");
      setJiraApiToken(apiToken ?? "");
      if (urls) {
        try {
          const feeds: unknown = JSON.parse(urls);
          if (Array.isArray(feeds) && feeds.every((feed) => typeof feed === "string")) {
            setOutlookUrls(feeds.join("\n"));
          }
        } catch {
          // Leave malformed old data blank so it can be replaced.
        }
      }
    }).catch((cause) => setMessage(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  async function testConnection() {
    setTesting(true);
    setMessage("");
    try {
      const { jira } = normalizeIntegrationSetup(jiraBaseUrl, jiraEmail, jiraApiToken, "");
      if (!jira) throw new Error("Add your Jira details first.");
      const user = await testJiraConnection(jira);
      setMessage(`Jira connected — signed in as ${user.displayName}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTesting(false);
    }
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const { jira, outlookFeeds } = normalizeIntegrationSetup(
        jiraBaseUrl,
        jiraEmail,
        jiraApiToken,
        outlookUrls,
      );
      await Promise.all([
        setSetting("jira_base_url", jira?.baseUrl ?? ""),
        setSetting("jira_email", jira?.email ?? ""),
        setSetting("jira_api_token", jira?.apiToken ?? ""),
        setSetting("outlook_ics_urls", outlookFeeds.length ? JSON.stringify(outlookFeeds) : ""),
        setSetting("welcome_completed", "1"),
      ]);
      await onComplete(jira);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    setMessage("");
    try {
      await onSkip();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  return (
    <main className="welcome-page">
      <form className="welcome-card" onSubmit={finish}>
        <header className="welcome-heading">
          <div className="welcome-logo" aria-hidden="true">Q</div>
          <p className="eyebrow">{returning ? "Integration setup" : "Welcome to QUASAR"}</p>
          <h1>{returning ? "Update your connections" : "Set up your timesheet"}</h1>
          <p>Connect Jira for QDMs and worklogs, then add Outlook calendar links for read-only meeting guides.</p>
        </header>

        <div className="welcome-integrations">
          <section className="welcome-section">
            <div className="welcome-section-heading">
              <span>1</span>
              <div>
                <h2>Jira</h2>
                <p>All fields are optional, but must be completed together.</p>
              </div>
            </div>
            <label>
              <span>Jira site</span>
              <input type="url" value={jiraBaseUrl} onChange={(event) => setJiraBaseUrl(event.target.value)} placeholder="https://your-company.atlassian.net" />
            </label>
            <label>
              <span>Atlassian account email</span>
              <input type="email" value={jiraEmail} onChange={(event) => setJiraEmail(event.target.value)} autoComplete="email" />
            </label>
            <label>
              <span>API token</span>
              <input type="password" value={jiraApiToken} onChange={(event) => setJiraApiToken(event.target.value)} autoComplete="current-password" />
            </label>
            <button className="secondary-button jira-test-button" type="button" disabled={testing || saving} onClick={() => void testConnection()}>
              {testing ? "Testing…" : "Test Jira connection"}
            </button>
          </section>

          <section className="welcome-section">
            <div className="welcome-section-heading">
              <span>2</span>
              <div>
                <h2>Outlook calendar</h2>
                <p>Add up to ten subscription links, one per line.</p>
              </div>
            </div>
            <label>
              <span>Outlook .ics subscription links</span>
              <textarea
                className="calendar-links-input"
                value={outlookUrls}
                onChange={(event) => setOutlookUrls(event.target.value)}
                placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
                rows={7}
              />
            </label>
            <p className="form-help">Meetings stay read-only and never become timesheet entries.</p>
          </section>
        </div>

        <p className="welcome-privacy">Credentials remain in the app’s local database on this device.</p>
        {message && <p className="export-message" role="status">{message}</p>}
        <footer className="welcome-actions">
          <button className="secondary-button" type="button" disabled={saving} onClick={() => void skip()}>
            {returning ? "Back to app" : "Set up later"}
          </button>
          <button className="primary-button" type="submit" disabled={saving || testing}>
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </footer>
      </form>
    </main>
  );
}
