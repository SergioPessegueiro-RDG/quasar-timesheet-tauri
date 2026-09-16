import { useEffect, useMemo, useState } from "react";
import { addDays, isoDate, startOfWeek, textColor } from "../lib/calendar";
import { listTimeEntries } from "../lib/db/repository";
import type { Activity, Project, TimeEntry } from "../lib/types";
import { durationMinutes } from "../lib/types";

interface SummaryViewProps {
  activities: Activity[];
  projects: Project[];
  showWeekends: boolean;
}

interface TotalRow {
  key: string;
  name: string;
  color: string;
  minutes: number;
}

function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function period(anchor: Date, mode: "week" | "month", showWeekends: boolean): [Date, Date] {
  return mode === "week"
    ? [startOfWeek(anchor), addDays(startOfWeek(anchor), showWeekends ? 6 : 4)]
    : [new Date(anchor.getFullYear(), anchor.getMonth(), 1), lastDayOfMonth(anchor)];
}

function group(
  entries: TimeEntry[],
  keyFor: (entry: TimeEntry) => { key: string; name: string; color: string },
): TotalRow[] {
  const rows = new Map<string, TotalRow>();
  for (const entry of entries) {
    const item = keyFor(entry);
    const current = rows.get(item.key) ?? { ...item, minutes: 0 };
    current.minutes += durationMinutes(entry);
    rows.set(item.key, current);
  }
  return [...rows.values()].sort((a, b) => b.minutes - a.minutes);
}

export function SummaryView({ activities, projects, showWeekends }: SummaryViewProps) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [start, end] = period(anchor, mode, showWeekends);

  useEffect(() => {
    listTimeEntries(isoDate(start), isoDate(end)).then(setEntries);
  }, [isoDate(start), isoDate(end)]);

  const activityById = useMemo(
    () => new Map(activities.map((activity) => [activity.id, activity])),
    [activities],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const activityRows = group(entries, (entry) => ({
    key: entry.activityId ? `activity:${entry.activityId}` : `name:${entry.activityName}`,
    name: entry.activityName,
    color: entry.color,
  }));
  const projectRows = group(entries, (entry) => {
    const activity = entry.activityId ? activityById.get(entry.activityId) : undefined;
    const project = activity ? projectById.get(activity.projectId) : undefined;
    return project
      ? { key: `project:${project.id}`, name: project.name, color: project.color }
      : { key: `orphan:${entry.activityId ?? entry.activityName}`, name: entry.activityName, color: entry.color };
  });
  const totalMinutes = entries.reduce((sum, entry) => sum + durationMinutes(entry), 0);
  const formatter = new Intl.DateTimeFormat(undefined, mode === "week"
    ? { month: "short", day: "numeric", year: "numeric" }
    : { month: "long", year: "numeric" });
  const title = mode === "week" ? `${formatter.format(start)} – ${formatter.format(end)}` : formatter.format(start);

  function navigate(direction: number) {
    setAnchor(mode === "week"
      ? addDays(anchor, direction * 7)
      : new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1));
  }

  return (
    <section className="summary-view">
      <div className="summary-toolbar">
        <div className="segmented-buttons">
          <button type="button" onClick={() => navigate(-1)} aria-label={`Previous ${mode}`}>‹</button>
          <button type="button" onClick={() => setAnchor(new Date())}>Today</button>
          <button type="button" onClick={() => navigate(1)} aria-label={`Next ${mode}`}>›</button>
        </div>
        <strong>{title}</strong>
        <div className="view-tabs summary-toggle">
          <button type="button" className={mode === "week" ? "is-active" : ""} onClick={() => setMode("week")}>Week</button>
          <button type="button" className={mode === "month" ? "is-active" : ""} onClick={() => setMode("month")}>Month</button>
        </div>
      </div>

      <div className="summary-columns">
        <Breakdown title="By Project" rows={projectRows} totalMinutes={totalMinutes} donut />
        <Breakdown title="By Activity" rows={activityRows} totalMinutes={totalMinutes} />
      </div>
    </section>
  );
}

function Breakdown({
  title,
  rows,
  totalMinutes,
  donut = false,
}: {
  title: string;
  rows: TotalRow[];
  totalMinutes: number;
  donut?: boolean;
}) {
  const max = rows[0]?.minutes ?? 0;
  let cursor = 0;
  const stops = rows.map((row) => {
    const start = cursor;
    cursor += totalMinutes ? (row.minutes / totalMinutes) * 100 : 0;
    return `${row.color} ${start}% ${cursor}%`;
  });

  return (
    <article className="summary-card">
      <header>
        <div>
          <p className="eyebrow">Breakdown</p>
          <h2>{title}</h2>
        </div>
        <strong>{(totalMinutes / 60).toFixed(1)}h</strong>
      </header>

      {donut && (
        <div className="donut-wrap">
          <div className="donut" style={{ background: rows.length ? `conic-gradient(${stops.join(",")})` : undefined }}>
            <span><strong>{(totalMinutes / 60).toFixed(1)}h</strong><small>Total</small></span>
          </div>
        </div>
      )}

      <div className="summary-rows">
        {!rows.length && <p className="empty-copy">No time logged in this period.</p>}
        {rows.map((row) => {
          const percent = totalMinutes ? Math.round((row.minutes / totalMinutes) * 100) : 0;
          return (
            <div className="summary-row" key={row.key}>
              <div className="summary-row-copy">
                <span className="color-dot" style={{ background: row.color }} />
                <strong>{row.name}</strong>
                <span>{(row.minutes / 60).toFixed(1)}h · {percent}%</span>
              </div>
              {!donut && (
                <div className="bar-track">
                  <i
                    style={{
                      width: `${max ? Math.max(2, (row.minutes / max) * 100) : 0}%`,
                      background: row.color,
                      color: textColor(row.color),
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
