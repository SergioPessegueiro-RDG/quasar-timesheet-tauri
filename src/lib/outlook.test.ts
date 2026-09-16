import assert from "node:assert/strict";
import test from "node:test";
import { fetchOutlookFeed, outlookFeedUrl, parseOutlookIcs } from "./outlook.ts";

const calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook//
BEGIN:VEVENT
UID:daily-standup
DTSTAMP:20260901T080000Z
DTSTART:20260914T100000
DTEND:20260914T103000
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Daily stand-up
DESCRIPTION:Team sync
END:VEVENT
BEGIN:VEVENT
UID:all-day
DTSTAMP:20260901T080000Z
DTSTART;VALUE=DATE:20260915
DTEND;VALUE=DATE:20260916
SUMMARY:Away
END:VEVENT
END:VCALENDAR`;

test("Outlook import expands recurrences and skips all-day events", () => {
  const result = parseOutlookIcs(calendar, "2026-09-15", "2026-09-16");
  assert.deepEqual(
    result.events.map(({ externalId, date, startTime, endTime }) => ({
      externalId,
      date,
      startTime,
      endTime,
    })),
    [
      {
        externalId: "daily-standup:2026-09-15T10:00:00",
        date: "2026-09-15",
        startTime: "10:00",
        endTime: "10:30",
      },
      {
        externalId: "daily-standup:2026-09-16T10:00:00",
        date: "2026-09-16",
        startTime: "10:00",
        endTime: "10:30",
      },
    ],
  );
  assert.equal(result.skippedAllDay, 1);
});

test("Outlook feed links accept Microsoft HTTPS and reject other hosts", () => {
  assert.equal(
    outlookFeedUrl("webcal://outlook.office365.com/owa/calendar/id/calendar.ics"),
    "https://outlook.office365.com/owa/calendar/id/calendar.ics",
  );
  assert.throws(() => outlookFeedUrl("https://example.com/private.ics"), /Outlook HTTPS/);
});

test("Outlook feed fetch requests calendar content without exposing another origin", async () => {
  let requested = "";
  const text = await fetchOutlookFeed(
    "https://outlook.live.com/owa/calendar/id/calendar.ics",
    async (url) => {
      requested = String(url);
      return new Response(calendar, { headers: { "Content-Type": "text/calendar" } });
    },
  );
  assert.equal(requested, "https://outlook.live.com/owa/calendar/id/calendar.ics");
  assert.equal(text, calendar);
});
