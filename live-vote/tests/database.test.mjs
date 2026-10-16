import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_TEAMS } from "../core.mjs";

let db;
const admin = "10000000-0000-4000-8000-000000000001";
const audience = (n) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const settings = {
  title: "LOCAL TEST ONLY",
  teams: DEFAULT_TEAMS,
  expected: 150,
};
const sqlFile = new URL("../supabase-setup.sql", import.meta.url);
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $body$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $body$; grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  const sql = await readFile(sqlFile, "utf8");
  await db.exec(sql);
  await db.exec(sql);
  await db.query("insert into auth.users(id) values ($1)", [admin]);
  await db.query("insert into public.jlv_admins(user_id) values ($1)", [admin]);
  for (let i = 0; i < 155; i++)
    await db.query("insert into auth.users(id) values ($1)", [audience(i)]);
});
after(async () => {
  await db.close();
});
async function as(user, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user || "",
  ]);
  await db.exec(`set role ${role}`);
}
async function rpc(name, args = [], types = []) {
  const params = args
    .map((_, i) => `$${i + 1}${types[i] ? "::" + types[i] : ""}`)
    .join(",");
  return (
    await db.query(`select public.jlv_${name}(${params}) as result`, args)
  ).rows[0].result;
}
async function create() {
  await as(admin);
  return rpc("create_session", [JSON.stringify(settings)], ["jsonb"]);
}
test("schema is additive/idempotent; anonymous public read but no admin mutation", async () => {
  const session = await create();
  await as(null, "anon");
  assert.equal(await rpc("is_admin"), false);
  assert.equal(
    (await rpc("get_session", [session.id], ["uuid"])).status,
    "ready",
  );
  await assert.rejects(
    () => rpc("set_status", [session.id, "open"], ["uuid", "text"]),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select * from public.jlv_admins"),
    /permission denied/,
  );
});
test("audiences cannot change status, edit teams, create shows, set counts or forge ballots", async () => {
  const session = await create();
  await as(audience(0));
  await assert.rejects(
    () => rpc("set_status", [session.id, "open"], ["uuid", "text"]),
    /管理員/,
  );
  await assert.rejects(
    () =>
      rpc(
        "save_session",
        [session.id, JSON.stringify(settings)],
        ["uuid", "jsonb"],
      ),
    /管理員/,
  );
  await assert.rejects(
    () => rpc("create_session", [JSON.stringify(settings)], ["jsonb"]),
    /管理員/,
  );
  await assert.rejects(
    () =>
      db.query(
        "update public.jlv_sessions set counts=array[999,999] where id=$1",
        [session.id],
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into public.jlv_votes(session_id,voter_id,team) values ($1,$2,'blue')",
        [session.id, audience(1)],
      ),
    /permission denied/,
  );
});
test("150 database voters plus retries count exactly once and cutoff recount is authoritative", async () => {
  const session = await create();
  await rpc("set_status", [session.id, "open"], ["uuid", "text"]);
  for (let i = 0; i < 150; i++) {
    await as(audience(i));
    const first = await rpc(
      "vote",
      [session.id, i < 81 ? "blue" : "orange"],
      ["uuid", "text"],
    );
    const retry = await rpc(
      "vote",
      [session.id, i < 81 ? "orange" : "blue"],
      ["uuid", "text"],
    );
    assert.equal(first.team, retry.team);
  }
  await as(admin);
  const closed = await rpc(
    "set_status",
    [session.id, "closed"],
    ["uuid", "text"],
  );
  assert.deepEqual(closed.counts, [81, 69]);
  assert.equal(closed.status, "closed");
  const repeated = await rpc(
    "set_status",
    [session.id, "closed"],
    ["uuid", "text"],
  );
  assert.equal(closed.version, repeated.version);
  await assert.rejects(
    () => rpc("set_status", [session.id, "open"], ["uuid", "text"]),
    /不可重開/,
  );
  await as(audience(150));
  await assert.rejects(
    () => rpc("vote", [session.id, "blue"], ["uuid", "text"]),
    /尚未開放或已結束/,
  );
  await as(audience(0));
  const receipt = await rpc("vote", [session.id, "orange"], ["uuid", "text"]);
  assert.equal(receipt.team, "blue");
});
test("RLS exposes only own ballot; admin roster is never queryable", async () => {
  const session = await create();
  await rpc("set_status", [session.id, "open"], ["uuid", "text"]);
  await as(audience(1));
  await rpc("vote", [session.id, "blue"], ["uuid", "text"]);
  await as(audience(2));
  await rpc("vote", [session.id, "orange"], ["uuid", "text"]);
  const rows = (
    await db.query("select * from public.jlv_votes where session_id=$1", [
      session.id,
    ])
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].voter_id, audience(2));
  await assert.rejects(
    () => db.query("select * from public.jlv_admins"),
    /permission denied/,
  );
});
test("vote transaction rejects missing auth, unknown teams and pre-open writes", async () => {
  const session = await create();
  await as(audience(3));
  await assert.rejects(
    () => rpc("vote", [session.id, "blue"], ["uuid", "text"]),
    /尚未開放/,
  );
  await as(admin);
  await rpc("set_status", [session.id, "open"], ["uuid", "text"]);
  await as(audience(3));
  await assert.rejects(
    () => rpc("vote", [session.id, "fake"], ["uuid", "text"]),
    /無效的隊伍/,
  );
  await as(null);
  await assert.rejects(
    () => rpc("vote", [session.id, "blue"], ["uuid", "text"]),
    /身分/,
  );
});
test("configuration cannot mutate an open show and rejects invalid settings", async () => {
  const session = await create();
  await assert.rejects(
    () =>
      rpc(
        "save_session",
        [session.id, JSON.stringify({ ...settings, teams: [] })],
        ["uuid", "jsonb"],
      ),
    /兩支隊伍/,
  );
  const updated = await rpc(
    "save_session",
    [session.id, JSON.stringify({ ...settings, title: "UPDATED" })],
    ["uuid", "jsonb"],
  );
  assert.equal(updated.title, "UPDATED");
  await rpc("set_status", [session.id, "open"], ["uuid", "text"]);
  await assert.rejects(
    () =>
      rpc(
        "save_session",
        [session.id, JSON.stringify(settings)],
        ["uuid", "jsonb"],
      ),
    /不能修改隊伍/,
  );
});
test("separate new sessions preserve old ballots and allow same audience to vote again", async () => {
  const a = await create();
  await rpc("set_status", [a.id, "open"], ["uuid", "text"]);
  await as(audience(4));
  await rpc("vote", [a.id, "blue"], ["uuid", "text"]);
  const b = await create();
  assert.notEqual(a.id, b.id);
  await rpc("set_status", [b.id, "open"], ["uuid", "text"]);
  await as(audience(4));
  await rpc("vote", [b.id, "orange"], ["uuid", "text"]);
  assert.deepEqual((await rpc("get_session", [a.id], ["uuid"])).counts, [1, 0]);
  assert.deepEqual((await rpc("get_session", [b.id], ["uuid"])).counts, [0, 1]);
});
test("audience signal only changes on lifecycle/settings, not each ballot", async () => {
  const s = await create();
  await rpc("set_status", [s.id, "open"], ["uuid", "text"]);
  const signal = async () =>
    (
      await db.query(
        "select version,status from public.jlv_signals where id=$1",
        [s.id],
      )
    ).rows[0];
  const opened = await signal();
  await as(audience(5));
  await rpc("vote", [s.id, "blue"], ["uuid", "text"]);
  assert.deepEqual(await signal(), opened);
  await as(admin);
  await rpc("set_status", [s.id, "closed"], ["uuid", "text"]);
  const closed = await signal();
  assert.equal(closed.status, "closed");
  assert.ok(closed.version > opened.version);
});
