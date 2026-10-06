// play.js — LOST AGES main menu.
//
//   node scripts/play.js          (or double-click "Play Lost Ages.bat")
//
// Opens the main menu in your browser:  Play → pick your character → ENTER THE WORLD.
// The open world (src/world/World.js) runs here: you and 4 companions explore, fight mob camps
// and loot gear. Walk up to a boss gate and press E to take your 20-player raid inside — the raid
// runs scripts/simulate.js in the background with --play <your character>, and "Back to the world"
// brings you out again with whatever you looted.
// The Raid finder in the menu still jumps straight into a raid without walking there.
//
// Press Ctrl+C in this window to quit the game.

console.log("⚔  Starting Lost Ages…");

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { startViewerServer, openBrowser } = require("../src/replay/viewerServer");
const BOSSES = require("../src/data/bosses");
const CLASSES = require("../src/classes");
const { Gear } = require("../src/items/Gear");
const { SKILL_PROFILES } = require("../src/ai/skillProfiles");
const { CORE_MEMBERS, RENAMED } = require("../src/config/roster");
const { World } = require("../src/world/World");
const { loadBots, saveBots, pickParty } = require("../src/world/party");
const { HumanController } = require("../src/ai/HumanController");

const ROOT = path.join(__dirname, "..");
const MENU = path.join(ROOT, "viewer", "menu.html");
const SIMULATE = path.join(__dirname, "simulate.js");
const MENU_PORT = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 3000);

const CLASS_NAMES = ["Knight", "Valkyrie", "Healer", "Druid", "Warrior", "Rogue", "Mage", "Necromancer"];

// ---------- Game data the menu shows ----------
const raidSizeFor = (bossKey) => BOSSES[bossKey]?.recommended?.raidSize || 5;
const saveFileFor = (size) => path.join(ROOT, "saves", size === 5 ? "party.json" : `raid-${size}.json`);

function classInfo() {
  const out = {};
  for (const cls of CLASS_NAMES) {
    const c = new CLASSES[cls]("preview", 60);
    out[cls] = {
      role: c.role,
      resource: c.resource.name,
      abilities: Object.entries(c.abilities).map(([key, a]) => ({ key, name: a.name, cooldown: a.cooldown || 0, castTime: a.castTime || 0 })),
    };
  }
  return out;
}

function bossList() {
  return Object.entries(BOSSES).map(([key, b]) => ({
    key, name: b.name, level: b.recommended?.level || 20, raidSize: raidSizeFor(key), power: b.statMultiplier,
  }));
}

// Your raid as it's saved on disk (or just the core four if you haven't played yet)
function roster(bossKey) {
  const size = raidSizeFor(bossKey);
  const file = saveFileFor(size);
  const info = classInfo();
  if (!fs.existsSync(file)) {
    return {
      saved: false, raidSize: size,
      members: Object.entries(CORE_MEMBERS).map(([name, className]) => ({ name, className, role: info[className].role, ilvl: 0, skill: "Casual", core: true, kills: 0, attempts: 0 })),
    };
  }
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = new Set(saved.map(s => s.name));
  return {
    saved: true, raidSize: size,
    members: saved.map(s => {
      const name = RENAMED[s.name] && !names.has(RENAMED[s.name]) ? RENAMED[s.name] : s.name;   // shown with their new name
      let ilvl = 0;
      try { ilvl = Gear.fromJSON(s.gear).itemLevel(); } catch { /* old save format */ }
      return {
        name, className: s.className, role: info[s.className]?.role || "dps", ilvl,
        skill: SKILL_PROFILES[s.skill]?.label || s.skill, potential: SKILL_PROFILES[s.potential]?.label || s.potential,
        core: name in CORE_MEMBERS, kills: s.kills || 0, attempts: s.attempts || 0,
      };
    }),
  };
}

// ---------- The fight running in the background ----------
let fight = null;   // { child, url, boss, character, output: [] }

function stopFight() {
  if (!fight) return Promise.resolve();
  const { child } = fight;
  fight = null;
  if (child.exitCode != null) return Promise.resolve();
  return new Promise(resolve => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 3000);
  });
}

async function startFight({ boss, character, fresh, menuUrl }) {
  if (!BOSSES[boss]) throw new Error(`Unknown raid "${boss}"`);
  await stopFight();
  const args = [SIMULATE, "--boss", boss, "--port", String(MENU_PORT + 1), "--noopen", "--menu", menuUrl || `http://localhost:${menu.port}/`];
  if (character) args.push("--play", character);
  if (fresh) args.push("--fresh");
  console.log(`\n▶ Starting: ${BOSSES[boss].name}${character ? ` — you are ${character}` : " — spectating"}${fresh ? " (brand new raid)" : ""}`);
  const child = spawn(process.execPath, args, { cwd: ROOT });
  const me = { child, url: null, boss, character, output: [] };
  fight = me;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The fight took too long to start. Check this window for errors.")), 45000);
    const onLine = (line) => {
      process.stdout.write(line + "\n");   // the combat log still shows in this window
      me.output.push(line);
      if (me.output.length > 60) me.output.shift();
      const m = !me.url && line.match(/fight viewer: (http:\/\/localhost:\d+)/);
      if (m) { me.url = m[1]; clearTimeout(timer); resolve(me); }
    };
    let buf = "";
    const read = (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      lines.forEach(onLine);
    };
    child.stdout.setEncoding("utf8"); child.stdout.on("data", read);
    child.stderr.setEncoding("utf8"); child.stderr.on("data", read);
    child.on("exit", (code) => {
      if (buf) onLine(buf);
      if (fight === me) fight = null;
      clearTimeout(timer);
      if (!me.url) reject(new Error(me.output.slice(-6).join("\n") || `The fight stopped (code ${code})`));
    });
  });
}

// ---------- The open world ----------
const WORLD_SAVE = saveFileFor(raidSizeFor(Object.keys(BOSSES)[0]));   // the same raid you take into the bosses
let world = null;   // { w, bots, party, character, human, timer }

// No raid saved yet (or a fresh start): recruit a new one first
function ensureSave(fresh) {
  if (!fresh && fs.existsSync(WORLD_SAVE)) return Promise.resolve();
  console.log("\n🛡  Recruiting a new raid…");
  const boss = Object.keys(BOSSES)[0];
  const child = spawn(process.execPath, [SIMULATE, String(BOSSES[boss].statMultiplier), "60", "0", "--boss", boss, "--fast", "--quiet", ...(fresh ? ["--fresh"] : [])], { cwd: ROOT, stdio: "ignore" });
  return new Promise((resolve, reject) => child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Couldn't create a new raid"))));
}

function stopWorldLoop() { if (world?.timer) { clearInterval(world.timer); world.timer = null; } }
function startWorldLoop() {
  stopWorldLoop();
  let last = Date.now(), carry = 0;
  world.timer = setInterval(() => {   // real time, 20 ticks a second
    const now = Date.now();
    carry += Math.min(0.25, (now - last) / 1000); last = now;
    while (carry >= 0.05) { carry -= 0.05; try { world.w.tick(0.05); } catch (err) { console.log("World error:", err); } }
  }, 50);
}

// Build (or rebuild) the world around your party. `at` = where to stand (outside a boss gate after a raid)
function buildWorld(character, at = null) {
  const bots = loadBots(WORLD_SAVE);
  const party = pickParty(bots, character);
  const human = new HumanController();
  human.take(party[0].name);
  human.onResult = (r) => menu.broadcast({ type: "castResult", ...r });
  const w = new World({ bots: party, human, live: menu, onSave: () => saveBots(WORLD_SAVE, bots) });
  if (at) w.placeAt(at);
  world = { w, bots, party, character: party[0].name, human, timer: null };
  menu.onControl = (name) => {
    if (name && name !== world.character) return { ok: false, reason: `In the open world you play ${world.character}` };
    human.take(name);
    return { ok: true };
  };
  menu.onInput = (msg) => human.input(msg);
  menu.controlled = world.character;
  menu.broadcast({ type: "control", name: world.character, playable: true });
  startWorldLoop();
  console.log(`\n🌍 Open world: you are ${world.character} — with ${party.slice(1).map(b => b.name).join(", ")}`);
}

async function startWorld(character, fresh) {
  await stopFight();
  stopWorldLoop();
  if (world && !world.inRaid) saveBots(WORLD_SAVE, world.bots);
  await ensureSave(fresh);
  buildWorld(character);
}

// Leave the raid: everyone comes back out of the gate with their new gear
async function resumeWorld() {
  if (!world) return false;
  if (world.inRaid) {
    await stopFight();
    const door = world.inRaid;
    const back = { x: door.x - Math.cos(door.angle) * 12, y: door.y - Math.sin(door.angle) * 12 };
    buildWorld(world.character, back);
  } else if (!world.timer) startWorldLoop();
  menu.controlled = world.character;
  return true;
}

async function enterRaid(boss) {
  if (!world) throw new Error("You're not in the world");
  const me = world.party[0].character;
  const door = world.w.doorNear(me, 14);
  if (!door || door.boss !== boss) throw new Error("Walk up to the gate first");
  if (world.w.engaged().length) throw new Error("You can't enter while you're in combat");
  saveBots(WORLD_SAVE, world.bots);
  stopWorldLoop();
  world.inRaid = door;
  menu.onControl = null; menu.onInput = null;
  const worldUrl = `http://localhost:${menu.port}/?live=1&world=1&menu=${encodeURIComponent("/")}`;
  try {
    const f = await startFight({ boss, character: world.character, menuUrl: worldUrl });
    return `${f.url}/?live=1&menu=${encodeURIComponent(worldUrl)}`;
  } catch (err) {
    world.inRaid = null;
    buildWorld(world.character, door);
    throw err;
  }
}

// ---------- Web routes for the menu ----------
const json = (res, status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

function routes(req, res, url) {
  const viewerPage = /[?&](live|world|replay|showcase)=/.test(req.url);   // "/?live=1&world=1" is the 3D world, not the menu
  if ((url === "/" && !viewerPage) || url === "/menu") {
    fs.readFile(MENU, (err, data) => {
      res.writeHead(err ? 500 : 200, { "Content-Type": err ? "text/plain" : "text/html; charset=utf-8" });
      res.end(err ? "viewer/menu.html not found" : data);
    });
    return true;
  }
  if (url === "/api/game") {
    const q = new URL(req.url, "http://x").searchParams;
    const bosses = bossList();
    const boss = BOSSES[q.get("boss")] ? q.get("boss") : bosses[0].key;
    try {
      json(res, 200, {
        bosses, classes: classInfo(), roster: roster(boss), boss,
        running: fight?.url && !world?.inRaid ? { url: fight.url, boss: fight.boss, character: fight.character } : null,
        world: world ? { character: world.character, inRaid: !!world.inRaid } : null,
      });
    } catch (err) {   // show the problem in the menu (and here) instead of crashing
      console.log("\n⚠  Couldn't load the game data:\n", err);
      json(res, 500, { error: err.stack || String(err) });
    }
    return true;
  }
  if (req.method === "POST" && url === "/api/quit") {   // "Quit game" in the menu
    json(res, 200, { ok: true });
    console.log("\nThanks for playing Lost Ages!");
    setTimeout(quit, 200);
    return true;
  }
  if (process.env.LOST_AGES_DEV && url === "/api/dev/tp" && world) {   // testing only: move the party
    const q = new URL(req.url, "http://x").searchParams;
    world.w.placeAt({ x: Number(q.get("x")), y: Number(q.get("y")) });
    json(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && url.startsWith("/api/world")) {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 5000) req.destroy(); });
    req.on("end", async () => {
      try {
        const msg = JSON.parse(body || "{}");
        if (url === "/api/world") {                       // Enter world (from the menu)
          await startWorld(msg.character, !!msg.fresh);
          return json(res, 200, { ok: true, url: `/?live=1&world=1&menu=${encodeURIComponent("/")}` });
        }
        if (url === "/api/world/resume") return json(res, 200, { ok: await resumeWorld() });
        if (url === "/api/world/enter") return json(res, 200, { ok: true, url: await enterRaid(msg.boss) });
        json(res, 404, { ok: false, reason: "Unknown request" });
      } catch (err) {
        console.log("World:", err.message);
        json(res, 200, { ok: false, reason: err.message });
      }
    });
    return true;
  }
  if (req.method === "POST" && (url === "/api/start" || url === "/api/stop")) {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 5000) req.destroy(); });
    req.on("end", async () => {
      try {
        if (url === "/api/stop") { await stopFight(); return json(res, 200, { ok: true }); }
        const msg = JSON.parse(body || "{}");
        if (world) {   // Raid finder: leave the world (keeping what you looted)
          stopWorldLoop();
          if (!world.inRaid) saveBots(WORLD_SAVE, world.bots);
          world = null; menu.onControl = null; menu.onInput = null;
        }
        const f = await startFight({ boss: msg.boss, character: msg.character || null, fresh: !!msg.fresh });
        const page = `${f.url}/?live=1&menu=${encodeURIComponent(`http://localhost:${menu.port}/`)}`;
        json(res, 200, { ok: true, url: page });
      } catch (err) {
        json(res, 200, { ok: false, reason: err.message });
      }
    });
    return true;
  }
  return false;   // everything else (3d.html's files, models, textures...) is served as usual
}

let menu = null;
if (!fs.existsSync(MENU)) console.log("⚠  viewer/menu.html is missing — put menu.html in the viewer folder.");
startViewerServer({ port: MENU_PORT, routes }).then(server => {
  menu = server;
  console.log(`\n⚔  LOST AGES — main menu: ${server.url()}`);
  console.log(`   (If your browser doesn't open, paste that link into it. Press Ctrl+C here to quit.)`);
  openBrowser(server.url());
}).catch(err => { console.log("Couldn't start the menu:", err.message); process.exit(1); });

const quit = () => {
  if (world && !world.inRaid) { stopWorldLoop(); try { saveBots(WORLD_SAVE, world.bots); } catch {} }   // (a raid saves its own loot)
  stopFight().then(() => process.exit(0));
};
process.on("SIGINT", quit);
process.on("SIGTERM", quit);