import assert from "node:assert/strict";
import test from "node:test";
import { roundTimerMinutes } from "./timer.ts";

test("timer durations round to quarter hours with a 15-minute floor", () => {
  assert.equal(roundTimerMinutes(0), 0);
  assert.equal(roundTimerMinutes(0.1), 15);
  assert.equal(roundTimerMinutes(7), 15);
  assert.equal(roundTimerMinutes(22), 15);
  assert.equal(roundTimerMinutes(23), 30);
  assert.equal(roundTimerMinutes(38), 45);
});
