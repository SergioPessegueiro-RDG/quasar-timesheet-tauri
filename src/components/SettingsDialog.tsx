import { useEffect, useRef, useState } from "react";
import { createBackup, restoreBackup } from "../lib/db/backup";
import { isTauri } from "../lib/db";

export type ThemeMode = "system" | "light" | "dark";

interface SettingsDialogProps {
  theme: ThemeMode;
  showTimer: boolean;
  startHour: number;
  endHour: number;
  showWeekends: boolean;
  onClose: () => void;
  onSave: (
    theme: ThemeMode,
    showTimer: boolean,
    startHour: number,
    endHour: number,
    showWeekends: boolean,
  ) => Promise<void>;
}

function browserDownload(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SettingsDialog({
  theme: initialTheme,
  showTimer: initialShowTimer,
  startHour: initialStartHour,
  endHour: initialEndHour,
  showWeekends: initialShowWeekends,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const [theme, setTheme] = useState(initialTheme);
  const [showTimer, setShowTimer] = useState(initialShowTimer);
  const [startHour, setStartHour] = useState(initialStartHour);
  const [endHour, setEndHour] = useState(initialEndHour);
  const [showWeekends, setShowWeekends] = useState(initialShowWeekends);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function backup() {
    setBusy(true);
    setMessage("");
    try {
      const contents = await createBackup();
      const filename = `quasar-timesheet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (isTauri()) {
        const [{ save }, { writeTextFile }] = await Promise.all([
          import("@tauri-apps/plugin-dialog"),
          import("@tauri-apps/plugin-fs"),
        ]);
        const path = await save({
          title: "Back up QUASAR data",
          defaultPath: filename,
          filters: [{ name: "QUASAR backup", extensions: ["json"] }],
        });
        if (!path) return;
        await writeTextFile(path, contents);
      } else {
        browserDownload(contents, filename);
      }
      setMessage("Backup saved.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function chooseRestore() {
    if (isTauri()) {
      const [{ open }, { readTextFile }] = await Promise.all([
        import("@tauri-apps/plugin-dialog"),
        import("@tauri-apps/plugin-fs"),
      ]);
      const path = await open({
        title: "Restore QUASAR data",
        multiple: false,
        filters: [{ name: "QUASAR backup", extensions: ["json"] }],
      });
      if (typeof path === "string") await restore(await readTextFile(path));
    } else {
      fileInput.current?.click();
    }
  }

  async function restore(contents: string) {
    if (!window.confirm("Restore this backup? This replaces all current app data and cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      await restoreBackup(contents);
      window.location.reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (endHour <= startHour) return setMessage("The work day must end after it starts.");
    setBusy(true);
    await onSave(theme, showTimer, startHour, endHour, showWeekends);
    onClose();
  }

  function hourLabel(hour: number) {
    if (hour === 24) return "Midnight";
    return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, hour));
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="dialog settings-dialog" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Preferences</p>
            <h2>Settings</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

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
            <p>Set the visible work day and optionally include Saturday and Sunday.</p>
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

        <section className="settings-section backup-section">
          <div>
            <strong>Backup & restore</strong>
            <p>Projects, activities, time blocks, templates, and settings in one portable file.</p>
          </div>
          <div className="backup-actions">
            <button className="secondary-button" type="button" onClick={backup} disabled={busy}>Back up data…</button>
            <button className="secondary-button" type="button" onClick={chooseRestore} disabled={busy}>Restore…</button>
          </div>
          <input
            ref={fileInput}
            className="hidden-file-input"
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await restore(await file.text());
              event.target.value = "";
            }}
          />
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
