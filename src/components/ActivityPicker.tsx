import { useEffect, useId, useMemo, useRef, useState } from "react";
import { activityMatchesQuery, type Activity } from "../lib/types";

interface ActivityPickerProps {
  activities: Activity[];
  value: number | null;
  onChange: (activity: Activity | null) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel: string;
}

function optionLabel(activity: Activity): string {
  return activity.jiraKey ? `${activity.jiraKey} · ${activity.name}` : activity.name;
}

export function ActivityPicker({
  activities,
  value,
  onChange,
  placeholder = "Choose activity…",
  disabled = false,
  autoFocus = false,
  ariaLabel,
}: ActivityPickerProps) {
  const listId = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const selected = activities.find((activity) => activity.id === value) ?? null;
  const [query, setQuery] = useState(selected ? optionLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(
    () => activities.filter((activity) => activityMatchesQuery(activity, query)),
    [activities, query],
  );

  useEffect(() => {
    if (!open) setQuery(selected ? optionLabel(selected) : "");
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function choose(activity: Activity) {
    onChange(activity);
    setQuery(optionLabel(activity));
    setOpen(false);
  }

  return (
    <div
      ref={pickerRef}
      className={`activity-picker${open ? " is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(null);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && open && filtered[activeIndex]) {
            event.preventDefault();
            choose(filtered[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <button
        className="activity-picker-toggle"
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close activity list" : "Open activity list"}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div className="activity-picker-options" id={listId} role="listbox">
          {filtered.length ? filtered.map((activity, index) => (
            <button
              className={index === activeIndex ? "is-active" : ""}
              type="button"
              role="option"
              aria-selected={activity.id === value}
              key={activity.id}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(activity)}
            >
              <strong>{activity.name}</strong>
              <small>{activity.jiraKey ?? "No Jira key"}</small>
            </button>
          )) : <p>No matching QDMs</p>}
        </div>
      )}
    </div>
  );
}
