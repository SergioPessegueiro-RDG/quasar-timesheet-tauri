import assert from "node:assert/strict";
import test from "node:test";
import { requiredWorkDescription } from "./types.ts";

test("calendar entries require a trimmed work description", () => {
  assert.equal(requiredWorkDescription("  Reviewed delivery plan  "), "Reviewed delivery plan");
  assert.throws(() => requiredWorkDescription(" \n "), /description is required/i);
});
