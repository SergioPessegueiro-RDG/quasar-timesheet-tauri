import { type FormEvent, useEffect, useState } from "react";
import { isTauri } from "../lib/db";
import { getSetting, listTimeEntries, setSetting } from "../lib/db/repository";
import { buildCsv } from "../lib/export";

interface ExportDialogProps {
  initialStart: string;
  initialEnd: string;
  onClose: () => void;
}

function downloadInBrowser(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportDialog({ initialStart, initialEnd, onClose }: ExportDialogProps) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getSetting("jira_display_name").then((value) => setDisplayName(value ?? ""));
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (start > end) {
      setMessage("The end date must be on or after the start date.");
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const entries = await listTimeEntries(start, end);
      if (!entries.length) {
        setMessage("There are no time blocks in that date range.");
        return;
      }
      const result = buildCsv(entries, displayName);
      const filename = `jira_worklog_${start}_to_${end}.csv`;
      if (isTauri()) {
        const [{ save }, { writeTextFile }] = await Promise.all([
          import("@tauri-apps/plugin-dialog"),
          import("@tauri-apps/plugin-fs"),
        ]);
        const path = await save({
          title: "Save Jira CSV export",
          defaultPath: filename,
          filters: [{ name: "CSV files", extensions: ["csv"] }],
        });
        if (!path) return;
        await writeTextFile(path, result.csv);
      } else {
        downloadInBrowser(result.csv, filename);
      }
      await setSetting("jira_display_name", displayName.trim());
      setMessage(
        `Exported ${result.written} worklog row${result.written === 1 ? "" : "s"}`
        + (result.skipped ? `; skipped ${result.skipped} without a Jira key.` : "."),
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Jira worklogs</p>
            <h2 id="export-title">Export CSV</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="form-row">
            <label>
              <span>From</span>
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required />
            </label>
          </div>

          <label>
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Appears in every exported row"
            />
          </label>

          {message && <p className="export-message" role="status">{message}</p>}

          <div className="dialog-actions">
            <span />
            <span />
            <button className="secondary-button" type="button" onClick={onClose}>Close</button>
            <button className="primary-button" type="submit" disabled={exporting}>
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
