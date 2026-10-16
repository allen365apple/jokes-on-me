import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";
import { ROSTER } from "./core.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "index.html",
  "vote.html",
  "style.css",
  "stage.mjs",
  "vote.mjs",
  "ui.mjs",
  "core.mjs",
  "store.mjs",
  "room-store.mjs",
  "reveal.mjs",
  "config.mjs",
  "vendor/supabase.js",
];
const allowed = new Set(files.map((name) => "/live-vote/" + name));
allowed.add("/love-improv/vendor/qrcode.js");
for (const name of ROSTER)
  allowed.add(`/love-improv/profiles/thumbs/${name}.jpg`);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
};

/** Local preview serves only public page assets, never SQL, credentials or neighboring files. */
export function createPreviewServer() {
  return createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      let path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (path === "/" || path === "/live-vote/")
        path = "/live-vote/index.html";
      if (!allowed.has(path)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const body = await readFile(resolve(projectRoot, "." + path));
      res.writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.LIVE_VOTE_PORT || 8765);
  const server = createPreviewServer();
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `連接埠 ${port} 已使用，請設定 LIVE_VOTE_PORT 換一個埠。`
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `看我笑話本機預覽：http://127.0.0.1:${port}/live-vote/\n僅本機排練，不公開提供手機連線。按 Ctrl+C 關閉。`,
    ),
  );
}
