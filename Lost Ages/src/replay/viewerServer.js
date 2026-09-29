// viewerServer.js — the web server behind the fight viewer.
// Used by scripts/viewer.js (watch saved replays) and scripts/simulate.js (watch fights LIVE).
// No extra packages needed — uses Node's built-in http module.
//
// Routes:
//   /               the viewer page (viewer/index.html)
//   /api/replays    list of saved replays, newest first
//   /replays/<file> one saved replay
//   /live           live fight stream (Server-Sent Events)

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const VIEWER = path.join(ROOT, "viewer", "index.html");
const REPLAYS = path.join(ROOT, "replays");

function startViewerServer({ port = 3000 } = {}) {
  const clients = new Set();     // browsers watching live
  let liveData = null;           // the fight currently playing (so late viewers can catch up)
  let viewerWaiters = [];

  const send = (res, status, type, body) => {
    res.writeHead(status, { "Content-Type": type });
    res.end(body);
  };

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);

    if (url === "/" || url === "/index.html") {
      return fs.readFile(VIEWER, (err, data) =>
        err ? send(res, 500, "text/plain", "viewer/index.html not found") : send(res, 200, "text/html; charset=utf-8", data));
    }

    if (url === "/api/replays") {
      if (!fs.existsSync(REPLAYS)) return send(res, 200, "application/json", "[]");
      const files = fs.readdirSync(REPLAYS)
        .filter(f => f.endsWith(".json") && f !== "latest.json")
        .map(f => ({ f, t: fs.statSync(path.join(REPLAYS, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .map(x => x.f);
      return send(res, 200, "application/json", JSON.stringify(files));
    }

    if (url.startsWith("/replays/")) {
      const name = path.basename(url);             // basename blocks "../" tricks
      const file = path.join(REPLAYS, name);
      if (!name.endsWith(".json") || !fs.existsSync(file)) return send(res, 404, "text/plain", "Replay not found");
      res.writeHead(200, { "Content-Type": "application/json" });
      return fs.createReadStream(file).pipe(res);
    }

    // Live stream: the browser keeps this connection open and receives fight updates
    if (url === "/live") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
      if (liveData) res.write(`data: ${JSON.stringify({ type: "start", data: liveData })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      viewerWaiters.forEach(fn => fn());
      viewerWaiters = [];
      return;
    }

    send(res, 404, "text/plain", "Not found");
  });

  // Keep live connections from timing out
  const keepAlive = setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 15000);
  keepAlive.unref();

  const api = {
    port,
    url: () => `http://localhost:${api.port}`,

    // Send a message to every browser watching live
    broadcast(msg) {
      const line = `data: ${JSON.stringify(msg)}\n\n`;
      for (const c of clients) c.write(line);
    },

    // A new fight is starting — remember it so late viewers can catch up
    startFight(data) {
      liveData = data;
      api.broadcast({ type: "start", data });
    },

    // Wait until a browser connects (or give up after `ms`)
    waitForViewer(ms = 8000) {
      if (clients.size) return Promise.resolve(true);
      return new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), ms);
        viewerWaiters.push(() => { clearTimeout(timer); resolve(true); });
      });
    },

    viewerCount: () => clients.size,
    close: () => { clearInterval(keepAlive); server.close(); },
  };

  // If the port is busy (e.g. the viewer is already running), try the next ones
  return new Promise((resolve, reject) => {
    const tryListen = (p, triesLeft) => {
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && triesLeft > 0) tryListen(p + 1, triesLeft - 1);
        else reject(err);
      });
      server.listen(p, () => { api.port = p; resolve(api); });
    };
    tryListen(port, 10);
  });
}

// Open a web page in the user's default browser (Windows, Mac or Linux)
function openBrowser(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {}); // ignore errors — the URL is also printed in the terminal
}

module.exports = { startViewerServer, openBrowser };