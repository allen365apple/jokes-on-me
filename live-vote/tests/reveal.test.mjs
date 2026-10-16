import test from "node:test";
import assert from "node:assert/strict";
import { VOTE_COUNT_UP_DURATION_MS } from "../reveal.mjs";

test("the winner reveal keeps the original vote count-up timing", () => {
  assert.equal(VOTE_COUNT_UP_DURATION_MS, 3400);
});
