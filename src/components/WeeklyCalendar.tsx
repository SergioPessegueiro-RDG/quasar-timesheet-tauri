import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_END_HOUR,
  DEFAULT_START_HOUR,
  DRAG_THRESHOLD_PX,
  MIN_BLOCK_MINUTES,
  RESIZE_GRIP_PX,
  SLOT_MINUTES,
  WEEKDAY_NAMES,
} from "../lib/constants";
import {
  addDays,
  isoDate,
  layoutOverlaps,
  snapMinute,
  textColor,
} from "../lib/calendar";
import type { Activity, TimeEntry } from "../lib/types";
import { durationMinutes, toMinutes, toTime } from "../lib/types";

interface WeeklyCalendarProps {
  weekStart: Date;
  entries: TimeEntry[];
  activities: Activity[];
  armedActivity: Activity | null;
  showDates?: boolean;
  showNow?: boolean;
  dayNames?: readonly string[];
  startHour?: number;
  endHour?: number;
  onCreate: (initial: {
    date: string;
    startTime: string;
    endTime: string;
    activityId?: number;
  }) => void;
  onEdit: (entry: TimeEntry) => void;
  onQuickCreate: (
    activity: Activity,
    date: string,
    startTime: string,
    endTime: string,
  ) => Promise<void>;
  onMove: (
    entry: TimeEntry,
    date: string,
    startTime: string,
    endTime: string,
  ) => Promise<void>;
  onDelete: (entry: TimeEntry) => Promise<void>;
}

type DragMode = "create" | "move" | "resize-top" | "resize-bottom";

interface DragState {
  mode: DragMode;
  pointerId: number;
  anchorX: number;
  anchorY: number;
  anchorDay: number;
  anchorMinute: number;
  endMinute: number;
  entry?: TimeEntry;
  previewDay: number;
  previewStart: number;
  previewEnd: number;
  moved: boolean;
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function hourLabel(hour: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(
    new Date(2000, 0, 1, hour),
  );
}

export function WeeklyCalendar({
  weekStart,
  entries,
  activities,
  armedActivity,
  showDates = true,
  showNow = true,
  dayNames = WEEKDAY_NAMES,
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
  onCreate,
  onEdit,
  onQuickCreate,
  onMove,
  onDelete,
}: WeeklyCalendarProps) {
  const lanesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activityDragOver, setActivityDragOver] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const totalMinutes = (endHour - startHour) * 60;
  const dayCount = dayNames.length;
  const relativeMinute = (time: string) => toMinutes(time) - startHour * 60;
  const fullTime = (relative: number) => toTime(startHour * 60 + relative);

  const dates = useMemo(
    () => dayNames.map((_, index) => addDays(weekStart, index)),
    [dayNames, weekStart],
  );
  const dateKeys = dates.map(isoDate);
  const entriesByDay = dateKeys.map((date) => entries.filter((entry) => entry.date === date));
  const layouts = entriesByDay.map(layoutOverlaps);

  useEffect(() => {
    if (!showNow) return;
    setClock(new Date());
    const timer = window.setInterval(() => setClock(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, [showNow]);

  function setDragState(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function point(event: { clientX: number; clientY: number }): { day: number; minute: number } {
    const rect = lanesRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - 1, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    return {
      day: Math.max(0, Math.min(dayCount - 1, Math.floor((x / rect.width) * dayCount))),
      minute: snapMinute((y / rect.height) * totalMinutes, totalMinutes),
    };
  }

  async function dropActivity(event: ReactDragEvent<HTMLDivElement>) {
    setActivityDragOver(false);
    const activityId = Number(event.dataTransfer.getData("application/x-quasar-activity-id"));
    const activity = activities.find(({ id }) => id === activityId);
    if (!activity) return;
    event.preventDefault();
    const pointInGrid = point(event);
    const start = Math.min(pointInGrid.minute, totalMinutes - SLOT_MINUTES);
    const end = Math.min(totalMinutes, start + (activity.defaultDurationMinutes ?? SLOT_MINUTES));
    await onQuickCreate(
      activity,
      dateKeys[pointInGrid.day],
      fullTime(start),
      fullTime(end),
    );
  }

  function beginGridDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const { day, minute } = point(event);
    lanesRef.current?.setPointerCapture(event.pointerId);
    lanesRef.current?.focus();
    setSelectedId(null);
    setDragState({
      mode: "create",
      pointerId: event.pointerId,
      anchorX: event.clientX,
      anchorY: event.clientY,
      anchorDay: day,
      anchorMinute: minute,
      endMinute: minute,
      previewDay: day,
      previewStart: minute,
      previewEnd: Math.min(totalMinutes, minute + SLOT_MINUTES),
      moved: false,
    });
  }

  function beginBlockDrag(event: ReactPointerEvent<HTMLButtonElement>, entry: TimeEntry) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const localY = event.clientY - bounds.top;
    const mode: DragMode = localY <= RESIZE_GRIP_PX
      ? "resize-top"
      : bounds.height - localY <= RESIZE_GRIP_PX
        ? "resize-bottom"
        : "move";
    const day = dateKeys.indexOf(entry.date);
    const start = relativeMinute(entry.startTime);
    const end = relativeMinute(entry.endTime);
    lanesRef.current?.setPointerCapture(event.pointerId);
    lanesRef.current?.focus();
    setDragState({
      mode,
      pointerId: event.pointerId,
      anchorX: event.clientX,
      anchorY: event.clientY,
      anchorDay: day,
      anchorMinute: start,
      endMinute: end,
      entry,
      previewDay: day,
      previewStart: start,
      previewEnd: end,
      moved: false,
    });
  }

  function updateDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const currentDrag = dragRef.current;
    if (!currentDrag || event.pointerId !== currentDrag.pointerId) return;
    const distance = Math.max(
      Math.abs(event.clientX - currentDrag.anchorX),
      Math.abs(event.clientY - currentDrag.anchorY),
    );
    const moved = currentDrag.moved || distance > DRAG_THRESHOLD_PX;
    if (!moved) return;

    const current = point(event);
    let previewDay = currentDrag.anchorDay;
    let previewStart = currentDrag.anchorMinute;
    let previewEnd = currentDrag.endMinute;

    if (currentDrag.mode === "create") {
      previewStart = Math.min(currentDrag.anchorMinute, current.minute);
      previewEnd = Math.max(currentDrag.anchorMinute, current.minute);
      if (previewStart === previewEnd) {
        previewEnd = Math.min(totalMinutes, previewStart + SLOT_MINUTES);
      }
    } else if (currentDrag.mode === "resize-top") {
      previewStart = Math.min(current.minute, currentDrag.endMinute - MIN_BLOCK_MINUTES);
    } else if (currentDrag.mode === "resize-bottom") {
      previewEnd = Math.max(current.minute, currentDrag.anchorMinute + MIN_BLOCK_MINUTES);
    } else {
      const rect = lanesRef.current!.getBoundingClientRect();
      const delta = snapMinute(
        ((event.clientY - currentDrag.anchorY) / rect.height) * totalMinutes,
        Number.POSITIVE_INFINITY,
      );
      const signedDelta = event.clientY < currentDrag.anchorY ? -delta : delta;
      const duration = currentDrag.endMinute - currentDrag.anchorMinute;
      previewStart = Math.max(0, Math.min(totalMinutes - duration, currentDrag.anchorMinute + signedDelta));
      previewEnd = previewStart + duration;
      previewDay = current.day;
    }

    setDragState({ ...currentDrag, moved, previewDay, previewStart, previewEnd });
  }

  async function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const finished = dragRef.current;
    if (!finished || event.pointerId !== finished.pointerId) return;
    lanesRef.current?.releasePointerCapture(event.pointerId);
    setDragState(null);

    if (finished.mode === "create" && finished.moved) {
      onCreate({
        date: dateKeys[finished.anchorDay],
        startTime: fullTime(finished.previewStart),
        endTime: fullTime(finished.previewEnd),
        activityId: armedActivity?.id,
      });
      return;
    }
    if (finished.mode === "create") {
      if (!armedActivity) {
        onCreate({
          date: dateKeys[finished.anchorDay],
          startTime: fullTime(finished.anchorMinute),
          endTime: fullTime(Math.min(totalMinutes, finished.anchorMinute + SLOT_MINUTES)),
        });
        return;
      }
      const start = finished.moved ? finished.previewStart : finished.anchorMinute;
      const defaultDuration = armedActivity.defaultDurationMinutes ?? SLOT_MINUTES;
      const end = finished.moved
        ? finished.previewEnd
        : Math.min(totalMinutes, start + defaultDuration);
      if (end <= start) return;
      await onQuickCreate(
        armedActivity,
        dateKeys[finished.anchorDay],
        fullTime(start),
        fullTime(end),
      );
    } else if (!finished.moved) {
      setSelectedId(finished.entry?.id ?? null);
      return;
    } else if (finished.entry) {
      await onMove(
        finished.entry,
        dateKeys[finished.previewDay],
        fullTime(finished.previewStart),
        fullTime(finished.previewEnd),
      );
      setSelectedId(finished.entry.id);
    }
  }

  async function nudgeSelected(dayDelta: number, minuteDelta: number) {
    const entry = entries.find(({ id }) => id === selectedId);
    if (!entry) return;
    const day = dateKeys.indexOf(entry.date);
    const start = relativeMinute(entry.startTime);
    const duration = durationMinutes(entry);
    const nextDay = Math.max(0, Math.min(dayCount - 1, day + dayDelta));
    const nextStart = Math.max(0, Math.min(totalMinutes - duration, start + minuteDelta));
    if (nextDay === day && nextStart === start) return;
    await onMove(
      entry,
      dateKeys[nextDay],
      fullTime(nextStart),
      fullTime(nextStart + duration),
    );
  }

  async function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setDragState(null);
      setSelectedId(null);
      return;
    }
    if (!selectedId) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const selected = entries.find(({ id }) => id === selectedId);
      if (!selected || !window.confirm(
        `Delete “${selected.activityName}” on ${selected.date} at ${selected.startTime}?`,
      )) return;
      await onDelete(selected);
      setSelectedId(null);
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -SLOT_MINUTES],
      ArrowDown: [0, SLOT_MINUTES],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      await nudgeSelected(...move);
    }
  }

  const preview = drag?.moved ? drag : null;
  const today = isoDate(clock);
  const nowMinute = clock.getHours() * 60 + clock.getMinutes() + clock.getSeconds() / 60 - startHour * 60;
  const nowPosition = Math.max(0, Math.min(totalMinutes, nowMinute));
  const nowRange = nowMinute < 0 ? "before" : nowMinute > totalMinutes ? "after" : "within";
  const nowLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(clock);
  const calendarStyle = {
    "--day-count": dayCount,
    "--calendar-min-width": `${64 + dayCount * 140}px`,
    "--calendar-min-height": `${(totalMinutes / SLOT_MINUTES) * 22}px`,
    "--slot-percent": `${(SLOT_MINUTES / totalMinutes) * 100}%`,
    "--hour-percent": `${(60 / totalMinutes) * 100}%`,
  } as CSSProperties;

  return (
    <section className="calendar-card" aria-label="Weekly timesheet" style={calendarStyle}>
      <div className="calendar-scroll">
      <div className="calendar-header">
        <div className="time-gutter header-gutter" />
        {dates.map((date, index) => (
          <div className={`day-heading${isoDate(date) === today ? " is-today" : ""}`} key={dateKeys[index]}>
            <span>{dayNames[index]}</span>
            {showDates && <strong>{dateLabel(date)}</strong>}
            {showNow && isoDate(date) === today && nowRange !== "within" && (
              <small className="now-outside-hours">{nowLabel} · {nowRange} visible hours</small>
            )}
          </div>
        ))}
      </div>

        <div className="calendar-grid">
          <div className="time-gutter time-labels" aria-hidden="true">
            {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
              <span
                key={index}
                style={{ top: `${(index / (endHour - startHour)) * 100}%` }}
              >
                {hourLabel(startHour + index)}
              </span>
            ))}
          </div>

          <div
            className={`day-lanes${activityDragOver ? " is-drop-target" : ""}`}
            ref={lanesRef}
            role="grid"
            aria-label={`${dayNames[0]} to ${dayNames[dayNames.length - 1]} time grid`}
            tabIndex={0}
            onPointerDown={beginGridDrag}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={() => setDragState(null)}
            onKeyDown={handleKeyDown}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("application/x-quasar-activity-id")) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setActivityDragOver(true);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setActivityDragOver(false);
              }
            }}
            onDrop={dropActivity}
          >
            {dates.map((_, dayIndex) => {
              const dayEntries = entriesByDay[dayIndex];
              return (
                <div className={`day-lane${dateKeys[dayIndex] === today ? " is-today" : ""}`} key={dateKeys[dayIndex]}>
                  {showNow && dateKeys[dayIndex] === today && nowRange === "within" && (
                      <div
                        className="now-line"
                        style={{ top: `${(nowPosition / totalMinutes) * 100}%` }}
                      >
                        <span>{nowLabel}</span>
                      </div>
                    )}
                  {dayEntries.map((entry) => {
                    const layout = layouts[dayIndex].get(entry.id) ?? { column: 0, columns: 1 };
                    const gap = 3;
                    const width = 100 / layout.columns;
                    const style = {
                      "--block-color": entry.color,
                      "--block-text": textColor(entry.color),
                      top: `${(relativeMinute(entry.startTime) / totalMinutes) * 100}%`,
                      height: `${(durationMinutes(entry) / totalMinutes) * 100}%`,
                      left: `calc(${layout.column * width}% + ${layout.column ? gap / 2 : 3}px)`,
                      width: `calc(${width}% - ${layout.columns > 1 ? gap : 6}px)`,
                    } as CSSProperties;
                    return (
                      <button
                        type="button"
                        className={`time-block${selectedId === entry.id ? " is-selected" : ""}`}
                        style={style}
                        key={entry.id}
                        onPointerDown={(event) => beginBlockDrag(event, entry)}
                        onDoubleClick={() => onEdit(entry)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          onEdit(entry);
                        }}
                        title={`${entry.activityName}\n${entry.startTime}–${entry.endTime}${entry.notes ? `\n${entry.notes}` : ""}`}
                      >
                        <strong>{entry.activityName}{entry.jiraKey ? ` · ${entry.jiraKey}` : ""}</strong>
                        {entry.notes && <span>{entry.notes}</span>}
                        <small>{entry.startTime}–{entry.endTime}</small>
                      </button>
                    );
                  })}

                  {preview?.previewDay === dayIndex && (
                    <div
                      className={`drag-preview ${preview.mode}`}
                      style={{
                        top: `${(preview.previewStart / totalMinutes) * 100}%`,
                        height: `${((preview.previewEnd - preview.previewStart) / totalMinutes) * 100}%`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

      <div className="calendar-totals">
        <div className="time-gutter">Total</div>
        {entriesByDay.map((dayEntries, index) => (
          <div key={dateKeys[index]}>
            {(dayEntries.reduce((sum, entry) => sum + durationMinutes(entry), 0) / 60).toFixed(1)}h
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}
