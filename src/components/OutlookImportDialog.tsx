import { type FormEvent, useEffect, useState } from "react";
import { getSetting, setSetting } from "../lib/db/repository";
import { parseOutlookFeedList } from "../lib/outlook";

interface OutlookImportDialogProps {
  onSaved: () => Promise<void>;
  onClose: () => void;
}

export function OutlookImportDialog({
  onSaved,
  onClose,
}: OutlookImportDialogProps) {
  const [urls, setUrls] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSetting("outlook_ics_urls").then((value) => {
      if (!value) return;
      try {
        const saved: unknown = JSON.parse(value);
        if (Array.isArray(saved) && saved.every((item) => typeof item === "string")) {
          setUrls(saved.join("\n"));
        }
      } catch {
        // Ignore a malformed local setting; the user can replace it in the form.
      }
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const feeds = parseOutlookFeedList(urls);
      await setSetting("outlook_ics_urls", JSON.stringify(feeds));
      await onSaved();
      onClose();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="outlook-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Outlook calendar</p>
            <h2 id="outlook-title">Calendar subscriptions</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={submit}>
          <label>
            <span>Outlook .ics subscription links (one per line)</span>
            <textarea
              className="calendar-links-input"
              value={urls}
              onChange={(event) => setUrls(event.target.value)}
              placeholder={"https://outlook.office365.com/owa/calendar/…/calendar.ics\nhttps://outlook.live.com/owa/calendar/…/calendar.ics"}
              rows={4}
              required
            />
          </label>
          <p className="form-help">Meetings appear as read-only guides in the calendar. They never become timesheet entries.</p>

          {message && <p className="export-message" role="status">{message}</p>}
          <div className="dialog-actions">
            <span />
            <span />
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving || !urls.trim()}>
              {saving ? "Saving…" : "Save links"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
