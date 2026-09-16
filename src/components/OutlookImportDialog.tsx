import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { isTauri } from "../lib/db";
import { importOutlookEvents } from "../lib/db/repository";
import { MAX_ICS_BYTES, parseOutlookIcs } from "../lib/outlook";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [activityId, setActivityId] = useState(activities[0]?.id ?? 0);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [fileName, setFileName] = useState("");
  const [contents, setContents] = useState("");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

  async function chooseFile() {
    setMessage("");
    if (!isTauri()) return inputRef.current?.click();
    const [{ open }, { readTextFile, stat }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const path = await open({
      title: "Import Outlook calendar",
      multiple: false,
      filters: [{ name: "iCalendar files", extensions: ["ics"] }],
    });
    if (!path) return;
    if ((await stat(path)).size > MAX_ICS_BYTES) throw new Error("Calendar files are limited to 5 MB.");
    setContents(await readTextFile(path));
    setFileName(path.split(/[\\/]/).pop() ?? "Outlook calendar");
  }

  async function browserFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ICS_BYTES) return setMessage("Calendar files are limited to 5 MB.");
    setContents(await file.text());
    setFileName(file.name);
    event.target.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const activity = activities.find(({ id }) => id === activityId);
    if (!contents || !activity) return setMessage("Choose a calendar file and an activity.");
    setImporting(true);
    setMessage("");
    try {
      const parsed = parseOutlookIcs(contents, start, end);
      const result = await importOutlookEvents(activity, parsed.events);
      await onImported();
      setMessage(
        `Imported ${result.created} event${result.created === 1 ? "" : "s"}`
        + (result.skippedDuplicates ? `; skipped ${result.skippedDuplicates} already imported.` : ".")
        + (parsed.skippedAllDay ? ` Skipped ${parsed.skippedAllDay} all-day event${parsed.skippedAllDay === 1 ? "" : "s"}.` : ""),
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
            <h2 id="outlook-title">Import .ics</h2>
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
          <input ref={inputRef} className="hidden-file-input" type="file" accept=".ics,text/calendar" onChange={browserFile} />
          <button className="secondary-button file-picker" type="button" onClick={() => chooseFile().catch((cause) => setMessage(String(cause)))}>
            {fileName || "Choose Outlook .ics file"}
          </button>

          {message && <p className="export-message" role="status">{message}</p>}
          <div className="dialog-actions">
            <span />
            <span />
            <button className="secondary-button" type="button" onClick={onClose}>Close</button>
            <button className="primary-button" type="submit" disabled={importing || !contents}>
              {importing ? "Importing…" : "Import events"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
