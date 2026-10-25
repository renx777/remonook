import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist", import.meta.url)),
  portIndex = process.argv.indexOf("--port"),
  port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4173;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Choose a port between 1024 and 65535");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!(await stat(file)).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is in use. Try: node scripts/serve.mjs --port 4174`
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Remo is ready at http://127.0.0.1:${port}\nKeep this terminal open. Press Ctrl+C to stop.\nUse the same address and browser to access your saved notes.`,
  ),
);
