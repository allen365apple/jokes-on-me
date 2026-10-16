import test from "node:test";
import assert from "node:assert/strict";
import { liveSync } from "../store.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function harness(read, audience = false) {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  let changed,
    status,
    filter,
    stopped = false;
  const chain = {
    on(event, options, callback) {
      filter = options;
      changed = callback;
      return this;
    },
    subscribe(callback) {
      status = callback;
      return this;
    },
  };
  const client = {
    channel: () => chain,
    removeChannel() {
      stopped = true;
    },
  };
  const snapshots = [],
    connections = [];
  const sync = liveSync(
    client,
    read,
    "test",
    (s) => snapshots.push(s),
    (s) => connections.push(s),
    audience,
  );
  return {
    sync,
    snapshots,
    connections,
    push: (s) => changed({ new: s }),
    status: (s) => status(s),
    filter: () => filter,
    stopped: () => stopped,
  };
}
test("late poll does not roll back a newer realtime snapshot", async () => {
  let resolveRead;
  const h = harness(
    () =>
      new Promise((r) => {
        resolveRead = r;
      }),
  );
  try {
    h.push({ id: "test", version: 5, counts: [5, 0] });
    resolveRead({ id: "test", version: 2, counts: [2, 0] });
    await tick();
    assert.equal(h.snapshots.length, 1);
    assert.equal(h.snapshots[0].version, 5);
  } finally {
    h.sync.stop();
  }
});
test("phone listens only to lifecycle signals and fetches full final result", async () => {
  let state = { id: "test", version: 1, status: "ready" };
  const h = harness(async () => state, true);
  try {
    await tick();
    assert.equal(h.filter().table, "jlv_signals");
    state = { id: "test", version: 151, status: "closed", counts: [80, 70] };
    h.push({ id: "test", version: 151, status: "closed" });
    await tick();
    assert.deepEqual(h.snapshots.at(-1).counts, [80, 70]);
  } finally {
    h.sync.stop();
  }
});
test("disconnect is reported honestly; reconnect rechecks authoritative data", async () => {
  let offline = true;
  const h = harness(async () => {
    if (offline) throw new Error("offline");
    return { id: "test", version: 1 };
  });
  try {
    await tick();
    assert.equal(h.connections.at(-1), "error");
    offline = false;
    h.status("SUBSCRIBED");
    await tick();
    assert.equal(h.connections.at(-1), "live");
    assert.equal(h.snapshots.length, 1);
  } finally {
    h.sync.stop();
    assert.equal(h.stopped(), true);
  }
});
test("signal arriving during an existing read queues an immediate second read", async () => {
  let resolveFirst,
    calls = 0;
  const h = harness(() => {
    calls++;
    return calls === 1
      ? new Promise((r) => {
          resolveFirst = r;
        })
      : Promise.resolve({ id: "test", version: 3, status: "closed" });
  }, true);
  try {
    h.push({ id: "test", version: 3, status: "closed" });
    resolveFirst({ id: "test", version: 2, status: "open" });
    await tick();
    assert.equal(calls, 2);
    assert.equal(h.snapshots.at(-1).status, "closed");
  } finally {
    h.sync.stop();
  }
});
