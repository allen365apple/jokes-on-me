import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
test("fixed room: 150 browsers, duplicates, cutoff, idempotent next round and permissions", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated;");
    const sql = await readFile(
      new URL("../supabase-live.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const secret = (
      await db.query(
        "select secret from public.jlv_live_private where id='main'",
      )
    ).rows[0].secret;
    const state = async (device) =>
      (
        await db.query("select public.jlv_live_state($1) as r", [
          device || null,
        ])
      ).rows[0].r;
    const command = async (round, op, id = randomUUID(), token = secret) =>
      (
        await db.query("select public.jlv_live_command($1,$2,$3,$4) as r", [
          token,
          round,
          op,
          id,
        ])
      ).rows[0].r;
    const vote = async (round, device, team) =>
      (
        await db.query("select public.jlv_live_vote($1,$2,$3) as r", [
          round,
          device,
          team,
        ])
      ).rows[0].r;
    let s = (await state()).session;
    const first = s.id,
      device = randomUUID();
    await assert.rejects(() => vote(first, device, "blue"), /尚未開放或已截止/);
    await assert.rejects(
      () => command(first, "open", randomUUID(), "wrong"),
      /操作碼/,
    );
    s = await command(first, "open");
    const people = Array.from({ length: 150 }, randomUUID);
    for (let i = 0; i < 150; i++) {
      await vote(first, people[i], i < 82 ? "blue" : "orange");
      await vote(first, people[i], "orange");
    }
    assert.deepEqual((await state(people[0])).session.counts, [82, 68]);
    assert.equal((await state(people[0])).team, "blue");
    s = await command(first, "close");
    assert.deepEqual(s.counts, [82, 68]);
    await assert.rejects(() => vote(first, device, "blue"), /已截止/);
    const request = randomUUID();
    s = await command(first, "restart", request);
    assert.equal(s.status, "open");
    assert.equal(s.round, 2);
    assert.deepEqual(s.counts, [0, 0]);
    assert.equal((await command(first, "restart", request)).id, s.id);
    await assert.rejects(() => vote(first, device, "blue"), /下一輪/);
    await vote(s.id, people[0], "orange");
    assert.deepEqual((await state()).session.counts, [0, 1]);
    await db.exec("set role anon");
    await assert.rejects(
      () => db.query("select * from public.jlv_live_private"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from public.jlv_live_ballots"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update public.jlv_live_room set snapshot='{}'"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
