import assert from "node:assert/strict";
import test from "node:test";
import { serializeExecute, type ExecuteResult } from "./db/driver.ts";

const result: ExecuteResult = { lastInsertId: 0, rowsAffected: 1 };

test("database writes run one at a time and preserve call order", async () => {
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const execute = serializeExecute(async (sql) => {
    events.push(`start:${sql}`);
    if (sql === "first") await firstCanFinish;
    events.push(`finish:${sql}`);
    return result;
  });

  const first = execute("first");
  const second = execute("second");
  await Promise.resolve();
  assert.deepEqual(events, ["start:first"]);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["start:first", "finish:first", "start:second", "finish:second"]);
});

test("a failed database write does not block later writes", async () => {
  const execute = serializeExecute(async (sql) => {
    if (sql === "fail") throw new Error("write failed");
    return result;
  });

  await assert.rejects(execute("fail"), /write failed/);
  assert.deepEqual(await execute("recover"), result);
});
