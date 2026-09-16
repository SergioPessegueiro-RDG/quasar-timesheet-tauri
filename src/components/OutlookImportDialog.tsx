import { type FormEvent, useEffect, useState } from "react";
import { getSetting, importOutlookEvents, setSetting } from "../lib/db/repository";
import { fetchOutlookFeed, parseOutlookIcs } from "../lib/outlook";
import type { Activity } from "../lib/types";

interface OutlookImportDialogProps {
  activities: Activity[];
  initialStart: string;
  initialEnd: string;
  onImported: () => Promise<void>;
  onClose: () => void;
}

export function OutlookImportDialog({
  activities,
  initialStart,
  initialEnd,
  onImported,
  onClose,
}: OutlookImportDialogProps) {
  const [activityId, setActivityId] = useState(activities[0]?.id ?? 0);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [urls, setUrls] = useState("");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

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
    const activity = activities.find(({ id }) => id === activityId);
    const feeds = [...new Set(urls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
    if (!feeds.length || !activity) return setMessage("Add at least one Outlook calendar link and choose an activity.");
    if (feeds.length > 10) return setMessage("You can import up to 10 calendar links at once.");
    setImporting(true);
    setMessage("");
    try {
      const calendars = await Promise.all(feeds.map((url) => fetchOutlookFeed(url)));
      const parsed = calendars.map((contents) => parseOutlookIcs(contents, start, end));
      const result = await importOutlookEvents(activity, parsed.flatMap(({ events }) => events));
      await setSetting("outlook_ics_urls", JSON.stringify(feeds));
      await onImported();
      const skippedAllDay = parsed.reduce((sum, item) => sum + item.skippedAllDay, 0);
      setMessage(
        `Imported ${result.created} event${result.created === 1 ? "" : "s"} from ${feeds.length} calendar${feeds.length === 1 ? "" : "s"}`
        + (result.skippedDuplicates ? `; skipped ${result.skippedDuplicates} already imported.` : ".")
        + (skippedAllDay ? ` Skipped ${skippedAllDay} all-day event${skippedAllDay === 1 ? "" : "s"}.` : ""),
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setImporting(false);
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
            <h2 id="outlook-title">Import calendar links</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="form-row">
            <label><span>From</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
            <label><span>To</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required /></label>
          </div>
          <label>
            <span>Log imported events as</span>
            <select value={activityId} onChange={(event) => setActivityId(Number(event.target.value))} required>
              {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
            </select>
          </label>
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
          <p className="form-help">The links are remembered on this device and excluded from portable backups.</p>

          {message && <p className="export-message" role="status">{message}</p>}
          <div className="dialog-actions">
            <span />
            <span />
            <button className="secondary-button" type="button" onClick={onClose}>Close</button>
            <button className="primary-button" type="submit" disabled={importing || !urls.trim()}>
              {importing ? "Importing…" : "Import events"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
