import { type FormEvent, useEffect, useState } from "react";
import {
  DEFAULT_JIRA_PROJECT,
  JIRA_KEY_PREFIX,
  jiraKeyFromNumber,
  jiraKeyNumber,
} from "../lib/constants";
import type { JiraTransition } from "../lib/jira";
import type { Activity, TimeEntry } from "../lib/types";
import { ActivityPicker } from "./ActivityPicker";
import { JiraStatusControl } from "./JiraStatusControl";

export interface TimeBlockDraft {
  activityId: number;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  jiraKey: string | null;
  jiraProject: string;
}

interface TimeBlockDialogProps {
  entry: TimeEntry | null;
  initial: Omit<TimeBlockDraft, "activityId" | "notes" | "jiraKey" | "jiraProject"> & {
    activityId?: number;
  };
  activities: Activity[];
  knownJiraProjects: string[];
  dayOptions?: Array<{ value: string; label: string }>;
  onClose: (discard: boolean) => void;
  onSave: (draft: TimeBlockDraft) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  onLoadJiraTransitions: (issueKey: string) => Promise<JiraTransition[]>;
  onTransitionJira: (issueKey: string, transition: JiraTransition) => Promise<void>;
}

export function TimeBlockDialog({
  entry,
  initial,
  activities,
  knownJiraProjects,
  dayOptions,
  onClose,
  onSave,
  onDelete,
  onLoadJiraTransitions,
  onTransitionJira,
}: TimeBlockDialogProps) {
  const initialActivity = activities.find(({ id }) => id === (entry?.activityId ?? initial.activityId));
  const [activityId, setActivityId] = useState(initialActivity?.id ?? 0);
  const [date, setDate] = useState(entry?.date ?? initial.date);
  const [startTime, setStartTime] = useState(entry?.startTime ?? initial.startTime);
  const [endTime, setEndTime] = useState(entry?.endTime ?? initial.endTime);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [jiraKey, setJiraKey] = useState(jiraKeyNumber(entry ? entry.jiraKey : initialActivity?.jiraKey));
  const [jiraProject, setJiraProject] = useState(
    entry?.jiraProject || initialActivity?.jiraProject || DEFAULT_JIRA_PROJECT,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedActivity = activities.find(({ id }) => id === activityId);
  const fullJiraKey = jiraKeyFromNumber(jiraKey)?.toUpperCase() ?? null;
  const statusIssueKey = fullJiraKey && /^[A-Z][A-Z0-9_]*-\d+$/.test(fullJiraKey)
    ? fullJiraKey
    : null;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(true);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function changeActivity(activity: Activity | null) {
    setActivityId(activity?.id ?? 0);
    if (!activity) return;
    setJiraKey(jiraKeyNumber(activity?.jiraKey));
    setJiraProject(activity.jiraProject || DEFAULT_JIRA_PROJECT);
  }

  function changeJiraKey(value: string) {
    setJiraKey(value);
    const fullKey = jiraKeyFromNumber(value)?.toUpperCase();
    const activity = activities.find((candidate) => candidate.jiraKey?.toUpperCase() === fullKey);
    if (activity) {
      setActivityId(activity.id);
      setJiraProject(activity.jiraProject || DEFAULT_JIRA_PROJECT);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!activities.some(({ id }) => id === activityId)) {
      setError("Please choose an activity.");
      return;
    }
    if (fullJiraKey && selectedActivity?.jiraKey?.toUpperCase() !== fullJiraKey) {
      setError(`Choose the activity linked to ${fullJiraKey}.`);
      return;
    }
    if (startTime >= endTime) {
      setError("End time must be after start time.");
      return;
    }
    if (!notes.trim()) {
      setError("Add a description of the work completed.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        activityId,
        date,
        startTime,
        endTime,
        notes: notes.trim(),
        jiraKey: jiraKeyFromNumber(jiraKey),
        jiraProject: jiraProject.trim() || DEFAULT_JIRA_PROJECT,
      });
      onClose(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose(true);
    }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="time-block-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Timesheet</p>
            <h2 id="time-block-title">{entry ? "Edit time block" : "New time block"}</h2>
          </div>
        </div>

        <form onSubmit={submit}>
          <label>
            <span>Activity</span>
            <ActivityPicker
              activities={activities}
              value={activityId || null}
              onChange={changeActivity}
              ariaLabel="Activity"
              placeholder="Search QDM name or number…"
              autoFocus
            />
          </label>

          <div className="form-row">
            <label>
              <span>Day</span>
              {dayOptions ? (
                <select value={date} onChange={(event) => setDate(event.target.value)}>
                  {dayOptions.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              )}
            </label>
            <label>
              <span>Jira issue key</span>
              <div className="prefixed-input">
                <b>{JIRA_KEY_PREFIX}</b>
                <input value={jiraKey} onChange={(event) => changeJiraKey(event.target.value)} inputMode="numeric" />
              </div>
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Start</span>
              <input type="time" step="900" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
            </label>
            <label>
              <span>End</span>
              <input type="time" step="900" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
            </label>
          </div>

          <label>
            <span>Jira project</span>
            <input
              list="jira-projects"
              value={jiraProject}
              onChange={(event) => setJiraProject(event.target.value)}
              required
            />
            <datalist id="jira-projects">
              {knownJiraProjects.map((project) => <option value={project} key={project} />)}
            </datalist>
          </label>

          <label>
            <span>Description</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="What did you work on?"
              required
            />
          </label>

          {statusIssueKey && (
            <JiraStatusControl
              issueKey={statusIssueKey}
              status={selectedActivity?.jiraKey?.toUpperCase() === statusIssueKey
                ? selectedActivity.jiraStatus
                : null}
              onLoad={onLoadJiraTransitions}
              onTransition={onTransitionJira}
            />
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            {onDelete && (
              <button className="danger-button" type="button" onClick={async () => {
                if (!window.confirm(`Delete “${entry?.activityName}” on ${entry?.date}?`)) return;
                await onDelete();
                onClose(false);
              }}>
                Delete
              </button>
            )}
            {!onDelete && <span />}
            <span />
            <button className="secondary-button" type="button" onClick={() => onClose(true)}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save block"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
