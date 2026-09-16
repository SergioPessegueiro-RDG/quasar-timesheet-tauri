import { useEffect, useState } from "react";
import { DEFAULT_JIRA_PROJECT } from "../lib/constants";
import type { Activity, Project } from "../lib/types";

export interface ActivityDraft {
  name: string;
  projectId: number | null;
  newProjectName: string;
  jiraKey: string | null;
  defaultDurationMinutes: number;
  jiraProject: string;
}

interface ActivityDialogProps {
  activity: Activity | null;
  projects: Project[];
  onClose: () => void;
  onSave: (draft: ActivityDraft) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
}

export function ActivityDialog({
  activity,
  projects,
  onClose,
  onSave,
  onDelete,
}: ActivityDialogProps) {
  const [name, setName] = useState(activity?.name ?? "");
  const [projectValue, setProjectValue] = useState(String(activity?.projectId ?? projects[0]?.id ?? "new"));
  const [newProjectName, setNewProjectName] = useState("");
  const [jiraKey, setJiraKey] = useState(activity?.jiraKey ?? "");
  const [duration, setDuration] = useState(activity?.defaultDurationMinutes ?? 15);
  const [jiraProject, setJiraProject] = useState(activity?.jiraProject ?? DEFAULT_JIRA_PROJECT);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return setError("Enter an activity name.");
    if (projectValue === "new" && !newProjectName.trim()) return setError("Enter a project name.");
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: cleanName,
        projectId: projectValue === "new" ? null : Number(projectValue),
        newProjectName: newProjectName.trim(),
        jiraKey: jiraKey.trim() || null,
        defaultDurationMinutes: duration,
        jiraProject: jiraProject.trim() || DEFAULT_JIRA_PROJECT,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="dialog activity-dialog" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">{activity ? "Edit" : "New"} activity</p>
            <h2>{activity ? activity.name : "Add an activity"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
        </label>

        <div className="form-row">
          <label>
            <span>Project</span>
            <select value={projectValue} onChange={(event) => setProjectValue(event.target.value)}>
              {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              <option value="new">＋ New project…</option>
            </select>
          </label>
          {projectValue === "new" ? (
            <label>
              <span>New project name</span>
              <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} required />
            </label>
          ) : (
            <label>
              <span>Default duration</span>
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                {[15, 30, 45, 60, 90, 120, 180, 240].map((minutes) => (
                  <option value={minutes} key={minutes}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="form-row">
          <label>
            <span>Jira issue key</span>
            <input value={jiraKey} onChange={(event) => setJiraKey(event.target.value)} placeholder="QDM-123" />
          </label>
          <label>
            <span>Jira project</span>
            <input value={jiraProject} onChange={(event) => setJiraProject(event.target.value)} />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
        <footer className="dialog-actions">
          {onDelete && <button className="danger-button" type="button" onClick={onDelete}>Delete</button>}
          <span />
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save activity"}</button>
        </footer>
      </form>
    </div>
  );
}
