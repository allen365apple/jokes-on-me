import test from "node:test";
import assert from "node:assert/strict";
import { VOTE_COUNT_UP_DURATION_MS } from "../reveal.mjs";

test("the winner reveal follows a brief vote count-up", () => {
  assert.equal(VOTE_COUNT_UP_DURATION_MS, 1000);
});
