import { useEffect, useState } from "react";
import { isTauri } from "./lib/db";
import { listActivities, listProjects } from "./lib/db/repository";
import type { Activity, Project } from "./lib/types";
import "./App.css";

/**
 * Temporary boot check. It exists to prove the query layer works identically in
 * the browser and in the packaged app, and will be replaced by the real shell.
 */
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listProjects(), listActivities()])
      .then(([p, a]) => {
        setProjects(p);
        setActivities(a);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <main className="boot">
        <h1>Database failed to open</h1>
        <pre className="boot-error">{error}</pre>
      </main>
    );
  }

  return (
    <main className="boot">
      <h1>QUASAR Timesheet Manager</h1>
      <p className="boot-mode">
        {isTauri() ? "Running in Tauri, against a SQLite file" : "Running in a browser, against in-memory WASM SQLite"}
      </p>

      <h2>Projects ({projects.length})</h2>
      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            <span className="swatch" style={{ background: project.color }} />
            {project.name}
          </li>
        ))}
      </ul>

      <h2>Activities ({activities.length})</h2>
      <ul>
        {activities.map((activity) => (
          <li key={activity.id}>
            <span className="swatch" style={{ background: activity.color }} />
            {activity.name}
            {activity.jiraKey ? ` — ${activity.jiraKey}` : ""}
            {activity.defaultDurationMinutes ? ` (${activity.defaultDurationMinutes}m)` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
