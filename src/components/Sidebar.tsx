import { useState } from "react";
import { organizeActivities } from "../lib/sidebar";
import { activityMatchesQuery, type Activity, type Project } from "../lib/types";

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

interface ActivityRowsProps {
  activities: Activity[];
  archived?: boolean;
  armedActivity: Activity | null;
  onArm: (activity: Activity | null) => void;
  onEditActivity: (activity: Activity) => void;
}

function ActivityRows({
  activities,
  archived = false,
  armedActivity,
  onArm,
  onEditActivity,
}: ActivityRowsProps) {
  return (
    <div className="activity-list">
      {activities.map((activity) => {
        const armed = armedActivity?.id === activity.id;
        return (
          <div className="activity-row-wrap" key={activity.id}>
            <button
              className={`activity-row${armed ? " is-armed" : ""}${archived ? " is-archived" : ""}`}
              type="button"
              draggable
              aria-pressed={armed}
              title={`${activity.name}${activity.jiraKey ? ` · ${activity.jiraKey}` : ""}`}
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
                  {archived && "Closed · "}{activity.jiraKey ?? "No Jira key"}
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
  );
}

interface ProjectSectionProps extends ActivityRowsProps {
  project: Project;
  searching: boolean;
  onToggleProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
}

function ProjectSection({
  project,
  activities,
  archived = false,
  searching,
  armedActivity,
  onArm,
  onEditActivity,
  onToggleProject,
  onEditProject,
}: ProjectSectionProps) {
  return (
    <section className={archived ? "archived-project-group" : "project-group"}>
      <div className="project-heading-wrap">
        <button
          className="project-heading"
          type="button"
          aria-expanded={!project.collapsed}
          title={project.name}
          onClick={() => onToggleProject(project)}
        >
          <span className={`project-chevron${project.collapsed ? " is-collapsed" : ""}`} aria-hidden="true" />
          <span className="color-dot" style={{ background: project.color }} />
          <span className="project-name">{project.name}</span>
          <span className="project-count">{activities.length}</span>
        </button>
        <button
          className="project-edit"
          type="button"
          aria-label={`Edit project ${project.name}`}
          title={`Edit ${project.name}`}
          onClick={() => onEditProject(project)}
        >•••</button>
      </div>
      {(!project.collapsed || searching) && (
        <ActivityRows
          activities={activities}
          archived={archived}
          armedActivity={armedActivity}
          onArm={onArm}
          onEditActivity={onEditActivity}
        />
      )}
    </section>
  );
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
  const [query, setQuery] = useState("");
  const [archiveCollapsed, setArchiveCollapsed] = useState(true);
  const matchingActivities = activities.filter((activity) => activityMatchesQuery(activity, query));
  const matchingIds = new Set(matchingActivities.map(({ id }) => id));
  const { activeGroups, archivedGroups, archivedActivities } = organizeActivities(projects, activities);
  const archivedCount = archivedGroups.reduce((count, group) => count + group.activities.length, 0)
    + archivedActivities.length;
  const filterMatches = (items: Activity[]) => items.filter(({ id }) => matchingIds.has(id));
  const matchingArchivedCount = filterMatches(archivedActivities).length
    + archivedGroups.reduce((count, group) => count + filterMatches(group.activities).length, 0);

  return (
    <aside className="sidebar" aria-label="Activities">
      <div className="sidebar-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Activities</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Add activity" title="Add activity" onClick={onAddActivity}>+</button>
      </div>

      <label className="activity-search">
        <span className="visually-hidden">Filter activities by QDM name or number</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search QDM name or number…"
        />
      </label>

      <div className="project-list">
        {activeGroups.map(({ project, activities: projectActivities }) => {
          const children = filterMatches(projectActivities);
          if (!children.length && query.trim()) return null;
          return (
            <ProjectSection
              key={project.id}
              project={project}
              activities={children}
              searching={Boolean(query.trim())}
              armedActivity={armedActivity}
              onArm={onArm}
              onEditActivity={onEditActivity}
              onToggleProject={onToggleProject}
              onEditProject={onEditProject}
            />
          );
        })}

        {archivedCount > 0 && (!query.trim() || matchingArchivedCount > 0) && (
          <section className="project-group archived-folder">
            <button
              className="project-heading"
              type="button"
              aria-expanded={!archiveCollapsed}
              onClick={() => setArchiveCollapsed((collapsed) => !collapsed)}
            >
              <span className={`project-chevron${archiveCollapsed ? " is-collapsed" : ""}`} aria-hidden="true" />
              <span className="archive-icon" aria-hidden="true" />
              <span className="project-name">Archived</span>
              <span className="project-count">{query.trim() ? matchingArchivedCount : archivedCount}</span>
            </button>

            {(!archiveCollapsed || Boolean(query.trim())) && (
              <div className="archived-groups">
                <ActivityRows
                  activities={filterMatches(archivedActivities)}
                  archived
                  armedActivity={armedActivity}
                  onArm={onArm}
                  onEditActivity={onEditActivity}
                />
                {archivedGroups.map(({ project, activities: groupActivities }) => {
                  const children = filterMatches(groupActivities);
                  if (!children.length && query.trim()) return null;
                  return (
                    <ProjectSection
                      key={project.id}
                      project={project}
                      activities={children}
                      archived
                      searching={Boolean(query.trim())}
                      armedActivity={armedActivity}
                      onArm={onArm}
                      onEditActivity={onEditActivity}
                      onToggleProject={onToggleProject}
                      onEditProject={onEditProject}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}
        {query.trim() && !matchingActivities.length && (
          <p className="activity-search-empty">No matching QDMs</p>
        )}
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
