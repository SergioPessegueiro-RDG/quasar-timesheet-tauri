import type { Activity, Project } from "./types";

export interface ActivityGroup {
  project: Project;
  activities: Activity[];
}

export function isClosedQdm(activity: Activity): boolean {
  return activity.jiraStatus?.trim().toLowerCase() === "closed";
}

export function organizeActivities(projects: Project[], activities: Activity[]) {
  const activeGroups: ActivityGroup[] = [];
  const archivedGroups: ActivityGroup[] = [];
  const archivedActivities: Activity[] = [];

  for (const project of projects) {
    const children = activities.filter((activity) => activity.projectId === project.id);
    const closed = children.filter(isClosedQdm);
    if (project.jiraKey && children.length > 0 && closed.length === children.length) {
      archivedGroups.push({ project, activities: children });
    } else {
      const open = children.filter((activity) => !isClosedQdm(activity));
      if (open.length || children.length === 0) activeGroups.push({ project, activities: open });
      archivedActivities.push(...closed);
    }
  }

  return { activeGroups, archivedGroups, archivedActivities };
}
