import ICAL from "ical.js";

export const MAX_ICS_BYTES = 5 * 1024 * 1024;
const MAX_OCCURRENCES = 5_000;

export interface OutlookEvent {
  externalId: string;
  title: string;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
}

function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Parses RFC 5545 VEVENT data, including Outlook recurrence rules and timezone
 * components. DTSTART is inclusive and DTEND is exclusive.
 * Source: https://datatracker.ietf.org/doc/html/rfc5545#section-3.6.1
 */
export function parseOutlookIcs(
  text: string,
  rangeStart: string,
  rangeEnd: string,
): { events: OutlookEvent[]; skippedAllDay: number } {
  if (new Blob([text]).size > MAX_ICS_BYTES) throw new Error("Calendar files are limited to 5 MB.");
  if (rangeStart > rangeEnd) throw new Error("The end date must be on or after the start date.");

  const calendar = new ICAL.Component(ICAL.parse(text));
  if (calendar.name !== "vcalendar") throw new Error("This is not an iCalendar file.");

  const first = new Date(`${rangeStart}T00:00:00`);
  const afterLast = new Date(`${rangeEnd}T00:00:00`);
  afterLast.setDate(afterLast.getDate() + 1);
  const events: OutlookEvent[] = [];
  let skippedAllDay = 0;
  let occurrenceCount = 0;

  for (const component of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) continue;

    const addOccurrence = (occurrence: ICAL.Time) => {
      if (++occurrenceCount > MAX_OCCURRENCES) {
        throw new Error("Calendar contains too many events; choose a shorter date range.");
      }
      const detail = event.getOccurrenceDetails(occurrence);
      if (detail.startDate.isDate || detail.endDate.isDate) {
        skippedAllDay++;
        return;
      }
      if (String(detail.item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") {
        return;
      }
      const start = detail.startDate.toJSDate();
      const end = detail.endDate.toJSDate();
      if (start < first || start >= afterLast || end <= start || localDate(start) !== localDate(end)) return;
      events.push({
        externalId: `${event.uid}:${detail.recurrenceId.toString()}`,
        title: detail.item.summary?.trim() || "Outlook event",
        notes: detail.item.description?.trim() || "",
        date: localDate(start),
        startTime: localTime(start),
        endTime: localTime(end),
      });
    };

    if (event.isRecurring()) {
      const iterator = event.iterator();
      for (let occurrence = iterator.next(); occurrence; occurrence = iterator.next()) {
        if (occurrence.toJSDate() >= afterLast) break;
        if (occurrence.toJSDate() >= first) addOccurrence(occurrence);
      }
    } else {
      const start = event.startDate.toJSDate();
      if (start >= first && start < afterLast) addOccurrence(event.startDate);
    }
  }

  return { events, skippedAllDay };
}
