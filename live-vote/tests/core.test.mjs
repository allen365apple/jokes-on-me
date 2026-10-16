import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEAMS,
  member,
  validateTeams,
  newSession,
  reduceDemo,
  outcome,
  chartScale,
  acceptsSnapshot,
  canHandleKey,
  safeAvatar,
  inkFor,
  stagePosition,
  canPositionStage,
  victorySoundPreferences,
} from "../core.mjs";

const fresh = () => ({ session: newSession("test-session"), votes: {} });
test("new victory sound defaults on, migrates old mute once, and keeps subsequent mute", () => {
  assert.equal(victorySoundPreferences().sound, true);
  assert.deepEqual(victorySoundPreferences({ sound: false }), {
    sound: true,
    soundVersion: 2,
  });
  assert.equal(
    victorySoundPreferences({ sound: false, soundVersion: 2 }).sound,
    false,
  );
});
const open = () => reduceDemo(fresh(), { type: "open" });
test("projection moves in both directions, clamps and returns home", () => {
  assert.equal(stagePosition(0, "ArrowUp"), -2);
  assert.equal(stagePosition(0, "ArrowDown"), 2);
  assert.equal(stagePosition(-80, "ArrowUp"), -80);
  assert.equal(stagePosition(80, "ArrowDown"), 80);
  assert.equal(stagePosition(-46, "Home"), 0);
  assert.equal(stagePosition(12, "Enter"), 12);
});
test("position keys repeat and work on controls but never intercept typing or dialogs", () => {
  const event = {
    key: "ArrowDown",
    repeat: true,
    target: { tagName: "BUTTON" },
  };
  assert.equal(canPositionStage(event, false), true);
  assert.equal(canPositionStage(event, true), false);
  for (const target of [
    { tagName: "INPUT" },
    { tagName: "TEXTAREA" },
    { tagName: "SELECT" },
    { isContentEditable: true },
  ]) {
    assert.equal(canPositionStage({ ...event, target }, false), false);
  }
  assert.equal(canPositionStage({ ...event, ctrlKey: true }, false), false);
  assert.equal(canPositionStage({ ...event, key: "Enter" }, false), false);
});
test("initial roster is correct and settings snapshots are independent", () => {
  const s = newSession("one");
  assert.equal(
    s.teams[0].members.map((m) => m.name).join("、"),
    "傑哥、芭樂、竹節蟲、兔子",
  );
  assert.equal(
    s.teams[1].members.map((m) => m.name).join("、"),
    "柏文、大弋、巧達、又又",
  );
  s.teams[0].name = "changed";
  assert.equal(DEFAULT_TEAMS[0].name, "藍隊");
});
test("one identity one ballot; switching replaces the previous choice", () => {
  const first = reduceDemo(open(), {
    type: "vote",
    user: "same",
    team: "blue",
  });
  const next = reduceDemo(first, {
    type: "vote",
    user: "same",
    team: "orange",
  });
  assert.deepEqual(next.session.counts, [0, 1]);
  assert.equal(next.votes.same, "orange");
  assert.equal(first.session.version + 1, next.session.version);
});
test("150 voters with retries produce exactly 150 votes", () => {
  let record = open();
  for (let i = 0; i < 150; i++)
    for (let retry = 0; retry < 3; retry++)
      record = reduceDemo(record, {
        type: "vote",
        user: "voter-" + i,
        team: i < 83 ? "blue" : "orange",
      });
  assert.deepEqual(record.session.counts, [83, 67]);
  assert.equal(Object.keys(record.votes).length, 150);
});
test("opening is immediate and repeated open cannot close; closed never reopens", () => {
  let record = open();
  assert.equal(record.session.status, "open");
  record = reduceDemo(record, { type: "open" });
  assert.equal(record.session.status, "open");
  record = reduceDemo(record, { type: "close" });
  assert.equal(record.session.status, "closed");
  assert.throws(() => reduceDemo(record, { type: "open" }));
});
test("before/after window reject new votes; receipts still recover after cutoff", () => {
  assert.throws(() =>
    reduceDemo(fresh(), { type: "vote", user: "a", team: "blue" }),
  );
  const closed = reduceDemo(
    reduceDemo(open(), { type: "vote", user: "a", team: "blue" }),
    { type: "close" },
  );
  assert.throws(() =>
    reduceDemo(closed, { type: "vote", user: "b", team: "orange" }),
  );
  assert.throws(() =>
    reduceDemo(closed, { type: "vote", user: "a", team: "orange" }),
  );
  assert.deepEqual(
    reduceDemo(closed, { type: "vote", user: "a", team: "blue" }).session
      .counts,
    [1, 0],
  );
});
test("configuration locks after opening; new shows have no inherited votes", () => {
  assert.throws(() => reduceDemo(open(), { type: "settings", settings: {} }));
  const s = newSession("new", { teams: DEFAULT_TEAMS });
  assert.deepEqual(s.counts, [0, 0]);
});
test("tie, empty and winners are distinct", () => {
  assert.equal(outcome([0, 0]), "empty");
  assert.equal(outcome([4, 4]), "tie");
  assert.equal(outcome([8, 3]), 0);
  assert.equal(outcome([2, 3]), 1);
});
test("shared absolute chart scale expands beyond attendance, no cap", () => {
  assert.equal(chartScale([100, 40], 150), 150);
  assert.equal(chartScale([151, 5], 150), 200);
  assert.equal(chartScale([0, 0], 0), 1);
});
test("stale replies / other sessions cannot roll back state", () => {
  assert.equal(
    acceptsSnapshot({ id: "a", version: 4 }, { id: "a", version: 3 }),
    false,
  );
  assert.equal(
    acceptsSnapshot({ id: "a", version: 4 }, { id: "b", version: 5 }),
    false,
  );
  assert.equal(
    acceptsSnapshot({ id: "a", version: 4 }, { id: "a", version: 5 }),
    true,
  );
});
test("long press, typing, IME, modal, modifier shortcuts are ignored", () => {
  const e = { target: { tagName: "BODY" } };
  assert.equal(canHandleKey(e, false, false), true);
  for (const patch of [
    { repeat: true },
    { isComposing: true },
    { ctrlKey: true },
    { target: { tagName: "INPUT" } },
    { target: { tagName: "BUTTON" } },
    { target: { isContentEditable: true } },
  ])
    assert.equal(canHandleKey({ ...e, ...patch }, false, false), false);
  assert.equal(canHandleKey(e, true, false), false);
  assert.equal(canHandleKey(e, false, true), false);
});
test("invalid teams and avatar schemes are rejected; no name interpolation into CSS", () => {
  assert.throws(() => validateTeams([]));
  assert.throws(() =>
    validateTeams([{ ...DEFAULT_TEAMS[0], color: "red;" }, DEFAULT_TEAMS[1]]),
  );
  assert.throws(() => safeAvatar("javascript:alert(1)"));
  assert.throws(() => safeAvatar("data:image/svg+xml,test"));
  assert.equal(member("自訂演員").avatar, "");
  assert.equal(validateTeams(DEFAULT_TEAMS).length, 2);
});
test("foreground adapts to custom team colors", () => {
  assert.equal(inkFor("#ffffff"), "#111111");
  assert.equal(inkFor("#000000"), "#ffffff");
});
