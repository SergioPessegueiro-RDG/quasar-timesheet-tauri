import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ActivityDialog, type ActivityDraft } from "./components/ActivityDialog";
import { ProjectDialog } from "./components/ProjectDialog";
import { SettingsDialog, type ThemeMode } from "./components/SettingsDialog";
import { ExportDialog } from "./components/ExportDialog";
import { OutlookImportDialog } from "./components/OutlookImportDialog";
import { JiraMark } from "./components/JiraMark";
import { SummaryView } from "./components/SummaryView";
import { TimeBlockDialog, type TimeBlockDraft } from "./components/TimeBlockDialog";
import { TimerBar } from "./components/TimerBar";
import { WeeklyCalendar } from "./components/WeeklyCalendar";
import { isTauri } from "./lib/db";
import {
  addTimeEntry,
  addTemplateEntry,
  addActivity,
  addProject,
  applyTemplateToWeek,
  deleteTemplateEntry,
  deleteActivity,
  deleteProject,
  deleteTimeEntry,
  getSetting,
  listActivities,
  listKnownJiraProjects,
  listProjects,
  listTemplateEntries,
  listTimeEntries,
  markJiraWorklogUploaded,
  moveTemplateEntry,
  moveTimeEntry,
  setProjectCollapsed,
  setSetting,
  syncJiraData,
  updateTemplateEntry,
  updateActivity,
  updateProject,
  updateTimeEntry,
} from "./lib/db/repository";
import {
  fetchAssignedJiraIssues,
  fetchJiraWorklogs,
  testJiraConnection,
  uploadJiraWorklog,
  type JiraCredentials,
} from "./lib/jira";
import { addDays, isoDate, startOfWeek } from "./lib/calendar";
import {
  DEFAULT_END_HOUR,
  DEFAULT_START_HOUR,
  WEEKDAY_NAMES,
  WEEKEND_NAMES,
} from "./lib/constants";
import {
  fetchOutlookFeed,
  parseOutlookFeedList,
  parseOutlookIcs,
  type OutlookEvent,
} from "./lib/outlook";
import { toTime, type Activity, type Project, type TemplateEntry, type TimeEntry } from "./lib/types";
import "./App.css";

type View = "timesheet" | "template" | "summary";
type EditorState = {
  mode: "timesheet" | "template";
  entry: TimeEntry | null;
  templateEntry?: TemplateEntry;
  initial: {
    date: string;
    startTime: string;
    endTime: string;
    activityId?: number;
  };
};

const TEMPLATE_WEEK = new Date(2000, 0, 3);
const ALL_DAY_NAMES = [...WEEKDAY_NAMES, ...WEEKEND_NAMES];
const TEMPLATE_DATES = ALL_DAY_NAMES.map((_, index) => isoDate(addDays(TEMPLATE_WEEK, index)));

function weekTitle(monday: Date, showWeekends: boolean): string {
  const lastDay = addDays(monday, showWeekends ? 6 : 4);
  const start = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(monday);
  const end = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(lastDay);
  return `${start} – ${end}`;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [templateEntries, setTemplateEntries] = useState<TemplateEntry[]>([]);
  const [knownJiraProjects, setKnownJiraProjects] = useState<string[]>([]);
  const [armedActivity, setArmedActivity] = useState<Activity | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<View>("timesheet");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [outlookImportOpen, setOutlookImportOpen] = useState(false);
  const [outlookGuides, setOutlookGuides] = useState<OutlookEvent[]>([]);
  const [outlookGuideMessage, setOutlookGuideMessage] = useState("");
  const [jiraUploading, setJiraUploading] = useState(false);
  const [jiraUploadMessage, setJiraUploadMessage] = useState("");
  const [jiraSyncMessage, setJiraSyncMessage] = useState("");
  const [activityEditor, setActivityEditor] = useState<Activity | null | undefined>(undefined);
  const [projectEditor, setProjectEditor] = useState<Project | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [showTimer, setShowTimer] = useState(true);
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR);
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR);
  const [showWeekends, setShowWeekends] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const jiraAutoSyncStarted = useRef(false);

  const loadEntries = useCallback(async () => {
    const end = addDays(weekStart, showWeekends ? 6 : 4);
    setEntries(await listTimeEntries(isoDate(weekStart), isoDate(end)));
  }, [showWeekends, weekStart]);
  const loadTemplate = useCallback(async () => {
    setTemplateEntries(await listTemplateEntries());
  }, []);
  const loadOutlookGuides = useCallback(async () => {
    try {
      const saved = await getSetting("outlook_ics_urls");
      if (!saved) {
        setOutlookGuides([]);
        setOutlookGuideMessage("");
        return;
      }
      const value: unknown = JSON.parse(saved);
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error("The saved Outlook calendar links are invalid.");
      }
      const feeds = parseOutlookFeedList(value.join("\n"));
      const start = isoDate(weekStart);
      const end = isoDate(addDays(weekStart, showWeekends ? 6 : 4));
      const calendars = await Promise.all(feeds.map((url) => fetchOutlookFeed(url)));
      setOutlookGuides(calendars.flatMap((contents) => parseOutlookIcs(contents, start, end).events));
      setOutlookGuideMessage("");
    } catch (cause) {
      setOutlookGuides([]);
      setOutlookGuideMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }, [showWeekends, weekStart]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listProjects(),
      listActivities(),
      listKnownJiraProjects(),
      loadEntries(),
      loadTemplate(),
      getSetting("theme_mode"),
      getSetting("show_timer"),
      getSetting("work_start_hour"),
      getSetting("work_end_hour"),
      getSetting("show_weekends"),
    ])
      .then(([
        p, a, jiraProjects, , , savedTheme, savedShowTimer,
        savedStartHour, savedEndHour, savedShowWeekends,
      ]) => {
        setProjects(p);
        setActivities(a);
        setKnownJiraProjects(jiraProjects);
        if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
        setShowTimer(savedShowTimer !== "0");
        const nextStart = savedStartHour === null ? Number.NaN : Number(savedStartHour);
        const nextEnd = savedEndHour === null ? Number.NaN : Number(savedEndHour);
        if (nextStart >= 0 && nextStart <= 23 && nextEnd > nextStart && nextEnd <= 24) {
          setStartHour(nextStart);
          setEndHour(nextEnd);
        }
        setShowWeekends(savedShowWeekends === "1");
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, [loadEntries, loadTemplate]);

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "system" ? "light dark" : theme;
  }, [theme]);

  useEffect(() => {
    void loadOutlookGuides();
  }, [loadOutlookGuides]);

  useEffect(() => {
    if (loading || jiraAutoSyncStarted.current) return;
    jiraAutoSyncStarted.current = true;
    void syncJira(undefined, true);
  }, [loading]);

  async function toggleProject(project: Project) {
    await setProjectCollapsed(project.id, !project.collapsed);
    setProjects((current) => current.map((item) => (
      item.id === project.id ? { ...item, collapsed: !item.collapsed } : item
    )));
  }

  async function refreshWorkspace() {
    const [nextProjects, nextActivities] = await Promise.all([listProjects(), listActivities()]);
    setProjects(nextProjects);
    setActivities(nextActivities);
    setArmedActivity((current) => (
      current ? nextActivities.find(({ id }) => id === current.id) ?? null : null
    ));
  }

  async function syncJira(credentials?: JiraCredentials, silentIfMissing = false): Promise<string> {
    try {
      const saved = credentials ?? {
        baseUrl: await getSetting("jira_base_url") ?? "",
        email: await getSetting("jira_email") ?? "",
        apiToken: await getSetting("jira_api_token") ?? "",
      };
      if (!saved.baseUrl || !saved.email || !saved.apiToken) {
        const message = "Complete the Jira connection in Settings first.";
        if (!silentIfMissing) setJiraSyncMessage(message);
        return message;
      }

      setJiraSyncMessage("Syncing Jira…");
      const user = await testJiraConnection(saved);
      const start = isoDate(weekStart);
      const end = isoDate(addDays(weekStart, showWeekends ? 6 : 4));
      const [issues, worklogs] = await Promise.all([
        fetchAssignedJiraIssues(saved),
        fetchJiraWorklogs(saved, user.accountId, start, end),
      ]);
      await syncJiraData(issues, worklogs);
      await Promise.all([refreshWorkspace(), loadEntries()]);
      const message = `Synced ${issues.length} QDM${issues.length === 1 ? "" : "s"} and ${worklogs.length} Jira worklog${worklogs.length === 1 ? "" : "s"}.`;
      setJiraSyncMessage(message);
      return message;
    } catch (cause) {
      const message = `Jira sync failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      setJiraSyncMessage(message);
      return message;
    }
  }

  async function uploadCurrentWeekToJira() {
    setJiraUploading(true);
    setJiraUploadMessage("");
    try {
      const [baseUrl, email, apiToken] = await Promise.all([
        getSetting("jira_base_url"),
        getSetting("jira_email"),
        getSetting("jira_api_token"),
      ]);
      if (!baseUrl || !email || !apiToken) {
        setJiraUploadMessage("Complete the Jira connection in Settings first.");
        setSettingsOpen(true);
        return;
      }

      const pending = entries.filter((entry) => entry.jiraKey && !entry.jiraWorklogId);
      if (!pending.length) {
        setJiraUploadMessage("No new Jira worklogs in this week.");
        return;
      }

      let uploaded = 0;
      const failures: string[] = [];
      for (const entry of pending) {
        try {
          const worklogId = await uploadJiraWorklog(entry, { baseUrl, email, apiToken });
          await markJiraWorklogUploaded(entry.id, worklogId);
          uploaded++;
        } catch (cause) {
          failures.push(`${entry.jiraKey}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      await loadEntries();
      setJiraUploadMessage(
        `Uploaded ${uploaded} worklog${uploaded === 1 ? "" : "s"}.`
        + (failures.length ? ` Failed ${failures.length}: ${failures.slice(0, 2).join(" | ")}` : ""),
      );
    } catch (cause) {
      setJiraUploadMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setJiraUploading(false);
    }
  }

  async function saveActivity(draft: ActivityDraft) {
    const projectId = draft.projectId ?? await addProject(draft.newProjectName);
    if (activityEditor) {
      await updateActivity({
        id: activityEditor.id,
        name: draft.name,
        jiraKey: draft.jiraKey,
        defaultDurationMinutes: draft.defaultDurationMinutes,
        archived: false,
        projectId,
        jiraProject: draft.jiraProject,
        issueType: activityEditor.issueType,
      });
    } else {
      await addActivity({
        name: draft.name,
        jiraKey: draft.jiraKey,
        defaultDurationMinutes: draft.defaultDurationMinutes,
        archived: false,
        projectId,
        jiraProject: draft.jiraProject,
        issueType: null,
      });
    }
    await refreshWorkspace();
  }

  async function saveTimeBlock(draft: TimeBlockDraft) {
    const activity = activities.find(({ id }) => id === draft.activityId);
    if (!activity) throw new Error("The selected activity no longer exists.");
    if (editor?.mode === "template") {
      const dayOfWeek = TEMPLATE_DATES.indexOf(draft.date);
      if (editor.templateEntry) {
        await updateTemplateEntry({
          ...editor.templateEntry,
          activityId: activity.id,
          activityName: activity.name,
          color: activity.color,
          dayOfWeek,
          startTime: draft.startTime,
          endTime: draft.endTime,
          notes: draft.notes,
          jiraKey: draft.jiraKey,
          jiraProject: draft.jiraProject,
          issueType: null,
        });
      } else {
        await addTemplateEntry({
          activityId: activity.id,
          activityLabel: activity.name,
          dayOfWeek,
          startTime: draft.startTime,
          endTime: draft.endTime,
          notes: draft.notes,
          jiraKey: draft.jiraKey,
          jiraProject: draft.jiraProject,
          issueType: null,
        });
      }
      await loadTemplate();
    } else if (editor?.entry) {
      await updateTimeEntry({
        ...editor.entry,
        activityId: activity.id,
        activityName: activity.name,
        color: activity.color,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        notes: draft.notes,
        jiraKey: draft.jiraKey,
        jiraProject: draft.jiraProject,
        issueType: null,
      });
    } else {
      await addTimeEntry({
        activityId: activity.id,
        activityLabel: activity.name,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        notes: draft.notes,
        jiraKey: draft.jiraKey,
        jiraProject: draft.jiraProject,
        issueType: null,
      });
    }
    if (editor?.mode !== "template") await loadEntries();
  }

  const templateBlocks = useMemo<TimeEntry[]>(() => templateEntries.map((entry) => ({
    ...entry,
    date: TEMPLATE_DATES[entry.dayOfWeek],
  })), [templateEntries]);
  const dayNames = showWeekends ? ALL_DAY_NAMES : WEEKDAY_NAMES;

  async function applyTemplate() {
    if (!templateEntries.length) {
      window.alert("The Template is empty. Add recurring blocks there first.");
      return;
    }
    const dates = dayNames.map((_, index) => isoDate(addDays(weekStart, index)));
    const result = await applyTemplateToWeek(dates);
    await loadEntries();
    window.alert(
      `Added ${result.created} block${result.created === 1 ? "" : "s"}`
      + (result.skipped.length ? `; skipped ${result.skipped.length} occupied slot${result.skipped.length === 1 ? "" : "s"}.` : "."),
    );
  }

  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => {
      const [sh, sm] = entry.startTime.split(":").map(Number);
      const [eh, em] = entry.endTime.split(":").map(Number);
      return sum + (eh * 60 + em - sh * 60 - sm);
    }, 0) / 60,
    [entries],
  );

  if (error) {
    return (
      <main className="fatal-state">
        <h1>Database failed to open</h1>
        <pre>{error}</pre>
      </main>
    );
  }

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
          <button className="icon-button" type="button" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      {showTimer && <TimerBar
        activities={activities}
        onLog={async (activity, startedAt, duration) => {
          const startMinutes = startedAt.getHours() * 60 + startedAt.getMinutes();
          await addTimeEntry({
            activityId: activity.id,
            activityLabel: activity.name,
            date: isoDate(startedAt),
            startTime: toTime(startMinutes),
            endTime: toTime(Math.min(startMinutes + duration, 23 * 60 + 59)),
            notes: "",
            jiraKey: activity.jiraKey,
            jiraProject: activity.jiraProject,
            issueType: activity.issueType,
          });
          const currentWeek = startOfWeek(startedAt);
          if (isoDate(currentWeek) === isoDate(weekStart)) await loadEntries();
          else setWeekStart(currentWeek);
          setView("timesheet");
        }}
      />}

      <div className="workspace">
        <Sidebar
          projects={projects}
          activities={activities}
          armedActivity={armedActivity}
          onArm={setArmedActivity}
          onToggleProject={toggleProject}
          onAddActivity={() => setActivityEditor(null)}
          onEditActivity={setActivityEditor}
          onEditProject={setProjectEditor}
        />

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{view === "timesheet" ? "Weekly timesheet" : view}</p>
              <h1>{view === "timesheet" ? weekTitle(weekStart, showWeekends) : view[0].toUpperCase() + view.slice(1)}</h1>
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
                <button className="secondary-button toolbar-button" type="button" onClick={applyTemplate}>Apply template</button>
                <button className="secondary-button toolbar-button jira-button" type="button" onClick={uploadCurrentWeekToJira} disabled={jiraUploading}>
                  <JiraMark /> {jiraUploading ? "Uploading…" : "Upload Jira"}
                </button>
              </div>
            )}
          </div>

          {view === "timesheet" ? (
            <>
              {outlookGuideMessage && <p className="integration-message" role="status">{outlookGuideMessage}</p>}
              {jiraSyncMessage && <p className="integration-message" role="status">{jiraSyncMessage}</p>}
              {jiraUploadMessage && <p className="integration-message" role="status">{jiraUploadMessage}</p>}
              <div className={`placement-hint${armedActivity ? " is-active" : ""}`} role="status">
                <span>{armedActivity ? "＋" : "↖"}</span>
                {armedActivity
                  ? <>Click or drag the grid to place <strong>{armedActivity.name}</strong>. Press Esc to cancel.</>
                  : "Choose an activity on the left, then click or drag the grid."}
              </div>
              <WeeklyCalendar
                weekStart={weekStart}
                entries={entries}
                guides={outlookGuides}
                activities={activities}
                armedActivity={armedActivity}
                dayNames={dayNames}
                startHour={startHour}
                endHour={endHour}
                onCreate={(initial) => setEditor({ mode: "timesheet", entry: null, initial })}
                onEdit={(entry) => setEditor({
                  mode: "timesheet",
                  entry,
                  initial: {
                    date: entry.date,
                    startTime: entry.startTime,
                    endTime: entry.endTime,
                    activityId: entry.activityId ?? undefined,
                  },
                })}
                onQuickCreate={async (activity, date, startTime, endTime) => {
                  await addTimeEntry({
                    activityId: activity.id,
                    activityLabel: activity.name,
                    date,
                    startTime,
                    endTime,
                    notes: "",
                    jiraKey: activity.jiraKey,
                    jiraProject: activity.jiraProject,
                    issueType: activity.issueType,
                  });
                  await loadEntries();
                }}
                onMove={async (entry, date, startTime, endTime) => {
                  await moveTimeEntry(entry.id, date, startTime, endTime);
                  await loadEntries();
                }}
                onDelete={async (entry) => {
                  await deleteTimeEntry(entry.id);
                  await loadEntries();
                }}
              />
            </>
          ) : view === "template" ? (
            <>
              <div className={`placement-hint${armedActivity ? " is-active" : ""}`} role="status">
                <span>{armedActivity ? "＋" : "↖"}</span>
                {armedActivity
                  ? <>Click or drag to add <strong>{armedActivity.name}</strong> to the recurring week.</>
                  : "Choose an activity, then build the week you want to reuse."}
              </div>
              <WeeklyCalendar
                weekStart={TEMPLATE_WEEK}
                entries={templateBlocks}
                activities={activities}
                armedActivity={armedActivity}
                showDates={false}
                showNow={false}
                dayNames={dayNames}
                startHour={startHour}
                endHour={endHour}
                onCreate={(initial) => setEditor({ mode: "template", entry: null, initial })}
                onEdit={(entry) => setEditor({
                  mode: "template",
                  entry,
                  templateEntry: templateEntries.find(({ id }) => id === entry.id),
                  initial: {
                    date: entry.date,
                    startTime: entry.startTime,
                    endTime: entry.endTime,
                    activityId: entry.activityId ?? undefined,
                  },
                })}
                onQuickCreate={async (activity, date, startTime, endTime) => {
                  await addTemplateEntry({
                    activityId: activity.id,
                    activityLabel: activity.name,
                    dayOfWeek: TEMPLATE_DATES.indexOf(date),
                    startTime,
                    endTime,
                    notes: "",
                    jiraKey: activity.jiraKey,
                    jiraProject: activity.jiraProject,
                    issueType: activity.issueType,
                  });
                  await loadTemplate();
                }}
                onMove={async (entry, date, startTime, endTime) => {
                  await moveTemplateEntry(entry.id, TEMPLATE_DATES.indexOf(date), startTime, endTime);
                  await loadTemplate();
                }}
                onDelete={async (entry) => {
                  await deleteTemplateEntry(entry.id);
                  await loadTemplate();
                }}
              />
            </>
          ) : (
            <SummaryView activities={activities} projects={projects} showWeekends={showWeekends} />
          )}
        </main>
      </div>

      {loading && <div className="loading-bar" aria-label="Loading" />}

      {activityEditor !== undefined && (
        <ActivityDialog
          activity={activityEditor}
          projects={projects}
          onClose={() => setActivityEditor(undefined)}
          onSave={saveActivity}
          onDelete={activityEditor ? async () => {
            if (!window.confirm(`Delete “${activityEditor.name}”? Existing time blocks will be kept.`)) return;
            await deleteActivity(activityEditor.id);
            await refreshWorkspace();
            setActivityEditor(undefined);
          } : null}
        />
      )}

      {projectEditor && (
        <ProjectDialog
          project={projectEditor}
          onClose={() => setProjectEditor(null)}
          onSave={async (project) => {
            await updateProject(project);
            await refreshWorkspace();
          }}
          onDelete={async () => {
            if (!window.confirm(`Delete “${projectEditor.name}”? Its activities will move to General.`)) return;
            await deleteProject(projectEditor.id);
            await refreshWorkspace();
            setProjectEditor(null);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          showTimer={showTimer}
          startHour={startHour}
          endHour={endHour}
          showWeekends={showWeekends}
          onClose={() => setSettingsOpen(false)}
          onExportCsv={() => {
            setSettingsOpen(false);
            setExportOpen(true);
          }}
          onImportOutlook={() => {
            setSettingsOpen(false);
            setOutlookImportOpen(true);
          }}
          onSyncJira={syncJira}
          onSave={async (
            nextTheme,
            nextShowTimer,
            nextStartHour,
            nextEndHour,
            nextShowWeekends,
          ) => {
            await Promise.all([
              setSetting("theme_mode", nextTheme),
              setSetting("show_timer", nextShowTimer ? "1" : "0"),
              setSetting("work_start_hour", String(nextStartHour)),
              setSetting("work_end_hour", String(nextEndHour)),
              setSetting("show_weekends", nextShowWeekends ? "1" : "0"),
            ]);
            setTheme(nextTheme);
            setShowTimer(nextShowTimer);
            setStartHour(nextStartHour);
            setEndHour(nextEndHour);
            setShowWeekends(nextShowWeekends);
          }}
        />
      )}

      {editor && (
        <TimeBlockDialog
          key={`${editor.entry?.id ?? "new"}-${editor.initial.date}-${editor.initial.startTime}`}
          entry={editor.entry}
          initial={editor.initial}
          activities={activities}
          knownJiraProjects={knownJiraProjects}
          dayOptions={editor.mode === "template"
            ? dayNames.map((label, index) => ({ value: TEMPLATE_DATES[index], label }))
            : undefined}
          onClose={() => setEditor(null)}
          onSave={saveTimeBlock}
          onDelete={editor.entry ? async () => {
            if (editor.mode === "template") {
              await deleteTemplateEntry(editor.entry!.id);
              await loadTemplate();
            } else {
              await deleteTimeEntry(editor.entry!.id);
              await loadEntries();
            }
          } : null}
        />
      )}

      {exportOpen && (
        <ExportDialog
          initialStart={isoDate(weekStart)}
          initialEnd={isoDate(addDays(weekStart, showWeekends ? 6 : 4))}
          onClose={() => setExportOpen(false)}
        />
      )}

      {outlookImportOpen && (
        <OutlookImportDialog
          onSaved={loadOutlookGuides}
          onClose={() => setOutlookImportOpen(false)}
        />
      )}

    </div>
  );
}
