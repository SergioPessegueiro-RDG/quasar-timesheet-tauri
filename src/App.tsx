import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { WeeklyCalendar } from "./components/WeeklyCalendar";
import { isTauri } from "./lib/db";
import {
  listActivities,
  listProjects,
  listTimeEntries,
  setProjectCollapsed,
} from "./lib/db/repository";
import { addDays, isoDate, startOfWeek } from "./lib/calendar";
import type { Activity, Project, TimeEntry } from "./lib/types";
import "./App.css";

type View = "timesheet" | "template" | "summary";

function weekTitle(monday: Date): string {
  const friday = addDays(monday, 4);
  const start = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(monday);
  const end = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(friday);
  return `${start} – ${end}`;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [armedActivity, setArmedActivity] = useState<Activity | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<View>("timesheet");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    const end = addDays(weekStart, 4);
    setEntries(await listTimeEntries(isoDate(weekStart), isoDate(end)));
  }, [weekStart]);

  useEffect(() => {
    setLoading(true);
    Promise.all([listProjects(), listActivities(), loadEntries()])
      .then(([p, a]) => {
        setProjects(p);
        setActivities(a);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, [loadEntries]);

  if (error) {
    return (
      <main className="fatal-state">
        <h1>Database failed to open</h1>
        <pre>{error}</pre>
      </main>
    );
  }

  async function toggleProject(project: Project) {
    await setProjectCollapsed(project.id, !project.collapsed);
    setProjects((current) => current.map((item) => (
      item.id === project.id ? { ...item, collapsed: !item.collapsed } : item
    )));
  }

  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => {
      const [sh, sm] = entry.startTime.split(":").map(Number);
      const [eh, em] = entry.endTime.split(":").map(Number);
      return sum + (eh * 60 + em - sh * 60 - sm);
    }, 0) / 60,
    [entries],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">Q</span>
          <span>
            <strong>QUASAR</strong>
            <small>Timesheet Manager</small>
          </span>
        </div>

        <nav className="view-tabs" aria-label="Primary">
          {(["timesheet", "template", "summary"] as View[]).map((item) => (
            <button
              type="button"
              className={view === item ? "is-active" : ""}
              key={item}
              onClick={() => setView(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <span className="runtime-badge" title={isTauri() ? "Persistent SQLite" : "Development database"}>
            <i className={isTauri() ? "is-native" : ""} />
            {isTauri() ? "Local" : "Dev"}
          </span>
          <button className="icon-button" type="button" aria-label="Settings" title="Settings">⚙</button>
        </div>
      </header>

      <div className="workspace">
        <Sidebar
          projects={projects}
          activities={activities}
          armedActivity={armedActivity}
          onArm={setArmedActivity}
          onToggleProject={toggleProject}
        />

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{view === "timesheet" ? "Weekly timesheet" : view}</p>
              <h1>{view === "timesheet" ? weekTitle(weekStart) : view[0].toUpperCase() + view.slice(1)}</h1>
            </div>

            {view === "timesheet" && (
              <div className="week-toolbar">
                <div className="week-total">
                  <span>This week</span>
                  <strong>{totalHours.toFixed(1)}h</strong>
                </div>
                <div className="segmented-buttons">
                  <button type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
                  <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
                  <button type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
                </div>
                <button className="primary-button" type="button">Export CSV</button>
              </div>
            )}
          </div>

          {view === "timesheet" ? (
            <>
              <div className={`placement-hint${armedActivity ? " is-active" : ""}`} role="status">
                <span>{armedActivity ? "＋" : "↖"}</span>
                {armedActivity
                  ? <>Click or drag the grid to place <strong>{armedActivity.name}</strong>. Press Esc to cancel.</>
                  : "Choose an activity on the left, then click or drag the grid."}
              </div>
              <WeeklyCalendar
                weekStart={weekStart}
                entries={entries}
                armedActivity={armedActivity}
                onEntriesChanged={loadEntries}
              />
            </>
          ) : (
            <section className="coming-soon">
              <span>{view === "template" ? "▦" : "∑"}</span>
              <h2>{view === "template" ? "Recurring weekly template" : "Time summary"}</h2>
              <p>This view is the next slice. The weekly timesheet is ready to use now.</p>
            </section>
          )}
        </main>
      </div>

      {loading && <div className="loading-bar" aria-label="Loading" />}
    </div>
  );
}
