import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../lib/db/repository";
import { jiraCloudUrl } from "../lib/jira";

export type ThemeMode = "system" | "light" | "dark";

interface SettingsDialogProps {
  theme: ThemeMode;
  showTimer: boolean;
  startHour: number;
  endHour: number;
  showWeekends: boolean;
  onClose: () => void;
  onExportCsv: () => void;
  onImportOutlook: () => void;
  onSave: (
    theme: ThemeMode,
    showTimer: boolean,
    startHour: number,
    endHour: number,
    showWeekends: boolean,
  ) => Promise<void>;
}

export function SettingsDialog({
  theme: initialTheme,
  showTimer: initialShowTimer,
  startHour: initialStartHour,
  endHour: initialEndHour,
  showWeekends: initialShowWeekends,
  onClose,
  onExportCsv,
  onImportOutlook,
  onSave,
}: SettingsDialogProps) {
  const [theme, setTheme] = useState(initialTheme);
  const [showTimer, setShowTimer] = useState(initialShowTimer);
  const [startHour, setStartHour] = useState(initialStartHour);
  const [endHour, setEndHour] = useState(initialEndHour);
  const [showWeekends, setShowWeekends] = useState(initialShowWeekends);
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  useEffect(() => {
    Promise.all([
      getSetting("jira_base_url"),
      getSetting("jira_email"),
      getSetting("jira_api_token"),
    ]).then(([baseUrl, email, apiToken]) => {
      setJiraBaseUrl(baseUrl ?? "");
      setJiraEmail(email ?? "");
      setJiraApiToken(apiToken ?? "");
    }).catch((cause) => setMessage(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (endHour <= startHour) return setMessage("The work day must end after it starts.");
    const hasAnyJiraDetails = jiraBaseUrl.trim() || jiraEmail.trim() || jiraApiToken;
    if (hasAnyJiraDetails && (!jiraBaseUrl.trim() || !jiraEmail.trim() || !jiraApiToken)) {
      return setMessage("Complete all three Jira connection fields, or leave all three empty.");
    }
    setBusy(true);
    try {
      const normalizedJiraUrl = hasAnyJiraDetails ? jiraCloudUrl(jiraBaseUrl) : "";
      await Promise.all([
        setSetting("jira_base_url", normalizedJiraUrl),
        setSetting("jira_email", jiraEmail.trim()),
        setSetting("jira_api_token", jiraApiToken),
        onSave(theme, showTimer, startHour, endHour, showWeekends),
      ]);
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  function hourLabel(hour: number) {
    if (hour === 24) return "Midnight";
    return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, hour));
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="dialog settings-dialog" onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2>Settings</h2>
          </div>
        </div>

        <section className="settings-section">
          <div>
            <strong>Appearance</strong>
            <p>Follow the operating system or keep one theme.</p>
          </div>
          <div className="theme-options" role="radiogroup" aria-label="Theme">
            {(["system", "light", "dark"] as ThemeMode[]).map((option) => (
              <button
                type="button"
                role="radio"
                aria-checked={theme === option}
                className={theme === option ? "is-selected" : ""}
                onClick={() => setTheme(option)}
                key={option}
              >
                <i className={`theme-preview ${option}`} />
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div>
            <strong>Calendar</strong>
            <p>Choose the hours shown first. The rest of the day remains available by scrolling.</p>
          </div>
          <div className="form-row work-hours">
            <label>
              <span>Starts</span>
              <select value={startHour} onChange={(event) => setStartHour(Number(event.target.value))}>
                {Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{hourLabel(hour)}</option>)}
              </select>
            </label>
            <label>
              <span>Ends</span>
              <select value={endHour} onChange={(event) => setEndHour(Number(event.target.value))}>
                {Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => (
                  <option value={hour} key={hour}>{hourLabel(hour)}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <label className="settings-toggle">
          <span><strong>Show timer bar</strong><small>Keep the live work timer above the calendar.</small></span>
          <input type="checkbox" checked={showTimer} onChange={(event) => setShowTimer(event.target.checked)} />
        </label>

        <label className="settings-toggle">
          <span><strong>Show weekends</strong><small>Include Saturday and Sunday across calendar views.</small></span>
          <input type="checkbox" checked={showWeekends} onChange={(event) => setShowWeekends(event.target.checked)} />
        </label>

        <section className="settings-section jira-settings">
          <div>
            <strong>Jira connection</strong>
            <p>Used when you press Upload Jira. The token stays on this device and is excluded from backups.</p>
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
        </section>

        <section className="settings-section settings-action-section">
          <div>
            <strong>Outlook calendar</strong>
            <p>Configure calendar subscription links and import events.</p>
          </div>
          <button className="secondary-button" type="button" onClick={onImportOutlook}>Configure…</button>
        </section>

        <section className="settings-section settings-action-section">
          <div>
            <strong>Jira CSV export</strong>
            <p>Export dated worklogs for Jira's CSV importer.</p>
          </div>
          <button className="secondary-button" type="button" onClick={onExportCsv}>Export CSV…</button>
        </section>

        {message && <p className="export-message" role="status">{message}</p>}
        <footer className="dialog-actions">
          <span />
          <span />
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Working…" : "Save settings"}</button>
        </footer>
      </form>
    </div>
  );
}
