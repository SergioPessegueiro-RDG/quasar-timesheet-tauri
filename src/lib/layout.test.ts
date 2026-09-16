import assert from "node:assert/strict";
import test from "node:test";
import { clampSidebarWidth } from "./layout.ts";

test("resizable activity panel remains useful without crowding the calendar", () => {
  assert.equal(clampSidebarWidth(100, 1024), 180);
  assert.equal(clampSidebarWidth(320, 1024), 320);
  assert.equal(clampSidebarWidth(900, 1024), 440);
  assert.equal(clampSidebarWidth(400, 700), 315);
});
