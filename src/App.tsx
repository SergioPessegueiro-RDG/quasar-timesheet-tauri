import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { WelcomePage } from "./components/WelcomePage";
import { isTauri } from "./lib/db";
import { checkForAppUpdate } from "./lib/updater";
import { clampSidebarWidth, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./lib/layout";
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
  updateActivityJiraStatus,
  updateTemplateEntry,
  updateActivity,
  updateProject,
  updateTimeEntry,
} from "./lib/db/repository";
import {
  fetchAssignedJiraIssues,
  fetchJiraTransitions,
  fetchJiraWorklogs,
  testJiraConnection,
  transitionJiraIssue,
  updateJiraWorklog,
  uploadJiraWorklog,
  type JiraCredentials,
  type JiraTransition,
} from "./lib/jira";
import { addDays, isoDate, startOfWeek } from "./lib/calendar";
import {
  DEFAULT_END_HOUR,
  DEFAULT_JIRA_PROJECT,
  DEFAULT_START_HOUR,
  WEEKDAY_NAMES,
  WEEKEND_NAMES,
} from "./lib/constants";
import {
  clearOutlookFeedCache,
  fetchOutlookFeedCached,
  parseOutlookFeedList,
  parseOutlookIcs,
  type OutlookEvent,
} from "./lib/outlook";
import {
  isJiraSyncPending,
  toTime,
  type Activity,
  type Project,
  type TemplateEntry,
  type TimeEntry,
} from "./lib/types";
import "./App.css";

type View = "timesheet" | "template" | "summary";
type EditorState = {
  mode: "timesheet" | "template";
  source?: "timer";
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
const SIDEBAR_WIDTH_KEY = "quasar-sidebar-width";

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
  const [jiraConnected, setJiraConnected] = useState(false);
  const [activityEditor, setActivityEditor] = useState<Activity | null | undefined>(undefined);
  const [projectEditor, setProjectEditor] = useState<Project | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeCompleted, setWelcomeCompleted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [showTimer, setShowTimer] = useState(true);
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR);
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR);
  const [showWeekends, setShowWeekends] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    const preferredWidth = Number.isFinite(savedWidth) && savedWidth > 0
      ? savedWidth
      : window.innerWidth <= 1180 ? 224 : 264;
    return clampSidebarWidth(preferredWidth, window.innerWidth);
  });
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [outlookLoading, setOutlookLoading] = useState(false);
  const [jiraWeekLoading, setJiraWeekLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jiraSyncInFlight = useRef<Promise<string> | null>(null);
  const entriesRequestId = useRef(0);
  const outlookRequestId = useRef(0);
  const jiraWeekRequestId = useRef(0);
  const jiraLoadedWeeks = useRef(new Set<string>());
  const jiraIssuesLoaded = useRef(false);
  const jiraUserId = useRef<string | null>(null);
  const sidebarResize = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const fitSidebar = () => setSidebarWidth((width) => clampSidebarWidth(width, window.innerWidth));
    window.addEventListener("resize", fitSidebar);
    return () => window.removeEventListener("resize", fitSidebar);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const loadEntries = useCallback(async () => {
    const requestId = ++entriesRequestId.current;
    const end = addDays(weekStart, showWeekends ? 6 : 4);
    setEntriesLoading(true);
    try {
      const nextEntries = await listTimeEntries(isoDate(weekStart), isoDate(end));
      if (requestId === entriesRequestId.current) setEntries(nextEntries);
    } finally {
      if (requestId === entriesRequestId.current) setEntriesLoading(false);
    }
  }, [showWeekends, weekStart]);
  const loadTemplate = useCallback(async () => {
    setTemplateEntries(await listTemplateEntries());
  }, []);
  const loadOutlookGuides = useCallback(async (refresh = false) => {
    const requestId = ++outlookRequestId.current;
    setOutlookLoading(true);
    try {
      if (refresh) clearOutlookFeedCache();
      const saved = await getSetting("outlook_ics_urls");
      if (!saved) {
        if (requestId === outlookRequestId.current) {
          setOutlookGuides([]);
          setOutlookGuideMessage("");
        }
        return;
      }
      const value: unknown = JSON.parse(saved);
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error("The saved Outlook calendar links are invalid.");
      }
      const feeds = parseOutlookFeedList(value.join("\n"));
      const start = isoDate(weekStart);
      const end = isoDate(addDays(weekStart, showWeekends ? 6 : 4));
      const calendars = await Promise.all(feeds.map((url) => fetchOutlookFeedCached(url)));
      if (requestId === outlookRequestId.current) {
        setOutlookGuides(calendars.flatMap((contents) => parseOutlookIcs(contents, start, end).events));
        setOutlookGuideMessage("");
      }
    } catch (cause) {
      if (requestId === outlookRequestId.current) {
        setOutlookGuides([]);
        setOutlookGuideMessage(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (requestId === outlookRequestId.current) setOutlookLoading(false);
    }
  }, [showWeekends, weekStart]);

  const loadJiraTransitions = useCallback(async (issueKey: string) => {
    const credentials = {
      baseUrl: await getSetting("jira_base_url") ?? "",
      email: await getSetting("jira_email") ?? "",
      apiToken: await getSetting("jira_api_token") ?? "",
    };
    if (!credentials.baseUrl || !credentials.email || !credentials.apiToken) {
      throw new Error("Complete the Jira connection in Settings first.");
    }
    return fetchJiraTransitions(credentials, issueKey);
  }, []);

  const changeJiraStatus = useCallback(async (issueKey: string, transition: JiraTransition) => {
    const credentials = {
      baseUrl: await getSetting("jira_base_url") ?? "",
      email: await getSetting("jira_email") ?? "",
      apiToken: await getSetting("jira_api_token") ?? "",
    };
    if (!credentials.baseUrl || !credentials.email || !credentials.apiToken) {
      throw new Error("Complete the Jira connection in Settings first.");
    }
    await transitionJiraIssue(credentials, issueKey, transition.id);
    await updateActivityJiraStatus(issueKey, transition.status);
    setActivities((current) => current.map((activity) => (
      activity.jiraKey?.toUpperCase() === issueKey.toUpperCase()
        ? { ...activity, jiraStatus: transition.status }
        : activity
    )));
  }, []);

  useEffect(() => {
    void checkForAppUpdate().catch((cause) => {
      console.warn("Update check failed", cause);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listProjects(),
      listActivities(),
      listKnownJiraProjects(),
      loadTemplate(),
      getSetting("theme_mode"),
      getSetting("show_timer"),
      getSetting("work_start_hour"),
      getSetting("work_end_hour"),
      getSetting("show_weekends"),
      getSetting("jira_base_url"),
      getSetting("jira_email"),
      getSetting("jira_api_token"),
      getSetting("welcome_completed"),
    ])
      .then(([
        p, a, jiraProjects, , savedTheme, savedShowTimer,
        savedStartHour, savedEndHour, savedShowWeekends,
        savedJiraUrl, savedJiraEmail, savedJiraToken, savedWelcomeCompleted,
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
        setJiraConnected(Boolean(savedJiraUrl && savedJiraEmail && savedJiraToken));
        setWelcomeCompleted(savedWelcomeCompleted === "1");
        setWelcomeOpen(savedWelcomeCompleted !== "1");
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
  }, [loadTemplate]);

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "system" ? "light dark" : theme;
  }, [theme]);

  useEffect(() => {
    void loadOutlookGuides();
  }, [loadOutlookGuides]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (loading || !jiraConnected) return;
    const start = isoDate(weekStart);
    const end = isoDate(addDays(weekStart, showWeekends ? 6 : 4));
    const rangeKey = `${start}:${end}`;
    if (jiraLoadedWeeks.current.has(rangeKey)) {
      setJiraWeekLoading(false);
      return;
    }

    const requestId = ++jiraWeekRequestId.current;
    let active = true;
    setJiraWeekLoading(true);
    void (async () => {
      const credentials = {
        baseUrl: await getSetting("jira_base_url") ?? "",
        email: await getSetting("jira_email") ?? "",
        apiToken: await getSetting("jira_api_token") ?? "",
      };
      if (!credentials.baseUrl || !credentials.email || !credentials.apiToken) return;
      const accountId = jiraUserId.current
        ?? (jiraUserId.current = (await testJiraConnection(credentials)).accountId);
      const [issues, worklogs] = await Promise.all([
        jiraIssuesLoaded.current ? Promise.resolve([]) : fetchAssignedJiraIssues(credentials),
        fetchJiraWorklogs(credentials, accountId, start, end),
      ]);
      await syncJiraData(issues, worklogs);
      jiraIssuesLoaded.current = true;
      jiraLoadedWeeks.current.add(rangeKey);
      if (active && requestId === jiraWeekRequestId.current) {
        await Promise.all([refreshWorkspace(), loadEntries()]);
        setJiraSyncMessage("");
      }
    })().catch((cause) => {
      if (active && requestId === jiraWeekRequestId.current) {
        setJiraSyncMessage(`Jira history failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }).finally(() => {
      if (active && requestId === jiraWeekRequestId.current) setJiraWeekLoading(false);
    });
    return () => {
      active = false;
    };
  }, [jiraConnected, loading, loadEntries, showWeekends, weekStart]);

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
    if (jiraSyncInFlight.current) return jiraSyncInFlight.current;
    const request = performJiraSync(credentials, silentIfMissing);
    jiraSyncInFlight.current = request;
    try {
      return await request;
    } finally {
      if (jiraSyncInFlight.current === request) jiraSyncInFlight.current = null;
    }
  }

  async function performJiraSync(
    credentials?: JiraCredentials,
    silentIfMissing = false,
  ): Promise<string> {
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
      jiraUserId.current = user.accountId;
      const start = isoDate(weekStart);
      const end = isoDate(addDays(weekStart, showWeekends ? 6 : 4));
      const [issues, worklogs] = await Promise.all([
        fetchAssignedJiraIssues(saved),
        fetchJiraWorklogs(saved, user.accountId, start, end),
      ]);
      await syncJiraData(issues, worklogs);
      jiraIssuesLoaded.current = true;
      jiraLoadedWeeks.current.add(`${start}:${end}`);
      await Promise.all([refreshWorkspace(), loadEntries()]);
      setJiraConnected(true);
      setArmedActivity(null);
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

      const pending = entries.filter(isJiraSyncPending);
      if (!pending.length) {
        setJiraUploadMessage("No new Jira worklogs in this week.");
        return;
      }

      let uploaded = 0;
      const failures: string[] = [];
      for (const entry of pending) {
        try {
          if (entry.jiraWorklogId) {
            await updateJiraWorklog(entry, { baseUrl, email, apiToken });
            await markJiraWorklogUploaded(entry.id, entry.jiraWorklogId);
          } else {
            const worklogId = await uploadJiraWorklog(entry, { baseUrl, email, apiToken });
            await markJiraWorklogUploaded(entry.id, worklogId);
          }
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
    try {
      const dates = dayNames.map((_, index) => isoDate(addDays(weekStart, index)));
      const result = await applyTemplateToWeek(dates);
      await loadEntries();
      window.alert(
        `Added ${result.created} block${result.created === 1 ? "" : "s"}`
        + (result.skipped.length ? `; skipped ${result.skipped.length} occupied slot${result.skipped.length === 1 ? "" : "s"}.` : "."),
      );
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => {
      const [sh, sm] = entry.startTime.split(":").map(Number);
      const [eh, em] = entry.endTime.split(":").map(Number);
      return sum + (eh * 60 + em - sh * 60 - sm);
    }, 0) / 60,
    [entries],
  );
  const hasPendingJiraEntries = useMemo(
    () => entries.some(isJiraSyncPending),
    [entries],
  );
  const visibleProjectIds = useMemo(
    () => new Set(projects.filter((project) => (
      !jiraConnected || project.jiraKey || project.name === DEFAULT_JIRA_PROJECT
    )).map((project) => project.id)),
    [jiraConnected, projects],
  );
  const visibleActivities = useMemo(
    () => jiraConnected
      ? activities.filter((activity) => Boolean(activity.jiraKey && visibleProjectIds.has(activity.projectId)))
      : activities,
    [activities, jiraConnected, visibleProjectIds],
  );
  const visibleProjects = useMemo(
    () => jiraConnected
      ? projects.filter((project) => (
        visibleProjectIds.has(project.id)
        && visibleActivities.some((activity) => activity.projectId === project.id)
      ))
      : projects,
    [jiraConnected, projects, visibleActivities, visibleProjectIds],
  );
  const workspaceStyle = { "--sidebar-width": `${sidebarWidth}px` } as CSSProperties;

  function beginSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    sidebarResize.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("is-resizing");
  }

  function updateSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = sidebarResize.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setSidebarWidth(clampSidebarWidth(
      resize.startWidth + event.clientX - resize.startX,
      window.innerWidth,
    ));
  }

  function finishSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (sidebarResize.current?.pointerId !== event.pointerId) return;
    sidebarResize.current = null;
    event.currentTarget.classList.remove("is-resizing");
  }

  if (error) {
    return (
      <main className="fatal-state">
        <h1>Database failed to open</h1>
        <pre>{error}</pre>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="startup-page" aria-label="Loading QUASAR Timesheet Manager">
        <div className="welcome-logo" aria-hidden="true">Q</div>
        <i aria-hidden="true" />
      </main>
    );
  }

  if (welcomeOpen) {
    return (
      <WelcomePage
        returning={welcomeCompleted}
        onComplete={async (jira) => {
          setWelcomeCompleted(true);
          setWelcomeOpen(false);
          setJiraConnected(Boolean(jira));
          await loadOutlookGuides(true);
        }}
        onSkip={async () => {
          await setSetting("welcome_completed", "1");
          setWelcomeCompleted(true);
          setWelcomeOpen(false);
        }}
      />
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
        activities={visibleActivities}
        onFinish={(activity, startedAt, duration) => {
          const startMinutes = startedAt.getHours() * 60 + startedAt.getMinutes();
          setEditor({
            mode: "timesheet",
            source: "timer",
            entry: null,
            initial: {
              activityId: activity.id,
              date: isoDate(startedAt),
              startTime: toTime(startMinutes),
              endTime: toTime(Math.min(startMinutes + duration, 23 * 60 + 59)),
            },
          });
          const currentWeek = startOfWeek(startedAt);
          if (isoDate(currentWeek) !== isoDate(weekStart)) setWeekStart(currentWeek);
          setView("timesheet");
        }}
      />}

      <div className="workspace" style={workspaceStyle}>
        <Sidebar
          projects={visibleProjects}
          activities={visibleActivities}
          armedActivity={armedActivity}
          onArm={setArmedActivity}
          onToggleProject={toggleProject}
          onAddActivity={() => setActivityEditor(null)}
          onEditActivity={setActivityEditor}
          onEditProject={setProjectEditor}
        />

        <div
          className="workspace-divider"
          role="separator"
          aria-label="Resize Activities panel"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={beginSidebarResize}
          onPointerMove={updateSidebarResize}
          onPointerUp={finishSidebarResize}
          onPointerCancel={finishSidebarResize}
          onDoubleClick={() => setSidebarWidth(window.innerWidth <= 1180 ? 224 : 264)}
          onKeyDown={(event) => {
            const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!direction) return;
            event.preventDefault();
            setSidebarWidth((width) => clampSidebarWidth(width + direction * 16, window.innerWidth));
          }}
        >
          <span />
        </div>

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
                <button
                  className="secondary-button toolbar-button jira-button"
                  type="button"
                  onClick={uploadCurrentWeekToJira}
                  disabled={jiraUploading || !hasPendingJiraEntries}
                >
                  <JiraMark /> {jiraUploading ? "Uploading…" : hasPendingJiraEntries ? "Upload to Jira" : "Synced"}
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
                <div className="week-loading-indicators" aria-live="polite">
                  {(entriesLoading || jiraWeekLoading) && (
                    <span className="week-loading-item"><i aria-hidden="true" />Loading logged QDMs…</span>
                  )}
                  {outlookLoading && (
                    <span className="week-loading-item"><i aria-hidden="true" />Loading Outlook events…</span>
                  )}
                </div>
              </div>
              <WeeklyCalendar
                weekStart={weekStart}
                entries={entries}
                guides={outlookGuides}
                activities={visibleActivities}
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
                onQuickCreate={(activity, date, startTime, endTime) => {
                  setEditor({
                    mode: "timesheet",
                    entry: null,
                    initial: { activityId: activity.id, date, startTime, endTime },
                  });
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
                activities={visibleActivities}
                armedActivity={armedActivity}
                showDates={false}
                showNow={false}
                showSyncStatus={false}
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
                onQuickCreate={(activity, date, startTime, endTime) => {
                  setEditor({
                    mode: "template",
                    entry: null,
                    initial: { activityId: activity.id, date, startTime, endTime },
                  });
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
            <SummaryView activities={visibleActivities} projects={visibleProjects} showWeekends={showWeekends} />
          )}
        </main>
      </div>

      {activityEditor !== undefined && (
        <ActivityDialog
          activity={activityEditor}
          projects={visibleProjects}
          onClose={() => setActivityEditor(undefined)}
          onSave={saveActivity}
          onLoadJiraTransitions={loadJiraTransitions}
          onTransitionJira={changeJiraStatus}
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
          onShowWelcome={() => {
            setSettingsOpen(false);
            setWelcomeOpen(true);
          }}
          onSyncJira={syncJira}
          onJiraConfigured={setJiraConnected}
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
          activities={visibleActivities}
          knownJiraProjects={knownJiraProjects}
          dayOptions={editor.mode === "template"
            ? dayNames.map((label, index) => ({ value: TEMPLATE_DATES[index], label }))
            : undefined}
          onClose={(discard) => {
            if (
              discard
              && editor.source === "timer"
              && !window.confirm("Discard this tracked time without logging it?")
            ) return;
            setEditor(null);
          }}
          onSave={saveTimeBlock}
          onLoadJiraTransitions={loadJiraTransitions}
          onTransitionJira={changeJiraStatus}
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
          onSaved={() => loadOutlookGuides(true)}
          onClose={() => setOutlookImportOpen(false)}
        />
      )}

    </div>
  );
}
