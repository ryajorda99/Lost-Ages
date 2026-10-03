// viewerServer.js — the web server behind the fight viewer.
// Used by scripts/viewer.js (watch saved replays) and scripts/simulate.js (watch fights LIVE).
// No extra packages needed — uses Node's built-in http module.
//
// Routes:
//   /               the 3D viewer page (viewer/3d.html) — the default
//   /2d             the old top-down 2D viewer (viewer/index.html)
//   /<file>         any other file in the viewer/ folder (effects.js, models/knight.glb...)
//   /api/replays    list of saved replays, newest first
//   /api/models     list of 3D model files in viewer/models/
//   /replays/<file> one saved replay
//   /live           live fight stream (Server-Sent Events)
//   POST /api/control  { name }  take control of a raid member (name: null to hand it back to the bot)
//   POST /api/input    { move, cast, enemyTarget, allyTarget }  your keyboard/mouse input while playing

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const VIEWER_DIR = path.join(ROOT, "viewer");
const VIEWER_3D = path.join(VIEWER_DIR, "3d.html");
const VIEWER_2D = path.join(VIEWER_DIR, "index.html");

// File types the browser needs to know about (3D models are .glb / .gltf)
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css",
  ".json": "application/json", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ktx2": "image/ktx2",
};
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

    if (url === "/" || url === "/3d" || url === "/2d" || url === "/index.html") {
      const file = url === "/2d" || url === "/index.html" ? VIEWER_2D : VIEWER_3D;
      return fs.readFile(file, (err, data) =>
        err ? send(res, 500, "text/plain", `viewer/${path.basename(file)} not found`) : send(res, 200, "text/html; charset=utf-8", data));
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

    // Which 3D models are in viewer/models/ (the 3D viewer uses them instead of the placeholder figures)
    if (url === "/api/models") {
      const dir = path.join(VIEWER_DIR, "models");
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(glb|gltf)$/i.test(f)) : [];
      return send(res, 200, "application/json", JSON.stringify(files));
    }

    // Playing a character yourself: the browser sends control + input here
    if (req.method === "POST" && (url === "/api/control" || url === "/api/input")) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; if (body.length > 10000) req.destroy(); });
      req.on("end", () => {
        let msg = {};
        try { msg = JSON.parse(body || "{}"); } catch { return send(res, 400, "text/plain", "bad JSON"); }
        if (url === "/api/control") {
          if (!api.onControl) return send(res, 409, "application/json", JSON.stringify({ ok: false, reason: "No live fight running" }));
          const result = api.onControl(msg.name ?? null) || { ok: true };
          if (result.ok) { api.controlled = msg.name ?? null; api.broadcast({ type: "control", name: api.controlled }); }
          return send(res, 200, "application/json", JSON.stringify(result));
        }
        api.onInput?.(msg);
        send(res, 204, "text/plain", "");
      });
      return;
    }

    // Live stream: the browser keeps this connection open and receives fight updates
    if (url === "/live") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
      if (liveData) res.write(`data: ${JSON.stringify({ type: "start", data: liveData })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "control", name: api.controlled ?? null, playable: !!api.onControl })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      viewerWaiters.forEach(fn => fn());
      viewerWaiters = [];
      return;
    }

    // Any other file inside the viewer/ folder: 3d.html, effects.js, models/*.glb, textures...
    const file = path.join(VIEWER_DIR, path.normalize(url));
    if (file.startsWith(VIEWER_DIR + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(file).pipe(res);
    }

    send(res, 404, "text/plain", "Not found");
  });

  // Keep live connections from timing out
  const keepAlive = setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 15000);
  keepAlive.unref();

  const api = {
    port,
    controlled: null,   // name of the raid member a human is playing (or null)
    onControl: null,    // set by simulate.js: (name) => { ok, reason }
    onInput: null,      // set by simulate.js: (input) => void
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