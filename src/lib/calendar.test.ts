import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarFocusStart,
  isoDate,
  layoutOverlaps,
  shiftBlock,
  snapMinute,
  startOfWeek,
} from "./calendar.ts";

test("calendar date and snapping rules", () => {
  assert.equal(isoDate(startOfWeek(new Date(2026, 8, 16))), "2026-09-14");
  assert.equal(snapMinute(7), 0);
  assert.equal(snapMinute(8), 15);
  assert.equal(snapMinute(999), 480);
  assert.equal(snapMinute(-8, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY), -15);
});

test("moving a block can go earlier in the day, not only later", () => {
  assert.deepEqual(shiftBlock(12 * 60, 13 * 60, -60, 24 * 60), { start: 11 * 60, end: 12 * 60 });
  assert.deepEqual(shiftBlock(12 * 60, 13 * 60, 60, 24 * 60), { start: 13 * 60, end: 14 * 60 });
  assert.deepEqual(shiftBlock(15, 75, -60, 24 * 60), { start: 0, end: 60 });
});

test("overlap layout uses transitive clusters and releases columns", () => {
  const layout = layoutOverlaps([
    { id: 1, startTime: "09:00", endTime: "10:00" },
    { id: 2, startTime: "09:30", endTime: "10:30" },
    { id: 3, startTime: "10:00", endTime: "11:00" },
    { id: 4, startTime: "12:00", endTime: "13:00" },
  ]);

  assert.deepEqual(layout.get(1), { column: 0, columns: 2 });
  assert.deepEqual(layout.get(2), { column: 1, columns: 2 });
  assert.deepEqual(layout.get(3), { column: 0, columns: 2 });
  assert.deepEqual(layout.get(4), { column: 0, columns: 1 });
});

test("calendar focus centers on now without wasting space before 7 AM", () => {
  assert.equal(calendarFocusStart(7 * 60 + 30), 7 * 60);
  assert.equal(calendarFocusStart(12 * 60), 8 * 60);
  assert.equal(calendarFocusStart(18 * 60), 14 * 60);
  assert.equal(calendarFocusStart(22 * 60), 16 * 60);
});
