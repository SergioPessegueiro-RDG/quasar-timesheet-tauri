import { useEffect, useState } from "react";
import { roundTimerMinutes } from "../lib/timer";
import type { Activity } from "../lib/types";
import { ActivityPicker } from "./ActivityPicker";

interface TimerBarProps {
  activities: Activity[];
  onFinish: (activity: Activity, startedAt: Date, durationMinutes: number) => void;
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

export function TimerBar({ activities, onFinish }: TimerBarProps) {
  const [activityId, setActivityId] = useState<number | null>(null);
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

    const activity = activities.find(({ id }) => id === activityId);
    const duration = roundTimerMinutes((Date.now() - startedAt.getTime()) / 60_000);
    setStartedAt(null);
    if (!activity || !duration) return setStatus("Timer stopped — nothing logged.");
    onFinish(activity, startedAt, duration);
    setActivityId(null);
    setStatus(`Timer stopped at ${duration} min — add a description to save.`);
  }

  return (
    <section className={`timer-bar${startedAt ? " is-running" : ""}`} aria-label="Work timer">
      <div className="timer-title"><i /><strong>Timer</strong></div>
      <ActivityPicker
        activities={activities}
        value={activityId}
        onChange={(activity) => {
          setActivityId(activity?.id ?? null);
          if (activity) setStatus("");
        }}
        disabled={Boolean(startedAt)}
        ariaLabel="Timer activity"
        placeholder="Search QDM name or number…"
      />
      <button
        className={startedAt ? "timer-finish-button" : "primary-button"}
        type="button"
        onClick={toggle}
        aria-label={startedAt ? "Stop timer and add work details" : undefined}
        title={startedAt ? "Stop timer and add work details" : undefined}
      >
        {startedAt ? <span className="timer-stop-icon" aria-hidden="true" /> : "Start timer"}
      </button>
      <strong className="timer-elapsed">{startedAt ? elapsedLabel(now - startedAt.getTime()) : "00:00"}</strong>
      <span className="timer-status">{status || (startedAt ? "Tracking now" : "Rounds to the nearest 15 minutes")}</span>
    </section>
  );
}
