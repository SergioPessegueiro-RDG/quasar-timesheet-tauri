import type { Activity, Project } from "../lib/types";

interface SidebarProps {
  projects: Project[];
  activities: Activity[];
  armedActivity: Activity | null;
  onArm: (activity: Activity | null) => void;
  onToggleProject: (project: Project) => void;
  onAddActivity: () => void;
  onEditActivity: (activity: Activity) => void;
  onEditProject: (project: Project) => void;
}

function durationLabel(minutes: number | null): string {
  if (!minutes) return "15m";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export function Sidebar({
  projects,
  activities,
  armedActivity,
  onArm,
  onToggleProject,
  onAddActivity,
  onEditActivity,
  onEditProject,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Activities">
      <div className="sidebar-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Activities</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Add activity" title="Add activity" onClick={onAddActivity}>+</button>
      </div>

      <div className="project-list">
        {projects.map((project) => {
          const children = activities.filter((activity) => activity.projectId === project.id);
          return (
            <section className="project-group" key={project.id}>
              <div className="project-heading-wrap">
              <button
                className="project-heading"
                type="button"
                aria-expanded={!project.collapsed}
                onClick={() => onToggleProject(project)}
              >
                <span className="project-chevron" aria-hidden="true">
                  {project.collapsed ? "›" : "⌄"}
                </span>
                <span className="color-dot" style={{ background: project.color }} />
                <span>{project.name}</span>
                <span className="project-count">{children.length}</span>
              </button>
              <button
                className="project-edit"
                type="button"
                aria-label={`Edit project ${project.name}`}
                title={`Edit ${project.name}`}
                onClick={() => onEditProject(project)}
              >•••</button>
              </div>

              {!project.collapsed && (
                <div className="activity-list">
                  {children.map((activity) => {
                    const armed = armedActivity?.id === activity.id;
                    return (
                      <div className="activity-row-wrap" key={activity.id}>
                      <button
                        className={`activity-row${armed ? " is-armed" : ""}`}
                        type="button"
                        draggable
                        aria-pressed={armed}
                        onClick={() => onArm(armed ? null : activity)}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData("application/x-quasar-activity-id", String(activity.id));
                          event.dataTransfer.setData("text/plain", activity.name);
                        }}
                      >
                        <span className="activity-accent" style={{ background: activity.color }} />
                        <span className="activity-copy">
                          <span className="activity-name">{activity.name}</span>
                          <span className="activity-meta">
                            {activity.jiraKey ?? "No Jira key"}
                          </span>
                        </span>
                        <span className="duration-pill">
                          {durationLabel(activity.defaultDurationMinutes)}
                        </span>
                      </button>
                      <button
                        className="activity-edit"
                        type="button"
                        aria-label={`Edit ${activity.name}`}
                        title={`Edit ${activity.name}`}
                        onClick={() => onEditActivity(activity)}
                      >•••</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className={`armed-status${armedActivity ? " is-active" : ""}`}>
        <span className="armed-icon">{armedActivity ? "＋" : "↖"}</span>
        <span>
          {armedActivity
            ? <>Placing <strong>{armedActivity.name}</strong></>
            : "Choose an activity, then click or drag the grid"}
        </span>
        {armedActivity && (
          <button type="button" onClick={() => onArm(null)} aria-label="Cancel placement">×</button>
        )}
      </div>
    </aside>
  );
}
