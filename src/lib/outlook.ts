import ICAL from "ical.js";

export const MAX_ICS_BYTES = 5 * 1024 * 1024;
const MAX_OCCURRENCES = 5_000;
const OUTLOOK_FEED_HOSTS = new Set([
  "outlook.office365.com",
  "outlook.office.com",
  "outlook.live.com",
]);

export interface OutlookEvent {
  externalId: string;
  title: string;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
}

// Outlook publishes read-only ICS links for calendar subscriptions.
// Source: https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-on-the-web
export function outlookFeedUrl(value: string): string {
  const url = new URL(value.trim().replace(/^webcal:/i, "https:"));
  if (
    url.protocol !== "https:"
    || !OUTLOOK_FEED_HOSTS.has(url.hostname.toLowerCase())
    || !url.pathname.toLowerCase().endsWith(".ics")
    || url.username
    || url.password
  ) {
    throw new Error("Use an Outlook HTTPS .ics subscription link.");
  }
  return url.href;
}

export function parseOutlookFeedList(value: string): string[] {
  const links = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (!links.length) throw new Error("Add at least one Outlook calendar link.");
  if (links.length > 10) throw new Error("You can add up to 10 Outlook calendar links.");
  return [...new Set(links.map(outlookFeedUrl))];
}

export async function fetchOutlookFeed(url: string, fetcher?: typeof fetch): Promise<string> {
  const safeUrl = outlookFeedUrl(url);
  const native = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const request = fetcher ?? (native ? (await import("@tauri-apps/plugin-http")).fetch : fetch);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await request(safeUrl, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "text/calendar" },
    });
    if (!response.ok) throw new Error(`Outlook returned ${response.status}.`);
    const length = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > MAX_ICS_BYTES) throw new Error("Calendar feeds are limited to 5 MB.");
    const text = await response.text();
    if (new Blob([text]).size > MAX_ICS_BYTES) throw new Error("Calendar feeds are limited to 5 MB.");
    return text;
  } finally {
    clearTimeout(timeout);
  }
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
  if (new Blob([text]).size > MAX_ICS_BYTES) throw new Error("Calendar feeds are limited to 5 MB.");
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
    if (!event.uid?.trim()) throw new Error("Calendar contains an event without the required UID.");

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
