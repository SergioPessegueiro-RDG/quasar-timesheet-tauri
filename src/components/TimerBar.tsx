import { useEffect, useState } from "react";
import { roundTimerMinutes } from "../lib/timer";
import type { Activity } from "../lib/types";

interface TimerBarProps {
  activities: Activity[];
  onLog: (activity: Activity, startedAt: Date, durationMinutes: number) => Promise<void>;
}

function elapsedLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function TimerBar({ activities, onLog }: TimerBarProps) {
  const [activityId, setActivityId] = useState("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  async function toggle() {
    if (!startedAt) {
      if (!activityId) return setStatus("Choose an activity first.");
      setStatus("");
      setNow(Date.now());
      setStartedAt(new Date());
      return;
    }

    const activity = activities.find(({ id }) => String(id) === activityId);
    const duration = roundTimerMinutes((Date.now() - startedAt.getTime()) / 60_000);
    setStartedAt(null);
    if (!activity || !duration) return setStatus("Timer stopped — nothing logged.");
    try {
      await onLog(activity, startedAt, duration);
      setStatus(`Logged ${duration} min to ${activity.name}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not log timer.");
    }
  }

  return (
    <section className={`timer-bar${startedAt ? " is-running" : ""}`} aria-label="Work timer">
      <div className="timer-title"><i /><strong>Timer</strong></div>
      <select
        aria-label="Timer activity"
        value={activityId}
        onChange={(event) => setActivityId(event.target.value)}
        disabled={Boolean(startedAt)}
      >
        <option value="">Choose activity…</option>
        {activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.name}</option>)}
      </select>
      <button className={startedAt ? "danger-button" : "primary-button"} type="button" onClick={toggle}>
        {startedAt ? "Stop & log" : "Start timer"}
      </button>
      <strong className="timer-elapsed">{startedAt ? elapsedLabel(now - startedAt.getTime()) : "00:00"}</strong>
      <span className="timer-status">{status || (startedAt ? "Tracking now" : "Rounds to the nearest 15 minutes")}</span>
    </section>
  );
}
