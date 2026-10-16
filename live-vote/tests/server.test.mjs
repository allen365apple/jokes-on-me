import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewServer } from "../dev-server.mjs";
test("preview only exposes intended web assets, never neighboring project files", async () => {
  const server = createPreviewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of [
      "/live-vote/",
      "/live-vote/vote.html",
      "/live-vote/core.mjs",
      "/love-improv/profiles/thumbs/傑哥.jpg",
      "/love-improv/vendor/qrcode.js",
    ])
      assert.equal((await fetch(base + path)).status, 200, path);
    for (const path of [
      "/live-vote/supabase-setup.sql",
      "/fwb-quiz/home.html",
      "/.git/config",
      "/live-vote/node_modules/@electric-sql/pglite/package.json",
      "/live-vote/../README.md",
    ])
      assert.equal((await fetch(base + path)).status, 404, path);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
