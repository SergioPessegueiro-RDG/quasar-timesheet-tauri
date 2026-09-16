import { type FormEvent, useEffect, useState } from "react";
import { getSetting, listTimeEntries, markJiraWorklogUploaded, setSetting } from "../lib/db/repository";
import { jiraCloudUrl, uploadJiraWorklog } from "../lib/jira";
import { JiraMark } from "./JiraMark";

interface JiraUploadDialogProps {
  initialStart: string;
  initialEnd: string;
  onUploaded: () => Promise<void>;
  onClose: () => void;
}

export function JiraUploadDialog({
  initialStart,
  initialEnd,
  onUploaded,
  onClose,
}: JiraUploadDialogProps) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([getSetting("jira_base_url"), getSetting("jira_email")]).then(([url, savedEmail]) => {
      setBaseUrl(url ?? "");
      setEmail(savedEmail ?? "");
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (start > end) return setMessage("The end date must be on or after the start date.");
    setUploading(true);
    setMessage("");
    try {
      const normalizedUrl = jiraCloudUrl(baseUrl);
      const entries = await listTimeEntries(start, end);
      const pending = entries.filter((entry) => entry.jiraKey && !entry.jiraWorklogId);
      if (!pending.length) {
        setMessage("No new time blocks with Jira issue keys are waiting to upload.");
        return;
      }
      await Promise.all([
        setSetting("jira_base_url", normalizedUrl),
        setSetting("jira_email", email.trim()),
      ]);

      let uploaded = 0;
      const failures: string[] = [];
      for (const entry of pending) {
        try {
          const worklogId = await uploadJiraWorklog(entry, {
            baseUrl: normalizedUrl,
            email,
            apiToken,
          });
          await markJiraWorklogUploaded(entry.id, worklogId);
          uploaded++;
        } catch (cause) {
          failures.push(`${entry.jiraKey} on ${entry.date}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      await onUploaded();
      setApiToken("");
      setMessage(
        `Uploaded ${uploaded} worklog${uploaded === 1 ? "" : "s"}.`
        + (failures.length ? ` Failed ${failures.length}: ${failures.slice(0, 3).join(" | ")}` : ""),
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="jira-upload-title">
        <div className="dialog-heading">
          <div className="dialog-brand-heading">
            <JiraMark className="dialog-logo" />
            <div>
              <p className="eyebrow">Jira Cloud</p>
              <h2 id="jira-upload-title">Upload worklogs</h2>
            </div>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={submit}>
          <label>
            <span>Jira site</span>
            <input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://your-company.atlassian.net" required />
          </label>
          <label>
            <span>Atlassian account email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label>
            <span>API token (used for this upload only)</span>
            <input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} autoComplete="off" required />
          </label>
          <div className="form-row">
            <label><span>From</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
            <label><span>To</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required /></label>
          </div>

          <p className="form-help">Only blocks with Jira issue keys are sent. Previously uploaded blocks are skipped.</p>
          {message && <p className="export-message" role="status">{message}</p>}
          <div className="dialog-actions">
            <span />
            <span />
            <button className="secondary-button" type="button" onClick={onClose}>Close</button>
            <button className="primary-button" type="submit" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload to Jira"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
